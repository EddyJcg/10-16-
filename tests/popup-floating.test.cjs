const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('main popups are non-modal so sidebar menus stay clickable',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  assert.ok(html.indexOf('popup-floating.js')<html.indexOf('inventory-app.js'));
  assert.match(html,/href="\/popup-floating\.css\?v=/);
  const js=fs.readFileSync('popup-floating.js','utf8');
  assert.match(js,/\.show\(\)/);
  assert.match(js,/sales-register-confirm-dialog/);
  assert.doesNotMatch(js,/\.sidebar-action/);
});

test('showModal override opens main popups without modal and keeps them open on sidebar click',()=>{
  const calls=[];
  const closed=[];
  const dialog={id:'sales-order-dialog',open:false,style:{},classList:{add:c=>calls.push('class:'+c),remove(){},contains:()=>false},show(){calls.push('show');this.open=true;},close(){closed.push(this.id);}};
  const confirmDialog={id:'sales-register-confirm-dialog',open:false,classList:{contains:()=>false}};
  const proto={showModal(){calls.push('native');}};
  let clickHandler;
  const context={HTMLDialogElement:function(){},document:{addEventListener:(type,fn)=>{if(type==='click')clickHandler=fn;},querySelectorAll:()=>[dialog]}};
  context.HTMLDialogElement.prototype=proto;
  new Function('HTMLDialogElement','document',fs.readFileSync('popup-floating.js','utf8'))(context.HTMLDialogElement,context.document);
  proto.showModal.call(dialog);
  proto.showModal.call(confirmDialog);
  assert.deepEqual(calls,['class:popup-floating','show','native']);
  assert.equal(clickHandler,undefined);
  assert.deepEqual(closed,[]);
});
test('already open popup flashes instead of reopening',()=>{
  const js=fs.readFileSync('popup-floating.js','utf8');
  assert.match(js,/this\.open\)\{[^}]*popup-flash/);
  assert.match(fs.readFileSync('popup-floating.css','utf8'),/dialog\.popup-flash\{animation:popup-flash/);
});

test('later popups cascade from top-left to bottom-right and stack above earlier ones',()=>{
  const open=[];
  const make=id=>({id,open:false,style:{},classList:{add(){},remove(){},contains:()=>false},show(){this.open=true;open.push(this);}});
  const proto={showModal(){}};
  const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document',fs.readFileSync('popup-floating.js','utf8'))(Ctor,{addEventListener(){},querySelectorAll:()=>open});
  const a=make('a'),b=make('b');
  proto.showModal.call(a);proto.showModal.call(b);
  assert.ok(parseInt(b.style.left)>parseInt(a.style.left));
  assert.ok(parseInt(b.style.top)>parseInt(a.style.top));
  assert.ok(Number(b.style.zIndex)>Number(a.style.zIndex));
});

test('floating popups open at the cascade origin and are not clamped to the viewport',()=>{
  const js=fs.readFileSync('popup-floating.js','utf8');
  const dialog={id:'x',open:false,style:{},classList:{add(){},remove(){},contains:()=>false},show(){this.open=true;},getBoundingClientRect:()=>({left:900,top:700,width:400,height:300})};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','innerWidth','innerHeight',js)(Ctor,{addEventListener(){},querySelectorAll:()=>[]},1000,800);
  proto.showModal.call(dialog);
  assert.equal(dialog.style.left,'24px');
  assert.equal(dialog.style.top,'24px');
  assert.doesNotMatch(js,/keepInViewport|watchSize/);
});

test('popups open in their own window and return to the page when that window closes',()=>{
  const moved=[];
  const listeners={};
  const childDialogs=[];
  const childDoc={head:{querySelectorAll:()=>[],append(){}},body:{append(el){moved.push(el);}},documentElement:{},title:'',createElement:()=>({textContent:''}),querySelectorAll:()=>childDialogs};
  const child={document:childDoc,closed:false,addEventListener:(t,fn)=>{listeners[t]=fn;},focus(){},close(){this.closed=true;}};
  const opened=[];
  const winObj={screenX:0,screenY:0,addEventListener(){},open:(...args)=>{opened.push(args);return child;}};
  const mainBody={append(el){moved.push(['main',el]);}};
  const mainDoc={title:'',documentElement:{},head:{querySelectorAll:()=>[]},body:mainBody,addEventListener(){},querySelectorAll:()=>[]};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','window','innerWidth','innerHeight',fs.readFileSync('popup-floating.js','utf8'))(Ctor,mainDoc,winObj,1000,800);
  const dialog={id:'x',open:false,style:{},classList:{add(){},remove(){},contains:()=>false},show(){this.open=true;},addEventListener(){}};
  proto.showModal.call(dialog);
  childDialogs.push(dialog);
  assert.equal(opened.length,1);
  assert.equal(opened[0][0],'about:blank');
  assert.equal(dialog.open,true);
  assert.equal(moved[0],dialog);
  listeners.pagehide();
  assert.equal(moved[moved.length-1][0],'main');
});

test('popups fall back to the page when the browser refuses to open a window',()=>{
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  const dialog={id:'x',open:false,style:{},classList:{add(){},remove(){},contains:()=>false},show(){this.open=true;}};
  new Function('HTMLDialogElement','document','window','innerWidth','innerHeight',fs.readFileSync('popup-floating.js','utf8'))(Ctor,{addEventListener(){},querySelectorAll:()=>[]},{open:()=>null,addEventListener(){}},1000,800);
  proto.showModal.call(dialog);
  assert.equal(dialog.open,true);
  assert.equal(dialog.style.left,'24px');
});

test('popup windows get the page listeners and lookups that are registered after popup-floating',()=>{
  const childListeners=[];
  const childDoc={head:{querySelectorAll:()=>[],append(){}},body:{append(){}},documentElement:{},title:'',createElement:()=>({textContent:''}),addEventListener:(t,fn)=>childListeners.push([t,fn]),getElementById:id=>(id==='x'?'child-x':null),querySelector:()=>null,querySelectorAll:()=>[]};
  const child={document:childDoc,closed:false,addEventListener(){},focus(){},close(){}};
  const winObj={screenX:0,screenY:0,addEventListener(){},open:()=>child};
  const mainDoc={title:'',documentElement:{},head:{querySelectorAll:()=>[]},body:{append(){}},addEventListener(){},removeEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','window','innerWidth','innerHeight',fs.readFileSync('popup-floating.js','utf8'))(Ctor,mainDoc,winObj,1000,800);
  const appKeydown=()=>{};
  mainDoc.addEventListener('keydown',appKeydown);
  mainDoc.addEventListener('pagehide',()=>{});
  const dialog={id:'x',open:false,style:{},classList:{add(){},remove(){},contains:()=>false},show(){this.open=true;},addEventListener(){}};
  proto.showModal.call(dialog);
  assert.deepEqual(childListeners.map(([t])=>t),['keydown']);
  assert.equal(childListeners[0][1],appKeydown);
  assert.equal(mainDoc.getElementById('x'),'child-x');
});

test('floating popups keep following the pointer beyond the viewport edges',()=>{
  const handlers={};
  const dialog={id:'x',open:true,style:{left:'100px',top:'100px'},getBoundingClientRect:()=>({left:100,top:100,right:500,bottom:400,width:400,height:300}),classList:{add(){},remove(){},contains:()=>false}};
  const body={clientWidth:0,clientHeight:0,closest:s=>s.startsWith('dialog.popup-floating')?dialog:null};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','innerWidth','innerHeight',fs.readFileSync('popup-floating.js','utf8'))(Ctor,{addEventListener:(t,fn)=>{handlers[t]=fn;},querySelectorAll:()=>[]},1000,800);
  const captured=[];
  handlers.pointerdown({button:0,pointerId:7,clientX:150,clientY:120,target:{...body,setPointerCapture:id=>captured.push(id)},preventDefault(){}});
  assert.deepEqual(captured,[7]);
  handlers.pointermove({pointerId:7,clientX:2000,clientY:1500});
  assert.equal(dialog.style.left,'1950px');
  assert.equal(dialog.style.top,'1480px');
  handlers.pointermove({pointerId:7,clientX:-900,clientY:-700});
  assert.equal(dialog.style.left,'-950px');
  assert.equal(dialog.style.top,'-720px');
  handlers.pointerup({pointerId:7});
});

test('floating popups can be dragged outside tables and recentre on double click',()=>{
  const handlers={};
  const dialog={id:'x',open:true,style:{left:'100px',top:'100px'},getBoundingClientRect:()=>({left:100,top:100,right:500,bottom:400,width:400,height:300}),classList:{add(){},remove(){},contains:()=>false}};
  const body={clientWidth:0,clientHeight:0,closest:s=>s.startsWith('dialog.popup-floating')?dialog:null};
  const button={closest:s=>s.startsWith('dialog.popup-floating')?dialog:s.includes('button')?button:null};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','innerWidth','innerHeight',fs.readFileSync('popup-floating.js','utf8'))(Ctor,{addEventListener:(t,fn)=>{handlers[t]=fn;},querySelectorAll:()=>[]},1000,800);
  handlers.pointerdown({button:0,clientX:150,clientY:120,target:button,preventDefault(){}});
  handlers.pointermove({clientX:350,clientY:320});
  assert.equal(dialog.style.left,'100px');
  handlers.pointerdown({button:0,clientX:150,clientY:120,target:body,preventDefault(){}});
  handlers.pointermove({clientX:350,clientY:320});
  assert.equal(dialog.style.left,'300px');
  assert.equal(dialog.style.top,'300px');
  handlers.pointerup({});
  handlers.pointermove({clientX:0,clientY:0});
  assert.equal(dialog.style.left,'300px');
  handlers.dblclick({target:body,clientX:300,clientY:300});
  assert.equal(dialog.style.left,'300px');
  assert.equal(dialog.style.top,'250px');
});

test('table text and nested values allow selection without dragging or recentring the popup',()=>{
  const handlers={};
  const dialog={open:true,style:{left:'100px',top:'100px'},classList:{contains:()=>false},
    getBoundingClientRect:()=>({left:100,top:100,right:500,bottom:400,width:400,height:300})};
  const Ctor=function(){};Ctor.prototype={showModal(){}};
  new Function('HTMLDialogElement','document',fs.readFileSync('popup-floating.js','utf8'))(
    Ctor,{addEventListener:(type,fn)=>{handlers[type]=fn;},querySelectorAll:()=>[]}
  );
  for(const tag of ['table','th','td','span']){
    const table={};
    const target={closest:selector=>selector.startsWith('dialog.popup-floating')?dialog:
      selector.split(',').includes('table')?table:null};
    let prevented=false;
    handlers.pointerdown({button:0,target,clientX:150,clientY:120,preventDefault(){prevented=true;}});
    handlers.pointermove({clientX:350,clientY:320});
    handlers.pointerup();
    handlers.dblclick({target,clientX:150,clientY:120});
    assert.equal(prevented,false,`${tag} retains native text selection`);
    assert.equal(dialog.style.left,'100px');
    assert.equal(dialog.style.top,'100px');
  }
});

test('both inventory and admin tables explicitly allow text selection without inline editing',()=>{
  assert.match(fs.readFileSync('popup-floating.css','utf8'),/dialog\.popup-floating table\{cursor:text\}/);
  for(const file of ['inventory.css','admin.css']){
    assert.match(fs.readFileSync(file,'utf8'),/table td,table th\{-webkit-user-select:text;user-select:text\}/);
  }
  for(const file of ['inventory.html','admin.html']){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/contenteditable\s*=\s*["']?(?:true|plaintext-only)|\.contentEditable\s*=/i);
  }
  for(const file of ['popup-floating.js','popup-table-grid.js']){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\.contentEditable\s*=|setAttribute\(['"]contenteditable/);
  }
});

test('floating popups cancel the centring transform so left/top positioning works',()=>{
  assert.match(fs.readFileSync('popup-floating.css','utf8'),/dialog\.popup-floating\[open\]\{transform:none\}/);
});

test('popups stay inside the dashboard area right of the sidebar and cap at 95 percent',()=>{
  const js=fs.readFileSync('popup-floating.js','utf8');
  assert.match(js,/getElementById\('sidebar'\)/);
  assert.match(js,/window\.popupArea=area/);
  const css=fs.readFileSync('popup-floating.css','utf8');
  assert.match(css,/max-width:calc\(var\(--popup-area-width,100vw\)\*\.95\)!important/);
  assert.match(css,/dialog\.popup-floating\.dialog-expanded\[open\]:not\(\.search-calendar\)\{[^}]*width:calc\(var\(--popup-area-width,100vw\)\*\.95\)!important/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/area\.width\*\.95/);
});

test('vendor dialog does not use CSS zoom so positioning and size clamps stay accurate',()=>{
  assert.doesNotMatch(fs.readFileSync('vendor-management.css','utf8'),/zoom:1\.2/);
});
