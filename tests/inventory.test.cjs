const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const zlib=require('node:zlib');
const vm=require('node:vm');
const {STOCK_FIELDS,STOCK_DISPLAY_FIELDS,PRODUCT_FIELDS,PRODUCT_UNITS,planFifo,validDate,filterInventoryItems,stockRiskItems,stockAgingRows,sixMonthsAgoDate,salesOrderStatus}=require('../inventory-model.js');
const {CURRENT_STOCK_FIELDS,currentStockRows}=require('../inventory-model.js');

function makeDialogHarness(dialogOptions=[]){
  const elements=new Map(),timers=[],observers=[];
  const makeNode=tagName=>{
    const listeners={},attributes={},styleValues={},stylePriorities={},children=[];
    const node={
      nodeType:1,tagName:tagName.toUpperCase(),children,attributes,listeners,parentNode:null,hidden:false,textContent:'',open:false,
      style:{
        setProperty(name,value,priority=''){styleValues[name]=String(value);stylePriorities[name]=priority;this[name]=String(value);this[name+'Priority']=priority;},
        getPropertyValue(name){return styleValues[name]||'';},
        getPropertyPriority(name){return stylePriorities[name]||'';},
        removeProperty(name){delete styleValues[name];delete stylePriorities[name];delete this[name];delete this[name+'Priority'];}
      },
      classList:{
        add(name){const names=new Set(node.className.split(/\s+/).filter(Boolean));names.add(name);node.className=[...names].join(' ');},
        remove(name){node.className=node.className.split(/\s+/).filter(value=>value&&value!==name).join(' ');},
        contains(name){return node.className.split(/\s+/).includes(name);}
      },
      addEventListener(type,listener){listeners[type]=listener;},
      setAttribute(name,value){attributes[name]=String(value);if(name!=='open')node[name]=String(value);if(name==='id')node.id=String(value);},
      getAttribute(name){return attributes[name]??null;},
      appendChild(child){if(child.parentNode)child.remove();children.push(child);child.parentNode=node;return child;},
      append(...nodes){nodes.forEach(child=>node.appendChild(child));},
      insertBefore(child,reference){if(child.parentNode)child.remove();const index=children.indexOf(reference);children.splice(index<0?children.length:index,0,child);child.parentNode=node;return child;},
      remove(){if(!node.parentNode)return;const siblings=node.parentNode.children,index=siblings.indexOf(node);if(index>=0)siblings.splice(index,1);node.parentNode=null;},
      matches(selector){return selector==='dialog'&&node.tagName==='DIALOG';},
      querySelectorAll(){return[];},
      setPointerCapture(){}
    };
    node.style=new Proxy(node.style,{
      set(target,name,value){target[name]=value;if(typeof name==='string'&&!['setProperty','getPropertyValue','getPropertyPriority','removeProperty'].includes(name))styleValues[name]=String(value);return true;},
      deleteProperty(target,name){delete target[name];delete styleValues[name];delete stylePriorities[name];return true;}
    });
    Object.defineProperty(node,'className',{get(){return attributes.class||'';},set(value){attributes.class=String(value);}});
    node.handlers=listeners;
    node.dispatch=(type,event={})=>listeners[type]?.(event);
    return node;
  };
  const body=makeNode('body');
  const dialogs=dialogOptions.map(options=>{
    const dialog=makeNode('dialog');dialog.id=options.id||'test-dialog';dialog.open=options.open!==false;
    const header=options.header===false?null:makeNode('div'),close=options.close===false?null:makeNode('button');
    const title=options.title===false?null:makeNode('h2');
    if(header){header.className='dialog-header';header.offsetHeight=40;body.appendChild(header);}
    if(title){title.textContent=options.title||'테스트 팝업';if(header)header.appendChild(title);}
    if(close){close.className='close';if(header)header.appendChild(close);}
    dialog.querySelector=selector=>{
      if(selector==='.dialog-header,.calendar-title,[role="toolbar"]')return header;
      if(selector==='.dialog-header,.calendar-title')return header;
      if(selector==='.close')return close;
      if(selector==='h1,h2,h3')return title;
      return null;
    };
    dialog.getBoundingClientRect=()=>{
      const left=parseFloat(dialog.style.getPropertyValue('left')||'100'),top=parseFloat(dialog.style.getPropertyValue('top')||'100');
      const width=parseFloat(dialog.style.getPropertyValue('width')||'600'),height=parseFloat(dialog.style.getPropertyValue('height')||'400');
      return{left,top,right:left+width,bottom:top+height,width,height};
    };
    dialog.showModal=()=>{dialog.open=true;dialog.setAttribute('open','');};
    dialog.close=()=>{if(!dialog.open)return;dialog.open=false;delete dialog.attributes.open;dialog.dispatch('close');};
    elements.set(dialog.id,dialog);return dialog;
  });
  const document={
    body,
    querySelectorAll:selector=>selector==='dialog'?dialogs:[],
    getElementById:id=>{
      if(elements.has(id))return elements.get(id);
      const find=node=>node.id===id?node:node.children.map(find).find(Boolean)||null;
      return find(body);
    },
    createElement:tagName=>makeNode(tagName)
  };
  class TestMutationObserver{
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(target,options){this.target=target;this.options=options;}
    notify(records){this.callback(records);}
  }
  const context=vm.createContext({
    document,window:{innerWidth:1200,innerHeight:900,localStorage:{getItem:key=>elements.get('store:'+key)||null,setItem(key,value){elements.set('store:'+key,value);}}},
    MutationObserver:TestMutationObserver,setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){}
  });
  return{context,dialogs,body,elements,timers,observers,makeNode};
}

test('current stock keeps all workbook fields except opening, receipt and issue totals',()=>{
  assert.deepEqual(CURRENT_STOCK_FIELDS.map(field=>field.label),['품목분류','품번','품명','규격','재질','색상','단위','재고수량','재고단가','재고금액','저장위치','납품업체']);
});
test('all inventory input forms use the selected master unit before quantity',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),transaction=html.match(/<div class="transaction-grid">([\s\S]*?)<\/div><div id="fifo-section"/)[1];
  const optionValues=id=>{
    const select=html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
    return [...select[1].matchAll(/<option>([^<]+)<\/option>/g)].map(match=>match[1]);
  };
  assert.deepEqual(optionValues('info_unit'),PRODUCT_UNITS);
  assert.deepEqual(optionValues('unit'),PRODUCT_UNITS);
  assert.ok(transaction.indexOf('for="unit"')<transaction.indexOf('for="movement_quantity"'));
  assert.match(html,/<label for="info_unit">단위<\/label><select id="info_unit" required>/);
  assert.match(html,/<label for="info_standard_stock_quantity">적정재고 수량<\/label><input id="info_standard_stock_quantity" type="number" required min="1" max="1000000" step="1"/);
  assert.ok(STOCK_DISPLAY_FIELDS.findIndex(field=>field.key==='unit')<STOCK_DISPLAY_FIELDS.findIndex(field=>field.key==='opening_quantity'));
  assert.ok(CURRENT_STOCK_FIELDS.findIndex(field=>field.key==='unit')<CURRENT_STOCK_FIELDS.findIndex(field=>field.key==='stock_quantity'));
});
test('movement form locks a known product unit and resets unknown product input',()=>{
  const nodes=new Map(),context=vm.createContext({PRODUCT_FIELDS,document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,readOnly:false});return nodes.get(id);}}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('items=[{product_code:"SKU",product_category:"RAW",product_name:"Material",specification:"10 x 20",material:"Steel",color:"Silver",unit:"Kg",storage_location:"A-1",supplier:"Vendor"}];mode="receipt";$("product_code").value="SKU";populateProduct()',context);
  assert.equal(nodes.get('product_name').value,'Material');
  assert.equal(nodes.get('specification').value,'10 x 20');
  assert.equal(nodes.get('material').value,'Steel');
  assert.equal(nodes.get('color').value,'Silver');
  assert.equal(nodes.get('unit').value,'Kg');
  assert.equal(nodes.get('unit').disabled,true);
  vm.runInContext('$("specification").value="10 X 20";populateProduct("specification")',context);
  assert.equal(nodes.get('product_code').value,'SKU');
  assert.equal(nodes.get('product_name').value,'Material');
  vm.runInContext('$("specification").value="unknown spec";populateProduct("specification")',context);
  assert.equal(nodes.get('product_code').value,'');
  assert.equal(nodes.get('product_name').value,'');
  assert.equal(nodes.get('specification').value,'unknown spec');
  assert.equal(nodes.get('product_code').readOnly,false);
  vm.runInContext('$("product_code").value="UNKNOWN";populateProduct("product_code")',context);
  assert.equal(nodes.get('unit').value,'EA(개)');
  assert.equal(nodes.get('unit').disabled,false);
});
test('duplicate specifications do not select an arbitrary product',()=>{
  const fields=new Map([['specification',{value:'Shared'}],['product_code',{value:'SKU'}]]);
  const context=vm.createContext({items:[{product_code:'A',specification:'Shared'},{product_code:'B',specification:'Shared'}],document:{getElementById:id=>fields.get(id)}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  assert.equal(vm.runInContext('productForLookup("specification")',context),null);
});
test('movement product selectors offer SKU and specification lookups',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  assert.match(html,/<input id="product_code"[^>]*list="product-codes"/);
  assert.match(html,/<input id="specification"[^>]*list="product-specifications"/);
  assert.match(html,/<datalist id="product-specifications"><\/datalist>/);
});
test('stock entry dialogs hide the history edit shortcut',()=>{
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(app,/button\.id='edit-existing-movement'/);
  assert.match(app,/button\.addEventListener\('click',openMovementHistoryForEdit\)/);
  assert.match(app,/movementListKind=\['opening','receipt','issue'\]\.includes\(kind\)\?kind:''/);
  assert.match(app,/movementListKind==='opening'\?'기초재고 내역'/);
  assert.match(app,/edit-existing-movement'\)\.hidden=true/);
});
test('opening dialog title is registration and does not show the history edit shortcut',()=>{
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(app,/mode==='opening'\?'기초재고 등록':title/);
  assert.match(app,/edit-existing-movement'\)\.hidden=true/);
});
test('receipt dialog uses the registration title and hides its history edit shortcut',()=>{
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(app,/receipt:\['입고등록','입고','입고일자'\]/);
  assert.match(app,/edit-existing-movement'\)\.hidden=true/);
});
test('receipt save asks for missing storage location and supplier before saving',async()=>{
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,readOnly:false,open:false,focused:false,
      showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;}});
    return nodes.get(id);
  };
  const context=vm.createContext({document:{getElementById:element,querySelector:()=>({querySelectorAll:()=>[]})},window:{alert(){}},validDate:()=>true});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'user'};items=[{product_code:'SKU'}];mode='receipt';
    $('product_code').value='SKU';$('movement_quantity').value='1';$('movement_cost').value='2';
    $('movement_date').value='2026-01-01';$('storage_location').value='A-1';`,context);
  await vm.runInContext('saveMovement({preventDefault(){}})',context);
  assert.equal(element('receipt-details-dialog').open,true);
  assert.equal(element('receipt-details-missing').textContent,'납품업체');
});
test('receipt prompt fill action focuses the first missing detail',()=>{
  const nodes=new Map(),element=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',open:false,focused:false,close(){this.open=false;},focus(){this.focused=true;}});
    return nodes.get(id);
  };
  const context=vm.createContext({document:{getElementById:element}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('focusMissingReceiptDetail()',context);
  assert.equal(element('receipt-details-dialog').open,false);
  assert.equal(element('storage_location').focused,true);
});
test('receipt prompt ignore action submits once without reopening the prompt',async()=>{
  const nodes=new Map(),element=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,readOnly:false,open:false,
      showModal(){this.open=true;},close(){this.open=false;},focus(){},requestSubmit(){this.submission=vm.runInContext('saveMovement({preventDefault(){}})',context);}});
    return nodes.get(id);
  };
  const context=vm.createContext({document:{getElementById:element,querySelector:()=>({querySelectorAll:()=>[]})},window:{alert(){}},validDate:()=>true,rpcCalls:0,PRODUCT_FIELDS});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'user'};items=[{product_code:'SKU'}];mode='receipt';
    client={rpc:async()=>{rpcCalls++;return {data:null,error:{message:'test failure'}};}};
    $('product_code').value='SKU';$('movement_quantity').value='1';$('movement_cost').value='2';
    $('movement_date').value='2026-01-01';`,context);
  element('receipt-details-dialog').open=true;
  vm.runInContext('ignoreReceiptDetailsAndSave()',context);
  await element('movement-form').submission;
  assert.equal(vm.runInContext('rpcCalls',context),1);
  assert.equal(element('receipt-details-dialog').open,false);
});
test('issue dialog uses the registration title and hides its history edit shortcut',()=>{
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(app,/issue:\['출고등록','출고','출고일자'\]/);
  assert.match(app,/edit-existing-movement'\)\.hidden=true/);
});
test('all dialogs can be dragged by the header and resized from every edge and corner',()=>{
  const {context,dialogs:[dialog],elements}=makeDialogHarness([{id:'test-dialog'}]);
  const header=dialog.querySelector('.dialog-header,.calendar-title');
  const handles=dialog.children;
  const handlers=header.handlers,style=dialog.style;
  const sizeStore={get:key=>elements.get('store:'+key)};
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('installDialogInteractions()',context);
  const pointer=(currentTarget,clientX,clientY)=>({button:0,pointerId:1,clientX,clientY,currentTarget,target:{closest:()=>null},preventDefault(){}});
  handlers.pointerdown(pointer(header,110,120));
  handlers.pointermove(pointer(header,210,220));
  handlers.pointerup(pointer(header,210,220));
  assert.equal(style.left,'200px');
  assert.equal(style.top,'200px');
  const handle=handles.find(node=>node.className==='dialog-resize-handle');
  const edges=Object.fromEntries(handles.filter(node=>node.className?.includes('dialog-resize-')).map(node=>[node.className.split('-').at(-1),node]));
  assert.equal(handle['aria-label'],'창 크기 조절');
  for(const [side,label] of [['top','위쪽'],['right','오른쪽'],['bottom','아래쪽'],['left','왼쪽']])
    assert.equal(edges[side]['aria-label'],'창 '+label+' 가장자리 크기 조절');
  handle.handlers.pointerdown(pointer(handle,800,600));
  handle.handlers.pointermove(pointer(handle,860,660));
  handle.handlers.pointerup(pointer(handle,860,660));
  assert.equal(style.width,'660px');
  assert.equal(style.height,'460px');
  assert.equal(style.widthPriority,'important');
  assert.equal(style.heightPriority,'important');
  assert.deepEqual(JSON.parse(sizeStore.get('inventory-dialog-size-test-dialog')),{width:660,height:460});
  edges.left.handlers.pointerdown(pointer(edges.left,200,300));
  edges.left.handlers.pointermove(pointer(edges.left,180,300));
  edges.left.handlers.pointerup(pointer(edges.left,180,300));
  assert.equal(style.width,'680px');
  assert.equal(style.left,'180px');
  edges.right.handlers.pointerdown(pointer(edges.right,860,300));
  edges.right.handlers.pointermove(pointer(edges.right,880,300));
  edges.right.handlers.pointerup(pointer(edges.right,880,300));
  assert.equal(style.width,'700px');
  edges.top.handlers.pointerdown(pointer(edges.top,300,200));
  edges.top.handlers.pointermove(pointer(edges.top,300,180));
  edges.top.handlers.pointerup(pointer(edges.top,300,180));
  assert.equal(style.height,'480px');
  assert.equal(style.top,'180px');
  edges.bottom.handlers.pointerdown(pointer(edges.bottom,300,660));
  edges.bottom.handlers.pointermove(pointer(edges.bottom,300,680));
  edges.bottom.handlers.pointerup(pointer(edges.bottom,300,680));
  assert.equal(style.height,'500px');
  assert.deepEqual(JSON.parse(sizeStore.get('inventory-dialog-size-test-dialog')),{width:700,height:500});
});
test('dialogs without a header still receive all four resize edges',()=>{
  const {context,dialogs:[dialog]}=makeDialogHarness([{id:'no-header-dialog',header:false,close:false}]);
  dialog.getBoundingClientRect=()=>({left:40,top:50,right:440,bottom:350,width:400,height:300});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('installDialogInteractions()',context);
  const handles=dialog.children.filter(node=>node.className?.includes('dialog-resize-'));
  assert.equal(handles.length,5,'four side handles and the existing corner handle should be installed');
  assert.deepEqual(handles.slice(1).map(handle=>handle['aria-label']),[
    '창 위쪽 가장자리 크기 조절','창 오른쪽 가장자리 크기 조절',
    '창 아래쪽 가장자리 크기 조절','창 왼쪽 가장자리 크기 조절'
  ]);
});
test('dialogs can be minimized to the restore tray and expanded back to their original size',()=>{
  const {context,dialogs:[dialog],body,timers}=makeDialogHarness([{id:'window-controls-dialog',title:'품목정보'}]);
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('installDialogInteractions()',context);
  const header=dialog.querySelector('.dialog-header,.calendar-title');
  const controls=header.children.find(node=>node.className==='dialog-window-controls');
  const [minimizeButton,expandButton]=controls.children;
  assert.equal(header.children.indexOf(controls)+1,header.children.findIndex(node=>node.className==='close'));

  minimizeButton.dispatch('click');
  assert.equal(dialog.classList.contains('dialog-minimizing'),true);
  const tray=body.children.find(node=>node.id==='minimized-dialogs');
  assert.ok(tray);
  assert.equal(tray.hidden,false);
  assert.equal(tray.children[0].textContent,'품목정보 복원');
  timers[0]();
  assert.equal(dialog.open,false);
  tray.children[0].dispatch('click');
  assert.equal(dialog.open,true);
  assert.equal(tray.hidden,true);
  assert.equal(dialog.__minimized,false);

  dialog.style.setProperty('width','620px','important');
  dialog.style.setProperty('left','120px');
  expandButton.dispatch('click');
  assert.equal(dialog.classList.contains('dialog-expanded'),true);
  assert.equal(dialog.style.getPropertyValue('width'),'');
  assert.equal(expandButton.getAttribute('aria-pressed'),'true');
  expandButton.dispatch('click');
  assert.equal(dialog.classList.contains('dialog-expanded'),false);
  assert.equal(dialog.style.getPropertyValue('width'),'620px');
  assert.equal(dialog.style.getPropertyPriority('width'),'important');
  assert.equal(dialog.style.getPropertyValue('left'),'120px');
  assert.equal(expandButton.getAttribute('aria-pressed'),'false');
});
test('dialogs added after initialization receive popup controls and resize handles',()=>{
  const {context,body,observers,makeNode}=makeDialogHarness();
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('installDialogInteractions()',context);
  assert.equal(observers.length,1);
  const dialog=makeNode('dialog');dialog.id='dynamic-dialog';dialog.open=true;
  const header=makeNode('div');header.className='dialog-header';
  const close=makeNode('button');close.className='close';header.appendChild(close);
  dialog.querySelector=selector=>selector==='.dialog-header,.calendar-title,[role="toolbar"]'||selector==='.dialog-header,.calendar-title'?header:selector==='.close'?close:null;
  dialog.getBoundingClientRect=()=>({left:0,top:0,right:400,bottom:300,width:400,height:300});
  body.appendChild(dialog);
  observers[0].notify([{type:'childList',addedNodes:[dialog]}]);
  assert.ok(header.children.some(node=>node.className==='dialog-window-controls'));
  assert.equal(dialog.children.filter(node=>node.className?.includes('dialog-resize-')).length,5);
});
test('dialog sizes restore from browser storage and fit the current viewport',()=>{
  const {context,dialogs:[dialog],elements}=makeDialogHarness([{id:'saved-dialog',header:false,close:false}]);
  const style=dialog.style;
  elements.set('store:inventory-dialog-size-saved-dialog',JSON.stringify({width:900,height:700}));
  context.window.innerWidth=600;context.window.innerHeight=500;
  dialog.getBoundingClientRect=()=>({width:400,height:300});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('installDialogInteractions()',context);
  assert.equal(style.width,'568px');
  assert.equal(style.height,'468px');
  assert.equal(style.widthPriority,'important');
  assert.equal(style.heightPriority,'important');
});
test('popup layout keeps desktop size and mobile initial sizing while showing resize control',()=>{
  const css=fs.readFileSync('inventory.css','utf8'),resizeCss=fs.readFileSync('dialog-resize.css','utf8'),html=fs.readFileSync('inventory.html','utf8');
  assert.match(css,/@media screen and \(min-width:851px\)\{\s*dialog:not\(\.search-calendar\)\{[\s\S]*?width:66\.6667vw!important;height:66\.6667vh!important/);
  assert.match(css,/@media screen and \(max-width:850px\)\{\s*dialog:not\(\.search-calendar\)\{[\s\S]*?width:var\(--popup-width,calc\(100vw - 32px\)\)!important;height:auto!important;aspect-ratio:16\/9/);
  assert.match(css,/\.dialog-resize-handle\{[\s\S]*?cursor:nwse-resize/);
  assert.match(resizeCss,/\.dialog-resize-top,\.dialog-resize-bottom\{[^}]*width:auto;height:12px;cursor:ns-resize/);
  assert.match(resizeCss,/\.dialog-resize-left,\.dialog-resize-right\{[^}]*width:12px;height:auto;cursor:ew-resize/);
  assert.match(resizeCss,/\.dialog-window-controls\{[^}]*gap:36px;[^}]*margin-left:auto;[^}]*margin-right:28\.8px;[^}]*padding-left:36px/);
  assert.match(resizeCss,/\.dialog-window-controls\+\.close\{margin-left:0!important/);
  assert.match(resizeCss,/dialog \.dialog-header\{column-gap:32px\}/);
  assert.match(resizeCss,/dialog \.product-list-toolbar,dialog \.dialog-header-actions,dialog \.print-toolbar\{gap:16px\}/);
  assert.match(resizeCss,/dialog \.vendor-query-toolbar\{gap:9px\}/);
  assert.match(resizeCss,/dialog \.vendor-toolbar\{gap:13px\}/);
  assert.match(resizeCss,/@media\(max-width:600px\)\{dialog \.vendor-toolbar\{gap:5\.2px\}\}/);
  assert.match(resizeCss,/@media screen\{\s*dialog \.dialog-header,\.search-calendar \.calendar-title,#app-layout main>\.intro\{\s*background-color:#454e54;color:#fff\s*\}[\s\S]*?dialog \.dialog-header h2,dialog \.dialog-header p,\.search-calendar \.calendar-title strong,#app-layout main>\.intro h1,#app-layout main>\.intro p,#app-layout main>\.intro #today\{\s*color:#fff\s*\}[\s\S]*?dialog thead th,#app-layout main table th\{\s*background-color:rgba\(69,78,84,\.1\)!important;color:#424a50!important\s*\}\s*\}/);
  assert.doesNotMatch(resizeCss,/dialog \.dialog-header\{[^}]*background-color:#41494e/);
  assert.match(resizeCss,/dialog \.close\{[\s\S]*?display:inline-flex;align-items:center;justify-content:center;text-align:center;[\s\S]*?letter-spacing:10px;text-indent:10px;[\s\S]*?width:62\.4px!important;min-width:62\.4px/);
  assert.match(resizeCss,/dialog \.dialog-header \.close\{[\s\S]*?width:calc\(3\.9em \+ 69\.81px\)!important;min-width:calc\(3\.9em \+ 69\.81px\);[\s\S]*?padding-left:0;padding-right:0/);
  assert.match(resizeCss,/dialog \.vendor-query-toolbar \.close\{width:131\.04px!important;min-width:131\.04px\}/);
  assert.match(resizeCss,/\.dialog-minimize-icon\{[^}]*height:1\.53px;background:currentColor;transform:scale\(1\.5\);color:#fff/);
  assert.match(resizeCss,/\.dialog-expand-icon\{[^}]*width:14px;height:14px;border:3\.06px solid currentColor;color:#fff/);
  assert.match(resizeCss,/\.dialog-expanded \.dialog-expand-icon\{[\s\S]*?width:19\.8px;height:28\.05px;border:0;background-color:transparent;[\s\S]*?background-image:url\('\/popup-expand-icon\.png'\);background-position:center;background-repeat:no-repeat;background-size:19\.8px 28\.05px/);
  assert.doesNotMatch(resizeCss,/\.dialog-expand-icon::after/);
  const icon=fs.readFileSync('popup-expand-icon.png'),iconChunks=[];
  assert.deepEqual([...icon.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(icon.readUInt32BE(16),12);
  assert.equal(icon.readUInt32BE(20),17);
  assert.equal(icon[25],6);
  for(let offset=8;offset<icon.length;){
    const length=icon.readUInt32BE(offset),type=icon.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')iconChunks.push(icon.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const iconPixels=zlib.inflateSync(Buffer.concat(iconChunks));
  let hasVisibleWhitePixel=false;
  for(let y=0;y<17;y++){
    const rowStart=y*49;
    assert.equal(iconPixels[rowStart],0);
    for(let x=0;x<12;x++){
      const offset=rowStart+1+x*4;
      if(iconPixels[offset+3]===0)continue;
      hasVisibleWhitePixel=true;
      assert.deepEqual([...iconPixels.subarray(offset,offset+4)],[255,255,255,255]);
    }
  }
  assert.ok(hasVisibleWhitePixel);
  assert.match(html,/dialog-resize\.css\?v=[^"]*popup-expand-icon-white-165/);
});
test('product information form autofills existing item by SKU or unique specification',()=>{
  const nodes=new Map(),context=vm.createContext({document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',options:[{textContent:''}]});return nodes.get(id);}}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('items=[{product_code:"SKU",product_category:"RAW",product_name:"Material",specification:"10 x 20",material:"Steel",color:"Silver",unit:"Kg",standard_stock_quantity:50}]',context);
  vm.runInContext('$("info_product_code").value="SKU";populateProductInfo("info_product_code")',context);
  assert.equal(nodes.get('info_product_name').value,'Material');
  assert.equal(nodes.get('info_specification').value,'10 x 20');
  assert.equal(nodes.get('info_unit').value,'Kg');
  assert.equal(nodes.get('info_standard_stock_quantity').value,50);
  vm.runInContext('$("info_specification").value="10 X 20";populateProductInfo("info_specification")',context);
  assert.equal(nodes.get('info_product_code').value,'SKU');
  assert.equal(nodes.get('info_material').value,'Steel');
});
test('stock quantity totals stay separated by unit',()=>{
  const ctx=vm.createContext({number:value=>String(value)});
  vm.runInContext(fs.readFileSync('inventory-render.js','utf8'),ctx);
  assert.equal(vm.runInContext('formatStockQuantityTotals([{stock_quantity:4,unit:"EA(개)"},{stock_quantity:2,unit:"Kg"},{stock_quantity:3,unit:"EA(개)"}])',ctx),'7 EA(개) · 2 Kg');
});
test('current stock includes every positive balance and excludes exhausted products',()=>{
  const rows=[{id:1,stock_quantity:2},{id:2,stock_quantity:0},{id:3,stock_quantity:'3'},{id:4,stock_quantity:null},{id:5,stock_quantity:-1}];
  assert.deepEqual(currentStockRows(rows).map(row=>row.id),[1,3]);
  assert.equal(rows.length,5);
});
test('stock risk includes only products below twenty percent of their standard quantity',()=>{
  const rows=[
    {product_code:'LOW',standard_stock_quantity:100,stock_quantity:19},
    {product_code:'AT-THRESHOLD',standard_stock_quantity:100,stock_quantity:20},
    {product_code:'ZERO',standard_stock_quantity:100,stock_quantity:0},
    {product_code:'UNSET',standard_stock_quantity:0,stock_quantity:0},
    {product_code:'OK',standard_stock_quantity:100,stock_quantity:21}
  ];
  assert.deepEqual(stockRiskItems(rows).map(item=>item.product_code),['ZERO','LOW']);
});
test('aged stock includes positive lot balances received at least six calendar months ago',()=>{
  const rows=[
    {lot_id:1,received_date:'2026-04-17',remaining_quantity:2,sequence_id:1},
    {lot_id:2,received_date:'2026-04-18',remaining_quantity:1,sequence_id:2},
    {lot_id:3,received_date:'2026-04-01',remaining_quantity:0,sequence_id:3},
    {lot_id:4,received_date:'2026-04-01',remaining_quantity:1,sequence_id:4}
  ];
  assert.equal(sixMonthsAgoDate('2026-10-18'),'2026-04-18');
  assert.equal(sixMonthsAgoDate('2026-08-31'),'2026-02-28');
  assert.deepEqual(stockAgingRows(rows,'2026-10-18').map(row=>row.lot_id),[4,1,2]);
});
test('main dashboard replaces recent movement history with a printable sales balance list',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),script=fs.readFileSync('inventory-app.js','utf8'),style=fs.readFileSync('inventory.css','utf8');
  assert.doesNotMatch(html,/<section id="movement-history"/);
  assert.match(html,/<section id="sales-balance" class="panel history">/);
  assert.ok(html.indexOf('id="sales-balance"')<html.indexOf('id="product-list"'),'sales balance should appear above the product list');
  assert.match(html,/data-print-settings="sales-balance"/);
  assert.match(html,/data-print="sales-balance"/);
  for(const id of ['sales-balance-start-date','sales-balance-end-date','sales-balance-type-filter','apply-sales-balance-search','clear-sales-balance-search'])
    assert.match(html,new RegExp(`id="${id}"`),id);
  assert.match(html,/id="sales-balance-type-filter"[^>]*><option value="">전체 수주<\/option><option value="온라인 수주">온라인 수주<\/option><option value="오프라인 수주">오프라인 수주<\/option>/);
  assert.match(script,/order=>salesOrderStatus\(order\)!=='완료'/);
  assert.match(script,/filterSalesOrders\(outstanding,\{\.\.\.appliedSalesBalanceFilters,salesStatus:''\}\)/);
  assert.match(script,/function applySalesBalanceSearch\(clear=false\)/);
  assert.match(style,/body\[data-print-target="sales-balance"\] #sales-balance/);
  assert.match(style,/#sales-balance \.sales-balance-search/);
  assert.match(style,/#workspace\{display:flex;flex-direction:column;gap:16px\}/);
  assert.match(style,/#workspace>\.session,#workspace>\.stats,#workspace>\.panel\{margin:0\}/);
  assert.match(style,/#sales-balance\+#product-list\{margin-top:0\}/);
  assert.doesNotMatch(style,/#sales-balance\+#product-list\{margin-top:32px\}/);
});
test('dashboard replaces registered-item card with live sales backlog count and amount',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),app=fs.readFileSync('inventory-app.js','utf8'),renderer=fs.readFileSync('inventory-render.js','utf8'),style=fs.readFileSync('inventory.css','utf8');
  const stats=html.match(/<section class="stats"[^>]*>([\s\S]*?)<\/section>/)?.[1]||'';
  assert.match(stats,/<span>수주잔고 현황<\/span><strong id="total-sales-backlog-amount">합계 0원<\/strong><span id="total-sales-backlog-count" class="stat-description">0건<\/span>/);
  assert.match(style,/\.stats>\.sales-backlog-stat\{order:1\}/);
  assert.match(style,/\.stats>\.stat:nth-child\(3\)\{order:2\}/);
  assert.match(style,/\.stats>#stock-risk-button\{order:3\}/);
  assert.match(style,/\.stats>#long-stock-button\{order:4\}/);
  assert.doesNotMatch(html,/id="total-items"/);
  assert.match(app,/\$\('total-sales-backlog-count'\)\.textContent=outstanding\.length\.toLocaleString\('ko-KR'\)\+'건'/);
  assert.match(app,/\$\('total-sales-backlog-amount'\)\.textContent='합계 '\+money\(totalCents\/100\)\+'원'/);
  assert.doesNotMatch(renderer,/total-items/);
});
test('optional inventory search conditions combine without changing defaults',()=>{
  const rows=[
    {id:1,product_code:'A-1',product_name:'Pouch',supplier:'Seoul Trading',stock_quantity:3},
    {id:2,product_code:'B-2',product_name:'Bag',supplier:'Busan Supply',stock_quantity:0},
    {id:3,product_code:'C-3',product_name:'Pouch',supplier:'Seoul Trading',stock_quantity:2}
  ];
  assert.deepEqual(filterInventoryItems(rows).map(row=>row.id),[1,2,3]);
  assert.deepEqual(filterInventoryItems(rows,{availability:'available'}).map(row=>row.id),[1,3]);
  assert.deepEqual(filterInventoryItems(rows,{dateProductIds:new Set(['1','2']),supplier:'seoul'}).map(row=>row.id),[1]);
  assert.deepEqual(filterInventoryItems(rows,{query:'pouch',supplier:'supply'}),[]);
});
test('optional start and end dates query inclusive movement ranges',async()=>{
  const calls=[],ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  ctx.testClient={from(table){
    const query={select(columns){calls.push(['select',table,columns]);return this;},order(column){calls.push(['order',column]);return this;},gte(column,value){calls.push(['gte',column,value]);return this;},lte(column,value){calls.push(['lte',column,value]);return this;},eq(column,value){calls.push(['eq',column,value]);return this;},range(start,end){calls.push(['range',start,end]);return Promise.resolve({data:start===0?Array.from({length:500},(_,index)=>({product_id:'product-'+index})): [{product_id:'product-500'}],error:null});}};
    return query;
  }};
  vm.runInContext('client=testClient',ctx);
  const ids=await vm.runInContext('findMovementProductIds("2026-02-10","2026-02-20")',ctx);
  assert.equal(ids.size,501);
  assert.deepEqual(calls.filter(([method])=>['gte','lte'].includes(method)),[['gte','movement_date','2026-02-10'],['lte','movement_date','2026-02-20'],['gte','movement_date','2026-02-10'],['lte','movement_date','2026-02-20']]);
  assert.equal(calls.some(([method])=>method==='eq'),false);
  assert.deepEqual(calls.filter(([method])=>method==='range').map(([,start,end])=>[start,end]),[[0,499],[500,999]]);
  calls.length=0;
  await vm.runInContext('findMovementProductIds("2026-02-15","")',ctx);
  assert.deepEqual(calls.filter(([method])=>method==='gte'),[['gte','movement_date','2026-02-15'],['gte','movement_date','2026-02-15']]);
  assert.deepEqual(calls.filter(([method])=>method==='lte'),[]);
  calls.length=0;
  assert.equal(await vm.runInContext('findMovementProductIds("","")',ctx),null);
  assert.equal(calls.length,0);
});
test('movement kind can be searched alone or combined with a date range',async()=>{
  const calls=[],ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  ctx.testClient={from(table){
    const query={select(columns){calls.push(['select',table,columns]);return this;},order(column){calls.push(['order',column]);return this;},gte(column,value){calls.push(['gte',column,value]);return this;},lte(column,value){calls.push(['lte',column,value]);return this;},eq(column,value){calls.push(['eq',column,value]);return this;},range(start,end){calls.push(['range',start,end]);return Promise.resolve({data:[],error:null});}};
    return query;
  }};
  vm.runInContext('client=testClient',ctx);
  await vm.runInContext('findMovementProductIds("","", "opening")',ctx);
  assert.deepEqual(calls.filter(([method])=>method==='eq'),[['eq','kind','opening']]);
  calls.length=0;
  await vm.runInContext('findMovementProductIds("2026-02-10","2026-02-20","issue")',ctx);
  assert.deepEqual(calls.filter(([method])=>['gte','lte','eq'].includes(method)),[
    ['gte','movement_date','2026-02-10'],['lte','movement_date','2026-02-20'],['eq','kind','issue']
  ]);
});
test('supplier selection is nested under an optional transaction search',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  for(const id of ['movement-start-date','movement-end-date'])
    assert.match(html,new RegExp(`<input id="${id}"(?![^>]*\\brequired\\b)[^>]*>`));
  const productList=html.slice(html.indexOf('id="product-list"'));
  const transactionFilter=productList.match(/<div class="transaction-filter">([\s\S]*?)<\/div><div class="search-actions">/)[1];
  assert.match(transactionFilter,/<select id="movement-kind-filter"[^>]*>/);
  for(const condition of ['opening','receipt','issue','supplier'])
    assert.match(transactionFilter,new RegExp(`<option value="${condition}">`));
  assert.match(transactionFilter,/<option value="supplier">거래처별 입고품목<\/option>/);
  assert.match(transactionFilter,/<select id="supplier-filter"[^>]*>/);
  assert.doesNotMatch(transactionFilter,/<input id="supplier-filter"/);
  assert.doesNotMatch(html,/movement-month-filter/);
});

test('display fields exactly match the attached workbook headings',async()=>{
  const ExcelJS=require('exceljs');
  const workbook=new ExcelJS.Workbook();
  // 첨부 원본은 Git에 포함하지 않으며, 파일이 있는 로컬에서 정확한 일치도 확인합니다.
  const expected=['품목분류','품번','품명','규격','재질','기초수량','기초단가','기초금액','입고수량','입고단가','입고금액','출고수량','출고단가','출고금액','재고수량','재고단가','재고금액','저장위치','납품업체'];
  assert.deepEqual(STOCK_FIELDS.map(field=>field.label),expected);
  if(fs.existsSync('재고관리.xlsx')){await workbook.xlsx.readFile('재고관리.xlsx');assert.deepEqual(STOCK_FIELDS.map(field=>field.label),workbook.worksheets[0].getRow(1).values.slice(1));}
});
test('FIFO preview spans lots by date then registration order',()=>{
  const lots=[{id:3,received_date:'2020-01-02',remaining_quantity:5,unit_cost:200},{id:2,received_date:'2020-01-01',remaining_quantity:1,unit_cost:150},{id:1,received_date:'2020-01-01',remaining_quantity:2,unit_cost:100}];
  const plan=planFifo(lots,5,'2020-01-03');
  assert.deepEqual(plan.allocations.map(lot=>[lot.id,lot.take]),[[1,2],[2,1],[3,2]]);
  assert.equal(plan.amount,750);assert.equal(plan.shortage,0);
  assert.equal(lots[0].remaining_quantity,5);
});
test('FIFO preview excludes receipts later than issue date and shows shortage',()=>{
  const plan=planFifo([{id:1,received_date:'2020-01-02',remaining_quantity:10,unit_cost:100}],5,'2020-01-01');
  assert.equal(plan.shortage,5);assert.equal(plan.amount,0);
});
test('date input accepts historical real dates and rejects impossible dates',()=>{
  assert.equal(validDate('2020-02-29'),true);assert.equal(validDate('2021-02-29'),false);assert.equal(validDate('9999-01-01'),false);assert.equal(validDate('1899-12-31'),false);
});
test('missing migration and stock errors have actionable messages',()=>{
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  assert.match(vm.runInContext('errorText({code:"PGRST205"})',ctx),/fifo.sql/);
  assert.match(vm.runInContext('errorText({message:"INSUFFICIENT_STOCK"})',ctx),/재고가 부족/);
  assert.match(vm.runInContext('errorText({message:"BACKDATE_CONFLICT"})',ctx),/날짜 순서/);
  assert.match(vm.runInContext('errorText({message:"PRODUCT_CODE_ALREADY_EXISTS"})',ctx),/이미 등록된 품번/);
});
test('insufficient FIFO preview does not present a misleading unit price',()=>{
  const fields={product_code:{value:'SKU'},unit:{value:'Kg'},movement_quantity:{value:'2'},movement_date:{value:'2020-01-02'},movement_cost:{value:'0'},movement_amount:{value:''},'fifo-remaining-heading':{textContent:''},'fifo-issue-heading':{textContent:''},'form-message':{textContent:''}};
  const ctx=vm.createContext({document:{getElementById:id=>fields[id]},planFifo,renderFifoPreview(){}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  vm.runInContext('mode="issue";items=[{product_code:"SKU"}];productLots=[{id:1,received_date:"2020-01-01",remaining_quantity:1,unit_cost:30000}];updateAmounts()',ctx);
  assert.equal(fields.movement_cost.value,'');assert.equal(fields.movement_amount.value,'재고 부족');assert.match(fields['form-message'].textContent,/1 Kg 부족/);
});
test('issue quantity exceeding available stock warns and blocks validation',()=>{
  const alerts=[],fields={product_code:{value:'SKU'},unit:{value:'Kg'},movement_quantity:{value:'6'},movement_date:{value:'2020-01-02'}};
  let rpcCalls=0;
  const ctx=vm.createContext({document:{getElementById:id=>fields[id],querySelector:()=>({querySelectorAll:()=>[]})},window:{alert:message=>alerts.push(message)},planFifo,validDate:value=>value==='2020-01-02',PRODUCT_FIELDS:['product_code'],client:{rpc(){rpcCalls++;}}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  vm.runInContext('mode="issue";currentUser={id:"user"};items=[{product_code:"SKU"}];productLots=[{id:1,received_date:"2020-01-01",remaining_quantity:5,unit_cost:100}];productLotsReady=true',ctx);
  assert.equal(vm.runInContext('validateIssueQuantity(true)',ctx),false);
  assert.deepEqual(alerts,['출고 수량이 재고수량을 초과했습니다. 선택한 출고일자 기준 출고 가능 수량은 5 Kg입니다.']);
  alerts.length=0;
  vm.runInContext('saveMovement({preventDefault(){}})',ctx);
  assert.deepEqual(alerts,['출고 수량이 재고수량을 초과했습니다. 선택한 출고일자 기준 출고 가능 수량은 5 Kg입니다.']);
  assert.equal(rpcCalls,0,'an issue exceeding available stock must not be submitted');
  fields.movement_quantity.value='5';
  assert.equal(vm.runInContext('validateIssueQuantity(true)',ctx),true);
  assert.equal(alerts.length,1);
});
test('FIFO preview adds decimal currency at cent precision',()=>{
  const plan=planFifo([{id:1,received_date:'2020-01-01',remaining_quantity:1,unit_cost:0.1},{id:2,received_date:'2020-01-01',remaining_quantity:1,unit_cost:0.2}],2,'2020-01-02');
  assert.equal(plan.amount,0.3);
});
