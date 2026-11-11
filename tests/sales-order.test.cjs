const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PRODUCT_UNITS,filterSalesOrders,salesOrderStatus,summarizeSalesOrders,validOrderDueDate}=require('../inventory-model.js');

test('sales entry provides an editable order date before the order number',()=>{
  const form=fs.readFileSync('inventory.html','utf8').match(/<form id="sales-order-form" novalidate>([\s\S]*?)<\/form>/)[1];
  assert.match(form,/for="sales_order_date">수주일자<\/label><input id="sales_order_date" type="date" required/);
  assert.ok(form.indexOf('id="sales_order_date"')<form.indexOf('id="sales_order_number"'));
});

test('sales order draft table uses the same heading style as saved orders',()=>{
  const dialog=fs.readFileSync('inventory.html','utf8').match(/<dialog id="sales-order-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog,/<div class="sales-order-draft-header"><h3>가수주 현황<\/h3><div class="sales-order-draft-actions"><button id="add-sales-line" type="button" class="secondary sales-order-line-add">품목추가<\/button><button id="save-sales-order-draft" type="button" class="primary sales-order-draft-register">가수주 등록<\/button><\/div><\/div>\s*<div class="table-wrap sales-order-draft-table">/);
  assert.match(dialog,/<h3>저장된 수주<\/h3>/);
});

test('sales order cancel button sits beside save and clears the draft before closing',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const footer=html.match(/<div class="dialog-footer sales-order-save-actions">([\s\S]*?)<\/div>/)[1];
  assert.ok(footer.indexOf('id="cancel-sales-order"')<footer.indexOf('id="save-sales-order"'));
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',reset(){calls.push('reset');},close(){calls.push('close');}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},todayDate:()=>'2026-01-01'});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext("renderSalesDraftLines=()=>{};salesDraftLines=[{product_name:'임시 품목'}];editingSalesOrderId='order-1';cancelSalesOrder()",context);
  assert.deepEqual(calls,['reset','close']);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  assert.equal(vm.runInContext('editingSalesOrderId',context),'');
  assert.equal(element('sales-order-title').textContent,'수주 입력');
  assert.equal(element('save-sales-order').textContent,'수주 일괄저장');
});

test('sales status places print controls in the header and Excel export in the footer',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const dialog=html.match(/<dialog id="sales-status-dialog"[\s\S]*?<\/dialog>/)[0];
  const toolbar=dialog.match(/<div class="product-list-toolbar">([\s\S]*?)<\/div>/)[1];
  assert.ok(!toolbar.includes('export-sales-status'));
  assert.ok(toolbar.indexOf('data-print-settings="sales-status"')<toolbar.indexOf('data-print="sales-status"'));
  assert.match(dialog,/<div class="dialog-footer"><button id="export-sales-status" class="secondary" type="button">↓ Excel 다운로드<\/button><\/div>/);
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{open:false,value:'100',textContent:'',close(){this.open=false;}});
    return elements.get(id);
  };
  const body={dataset:{},append(){}},calls=[];
  const context=vm.createContext({document:{getElementById:element,body,createElement:()=>({textContent:''})},window:{print(){calls.push('print');},addEventListener(type,handler){if(type==='afterprint')calls.push(handler);}}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext("printInventoryList('sales-status')",context);
  assert.equal(calls.length,0,'closed sales status dialog cannot print');
  element('sales-status-dialog').open=true;
  vm.runInContext("printInventoryList('sales-status')",context);
  assert.equal(body.dataset.printTarget,'sales-status');
  assert.match(element('product-list-print-page-style').textContent,/#sales-status-dialog table/);
  assert.ok(calls.includes('print'));
  calls.find(call=>typeof call==='function')();
  assert.equal(body.dataset.printTarget,undefined);
});

test('매출현황 조회는 수주현황과 별도 창과 독립된 검색 조건을 사용한다',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const app=fs.readFileSync('inventory-app.js','utf8');
  const status=html.match(/<dialog id="sales-status-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  const query=html.match(/<dialog id="sales-status-query-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.ok(status&&query);
  assert.match(status,/<h2 id="sales-status-title">수주현황<\/h2>/);
  assert.match(query,/<h2 id="sales-query-title">매출현황<\/h2>/);
  assert.match(query,/id="sales-query-items"/);
  assert.doesNotMatch(query,/id="sales-query-filter"/);
  assert.doesNotMatch(query,/sales-query-order-query|search-sales-query-orders/);
  assert.match(query,/id="sales-query-order-number" type="search"/);
  assert.match(query,/id="sales-query-vendor" type="search"/);
  assert.match(query,/sales-query-order-number[\s\S]*sales-query-vendor[\s\S]*apply-sales-query-search/);
  assert.match(app,/sales-status-query-button'\)\.addEventListener\('click',\(\)=>showSalesStatus\('query'\)\)/);
  assert.match(app,/appliedSalesQueryFilters=/);
  assert.match(app,/'sales-status-query':'sales-status-query-dialog'/);
});

test('sales order dialog separates free-text header details from repeatable order lines',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const style=fs.readFileSync('sales-order.css','utf8');
  const form=html.match(/<form id="sales-order-form" novalidate>([\s\S]*?)<\/form>/)?.[1]||'';
  assert.ok(form);
  assert.doesNotMatch(form,/<h3>수주 품목<\/h3>/);
  assert.match(form,/class="form-grid sales-order-header-grid">[\s\S]*?<\/div>\s*<div class="form-grid sales-order-line-grid">/);
  for(const [id,label] of [
    ['sales_order_date','수주일자'],['sales_order_number','수주번호'],['sales_order_type','수주형태'],
    ['sales_vendor_name','거래처(성명)'],['sales_vendor_contact','연락처'],['sales_delivery_method','배송방법'],
    ['sales_product_name','품명'],
    ['sales_specification','규격'],['sales_quantity','수량'],
    ['sales_unit_price','단가'],['sales_amount','수주금액'],['sales_address','주소'],['sales_due_date','납기일자']
  ]){
    assert.match(form,new RegExp(`id="${id}"`),id);
    assert.ok(form.includes('>'+label+'</label>'),label);
  }
  assert.doesNotMatch(form,/<label for="sales_unit">|id="sales_unit" required/);
  assert.match(form,/<input id="sales_unit" type="text" hidden/);
  assert.match(form,/class="field sales-order-address-field"><label for="sales_address">주소<\/label><div class="sales-order-address-actions"><input id="sales_address" required readonly[^>]*><input id="sales_postal_code" readonly[^>]*><\/div><\/div>/);
  assert.match(html,/<dialog id="sales-address-dialog"[\s\S]*?<div id="sales-address-search" class="sales-address-search"><\/div>\s*<\/dialog>/);
  assert.match(html,/<th>수주금액<\/th><th>주소<\/th><th>납기일자<\/th><th data-grid-min-width="200" data-column-required>관리<\/th>/);
  assert.match(form,/id="sales_order_type" required><option value="">선택하세요<\/option><option value="온라인 수주">온라인 수주<\/option><option value="오프라인 수주">오프라인 수주<\/option>/);
  assert.match(form,/id="sales_vendor_name" required/);
  assert.doesNotMatch(form,/id="sales_vendor_id"/);
  assert.doesNotMatch(form,/id="sales_vendor_contact" readonly/);
  assert.match(form,/id="sales_amount" readonly/);
  assert.match(form,/class="field sales-order-due-date-field"><label for="sales_due_date">납기일자<\/label><input id="sales_due_date" type="date" required min="1900-01-01"><\/div>/);
  assert.ok(form.indexOf('id="sales_amount"')<form.indexOf('id="sales_due_date"')&&form.indexOf('id="sales_due_date"')<form.indexOf('id="sales_address"'));
  assert.match(fs.readFileSync('inventory.css','utf8'),/button\[id\^="save-"\][\s\S]*?background:#348fe2!important/);
  assert.doesNotMatch(form,/id="add-sales-line-footer"|수주품목 추가/);
  assert.match(form,/id="import-sales-order-button"[^>]*>Excel 업로드<\/button>/);
  assert.match(form,/id="sales-order-import-file" type="file" accept="[^"]*\.xlsx/);
  assert.match(html,/<div class="dialog-footer sales-order-save-actions"><button id="import-sales-order-button"[^>]*>Excel 업로드<\/button><button id="cancel-sales-order"[^>]*>취소<\/button><button id="save-sales-order" class="primary">수주 일괄저장<\/button>/);
  assert.match(form,/id="sales-order-draft-items"/);
  assert.match(html,/<th>거래처<\/th><th>연락처<\/th>/);
  assert.match(html,/id="sales-order-items"/);
  assert.match(html,/<th>배송방법<\/th><th>주소<\/th><th>기타사항<\/th><th data-grid-min-width="150" data-column-required>관리<\/th>/);
  assert.match(html,/<th>일련번호<\/th><th>수주일자<\/th><th>수주번호<\/th>/);
  assert.match(html,/<link rel="stylesheet" href="\/sales-order\.css/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/String\(order\.order_date\)\.slice\(0,10\)/);
  assert.match(style,/@media\(min-width:851px\)\{[\s\S]*?\.sales-order-dialog \.form-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(style,/\.sales-order-dialog \.form-grid>\.field:not\(\.sales-order-address-field\)>input:not\(\[type="hidden"\]\),/);
  assert.match(style,/\.sales-order-dialog \.form-grid>\.field:not\(\.sales-order-address-field\)>select\{width:70%\}/);
  assert.match(style,/@media\(min-width:851px\)\{[\s\S]*?\.sales-order-dialog \.form-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(style,/\.sales-order-dialog \.form-grid \.field\{margin-bottom:6px\}/);
  assert.match(style,/\.sales-order-address-actions\{display:flex;gap:6px\}/);
  assert.match(style,/@media\(min-width:851px\) and \(max-width:1279px\)\{[\s\S]*?\.sales-order-dialog \.sales-order-line-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
  assert.doesNotMatch(style,/\.sales-order-due-date-field\{grid-column:span 2\}/);
  assert.match(style,/\.sales-order-dialog \.sales-order-address-field\{grid-column:span 2\}/);

  assert.match(style,/\.sales-order-dialog \.sales-order-draft-register\{flex:0 0 160px;width:160px;min-width:150px\}/);
  assert.match(style,/\.sales-order-dialog \.sales-order-line-add\{[^}]*background:#ffe0b2;border-color:#efb76f;color:#633500/);
  for(const attr of ['data-edit-sales-draft','data-delete-sales-draft','data-sales-order-id','data-delete-sales-order-id'])
    assert.ok(style.includes(`button[${attr}]`),attr);
  assert.match(style,/\.sales-order-dialog \.sales-order-draft-table button\[data-register-sales-line\]\{transform:scaleX\(\.7\);transform-origin:left center\}/);
  assert.match(style,/width:64px;transform:scaleX\(\.65\);transform-origin:left center;margin-right:-22px/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/\$\('save-sales-order-draft'\)\.addEventListener\('click',addSalesOrderLine\)/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/\$\('add-sales-line'\)\.addEventListener\('click',addSalesOrderLine\)/);
  assert.doesNotMatch(fs.readFileSync('inventory-app.js','utf8'),/add-sales-line-footer/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/\$\('sales-order-draft-items'\)\.addEventListener\('change',changeSalesDraftSelection\)/);
  assert.match(style,/@media\(max-width:850px\)\{[\s\S]*?\.sales-order-dialog \.form-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(style,/@media\(max-width:520px\)\{[\s\S]*?\.sales-order-dialog \.form-grid\{grid-template-columns:1fr\}/);
});

test('draft management checkboxes are preselected and saving requires a selection',()=>{
  class Element{
    constructor(name=''){this.name=name;this.children=[];this.dataset={};this.attributes={};this.disabled=false;this.checked=false;this.value='';this.classList={toggle(){}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(name,value){this.attributes[name]=value;}
  }
  const body=new Element('tbody'),saveButton=new Element('button');
  const context=vm.createContext({
    document:{
      getElementById:id=>id==='sales-order-draft-items'?body:saveButton,
      createElement:name=>new Element(name)
    },
    makeCell:value=>{const cell=new Element('td');cell.textContent=String(value);return cell;},
    emptyRow(){},number:value=>String(value),money:value=>String(value)
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`salesDraftLines=[
    {draftId:'draft-a',product_name:'품목 A',unit:'EA',quantity:1,unit_price:10,due_date:'2026-12-01',selected:true},
    {draftId:'draft-b',product_name:'품목 B',unit:'EA',quantity:2,unit_price:20,due_date:'2026-12-01',selected:false}
  ];renderSalesDraftLines()`,context);
  const first=body.children[0].children[15].children[0],second=body.children[1].children[15].children[0];
  assert.equal(first.type,'checkbox');
  assert.equal(first.checked,true);
  assert.equal(second.checked,false);
  const actions=body.children[0].children[15].children;
  assert.deepEqual(actions.slice(1).map(button=>button.textContent),['등록','수정','삭제']);
  assert.equal(actions[2].dataset.editSalesDraft,'draft-a');
  assert.equal(actions[3].dataset.deleteSalesDraft,'draft-a');
  assert.equal(saveButton.disabled,false);
  first.checked=false;
  vm.runInContext('changeSalesDraftSelection',context)({target:{closest:()=>first}});
  assert.equal(vm.runInContext('salesDraftLines[0].selected',context),false);
  assert.equal(saveButton.disabled,true);
});

test('resetting the sales order form clears the draft while preserving saved orders',()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,reset(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.renderSalesDraftLines=()=>{};
  vm.runInContext(`todayDate=()=> '2026-11-03';
    salesOrders=[{id:'saved-1',order_number:'PO20261103-002'},{id:'saved-2',order_number:'PO20261102-009'}];salesDraftGroupId='group-1';
    salesDraftLines=[{draftId:'draft-1'}];
    $('sales_order_number').value='SO-1'`,context);
  vm.runInContext('resetSalesOrderForm()',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  assert.equal(vm.runInContext('salesDraftGroupId',context),'');
  assert.equal(vm.runInContext('salesOrders.length',context),2);
  assert.equal(element('sales_order_date').value,'2026-11-03');
  assert.equal(element('sales_order_number').value,'PO20261103-003');
  assert.equal(vm.runInContext('nextSalesOrderNumber("2026-11-04")',context),'PO20261104-001');
});

test('individual sales order registration removes its draft and blocks repeated saves',async()=>{
  const elements=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false});
    return elements.get(id);
  };
  let resolveSave;
  const testClient={rpc:(name,args)=>{
    calls.push([name,args]);
    return new Promise(resolve=>{resolveSave=()=>resolve({data:{group_id:'group-1',orders:[{
      ...args.p_lines[0],id:'saved-1',sequence_id:10,order_group_id:'group-1',order_number:args.p_order_number,amount:25
    }]},error:null});});
  }};
  const context=vm.createContext({
    document:{getElementById:element},window:{alert:message=>alerts.push(message)},
    testClient,validOrderDueDate:value=>['2026-11-03','2026-12-01'].includes(value),number:value=>String(value),money:value=>String(value)
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'user'};authGeneration=1;client=testClient;
    $('sales_order_date').value='2026-11-03';$('sales_order_number').value='SO-1';
    $('sales_order_type').value='온라인 수주';$('sales_vendor_name').value='거래처';
    salesDraftLines=[{draftId:'draft-1',product_name:'품목',specification:'규격',unit:'EA(개)',quantity:1,unit_price:25,due_date:'2026-12-01'}]`,context);
  context.renderSalesDraftLines=()=>{};
  context.renderSalesOrders=()=>{};
  context.renderSalesStatus=()=>{};
  context.renderSalesBalance=()=>{};
  context.updateIssueSalesOrders=()=>{};
  const first=vm.runInContext("registerSalesOrderLine('draft-1')",context);
  await vm.runInContext("registerSalesOrderLine('draft-1')",context);
  assert.equal(calls.length,1);
  assert.match(alerts[0],/중복 등록되지 않았습니다/);
  resolveSave();
  await first;
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  assert.equal(vm.runInContext('salesOrders.length',context),1);
  await vm.runInContext("registerSalesOrderLine('draft-1')",context);
  assert.equal(calls.length,1);
});

test('individual and batch sales registration retain one group and batch saving respects selections',async()=>{
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,reset(){}});
    return elements.get(id);
  };
  let sequence=0;
  const testClient={rpc:async(name,args)=>{
    calls.push([name,args]);
    const groupId=args.p_group_id||(calls.filter(([callName])=>callName==='register_sales_order_group').length>1?'group-next':'group-shared');
    const orders=args.p_lines.map(line=>({
      ...line,id:line.line_id||`saved-${++sequence}`,sequence_id:sequence,
      order_group_id:groupId,order_number:args.p_order_number,amount:line.quantity*line.unit_price
    }));
    return {data:{group_id:groupId,orders},error:null};
  }};
  const context=vm.createContext({
    document:{getElementById:element},window:{alert(){}},testClient,
    validOrderDueDate:value=>['2026-11-03','2026-12-01'].includes(value),number:value=>String(value),money:value=>String(value)
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`client=testClient;currentUser={id:'user'};authGeneration=1;
    $('sales_order_date').value='2026-11-03';$('sales_order_number').value='SO-3';
    $('sales_order_type').value='온라인 수주';$('sales_vendor_name').value='거래처';
    salesDraftLines=[{draftId:'draft-a',product_name:'품목 A',specification:'규격',unit:'EA(개)',quantity:1,unit_price:25,due_date:'2026-12-01'}]`,context);
  context.renderSalesDraftLines=()=>{};
  context.renderSalesOrders=()=>{};
  context.renderSalesStatus=()=>{};
  context.renderSalesBalance=()=>{};
  context.updateIssueSalesOrders=()=>{};
  await vm.runInContext("registerSalesOrderLine('draft-a')",context);
  vm.runInContext(`salesDraftLines=[{draftId:'draft-b',product_name:'품목 B',specification:'',unit:'Box',quantity:2,unit_price:10,due_date:'2026-12-01'}]`,context);
  await vm.runInContext("registerSalesOrderLine('draft-b')",context);
  vm.runInContext(`salesDraftLines=[
    {draftId:'draft-c',product_name:'품목 C',specification:'',unit:'M',quantity:3,unit_price:5,due_date:'2026-12-01',selected:true},
    {draftId:'draft-d',product_name:'품목 D',specification:'',unit:'EA',quantity:4,unit_price:5,due_date:'2026-12-01',selected:false}
  ]`,context);
  vm.runInContext('resetSalesOrderForm=()=>{salesDraftLines=[]}',context);
  await vm.runInContext("saveSalesOrder({preventDefault(){}})",context);
  assert.deepEqual(calls.map(([name])=>name),[
    'register_sales_order_group','update_sales_order_group','update_sales_order_group'
  ]);
  assert.equal(calls[1][1].p_group_id,'group-shared');
  assert.equal(calls[1][1].p_lines.length,2);
  assert.equal(calls[1][1].p_lines.filter(line=>line.line_id).length,1);
  assert.equal(calls[2][1].p_group_id,'group-shared');
  assert.equal(calls[2][1].p_lines.length,3);
  assert.equal(calls[2][1].p_lines.filter(line=>!line.line_id).length,1);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(vm.runInContext('salesDraftLines[0].draftId',context),'draft-d');
  vm.runInContext('salesDraftLines[0].selected=true',context);
  await vm.runInContext("saveSalesOrder({preventDefault(){}})",context);
  assert.equal(calls[3][0],'register_sales_order_group');
  assert.equal(calls[3][1].p_order_number,'PO20261103-001');
  assert.equal(calls[3][1].p_lines.length,1);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  assert.equal(element('sales_order_number').value,'PO20261103-002');
  assert.equal(vm.runInContext('salesOrders.length',context),4);
});

test('sales order batch save submits every draft once and displays a duplicate-save notice',async()=>{
  const elements=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,reset(){}});
    return elements.get(id);
  };
  let resolveSave;
  const testClient={rpc:(name,args)=>{
    calls.push([name,args]);
    return new Promise(resolve=>{resolveSave=()=>resolve({data:{group_id:'group-2',orders:args.p_lines.map((line,index)=>({
      ...line,id:'saved-'+index,sequence_id:index+1,order_group_id:'group-2',order_number:args.p_order_number
    }))},error:null});});
  }};
  const context=vm.createContext({
    document:{getElementById:element},window:{alert:message=>alerts.push(message)},
    testClient,validOrderDueDate:value=>['2026-11-03','2026-12-01'].includes(value),number:value=>String(value),money:value=>String(value)
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`client=testClient;currentUser={id:'user'};authGeneration=1;
    $('sales_order_date').value='2026-11-03';$('sales_order_number').value='SO-2';
    $('sales_order_type').value='온라인 수주';$('sales_vendor_name').value='거래처';
    salesDraftLines=[
      {draftId:'draft-a',product_name:'품목 A',specification:'',unit:'EA(개)',quantity:1,unit_price:10,due_date:'2026-12-01'},
      {draftId:'draft-b',product_name:'품목 B',specification:'',unit:'Box',quantity:2,unit_price:20,due_date:'2026-12-01'}
    ]`,context);
  context.renderSalesDraftLines=()=>{};
  vm.runInContext('resetSalesOrderForm=()=>{salesDraftLines=[]}',context);
  context.renderSalesOrders=()=>{};
  context.renderSalesStatus=()=>{};
  context.renderSalesBalance=()=>{};
  context.updateIssueSalesOrders=()=>{};
  const first=vm.runInContext("saveSalesOrder({preventDefault(){}})",context);
  await vm.runInContext("saveSalesOrder({preventDefault(){}})",context);
  assert.equal(calls.length,1);
  assert.match(alerts[0],/중복 등록되지 않았습니다/);
  assert.equal(calls[0][1].p_lines.length,2);
  assert.equal('draftId'in calls[0][1].p_lines[0],false);
  resolveSave();
  await first;
  assert.equal(vm.runInContext('salesOrders.length',context),2);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
});

test('sales status view includes every order field and completion control after order number',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const search=html.match(/<div class="sales-status-order-search">([\s\S]*?)<div class="sales-status-filters">/)?.[1]||'';
  const table=html.match(/<table aria-label="전체 수주현황">([\s\S]*?)<\/table>/)?.[1]||'';
  assert.match(html,/<h2 id="sales-status-title">수주현황<\/h2>/);
  assert.match(html,/id="close-sales-status" aria-label="수주현황 창 닫기"/);
  assert.match(html,/id="sales-status-button"[^>]*>수주 현황<\/button>/);
  assert.match(search,/for="sales-status-order-query">수주번호 또는 거래처\(성명\) 검색<\/label><input id="sales-status-order-query" type="search"/);
  assert.match(search,/id="search-sales-status-orders"[^>]*>검색<\/button>/);
  assert.match(table,/<th>수주번호<\/th><th>수주형태<\/th><th>거래처<\/th><th>연락처<\/th><th>출고일자<\/th><th>완료 체크<\/th><th>매출 상태<\/th>/);
  for(const label of ['일련번호','수주일자','수주번호','완료 체크','매출 상태','수주형태','거래처','연락처','출고일자','품명','규격','단위','수량','단가','수주금액','납기일자','배송방법','주소','기타사항'])
    assert.ok(table.includes(`<th>${label}</th>`),label);
  for(const id of ['sales-status-start-date','sales-status-end-date','sales-status-type-filter','sales-status-filter','sales-status-total','sales-status-completed-total','sales-status-outstanding-total'])
    assert.match(html,new RegExp(`id="${id}"`),id);
  assert.match(table,/<th>관리<\/th>/);
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(app,/\$\('sales-status-items'\)\.addEventListener\('click'/);
  assert.match(app,/function editSalesOrderFromStatus\(id\)/);
});

test('sales registration has its own search dialog, matching order columns and confirmation',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const app=fs.readFileSync('inventory-app.js','utf8');
  const registerDialog=html.match(/<dialog id="sales-register-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  const registerHeader=registerDialog.match(/<table aria-label="매출 등록 대상 수주 현황"><thead>([\s\S]*?)<\/thead>/)?.[1];
  assert.match(registerHeader,/<th>일련번호<\/th><th>관리<\/th>/);
  assert.doesNotMatch(registerHeader,/<th>(?:연락처|완료 체크|기타사항)<\/th>/);
  assert.match(registerDialog,/id="sales-register-query" type="search"/);
  assert.match(registerDialog,/id="search-sales-register"[^>]*>검색<\/button>/);
  assert.match(registerDialog,/<button id="add-sales-register"[^>]*>매출 등록 추가<\/button><button id="bulk-sales-register"[^>]*>일괄 매출등록<\/button>/);
  assert.doesNotMatch(registerDialog,/sales-status-start-date|sales-status-total/);
  assert.match(html,/<dialog id="sales-register-confirm-dialog"[\s\S]*?매출등록을 하시겠습니까\?[\s\S]*?id="cancel-sales-register-confirm"[^>]*>취소<\/button>[\s\S]*?id="complete-sales-register-confirm"[^>]*>완료<\/button>/);
  assert.match(app,/\$\('sales-register-button'\)\.addEventListener\('click',showSalesRegister\)/);
  assert.match(app,/\$\('search-sales-register'\)\.addEventListener\('click',applySalesRegisterSearch\)/);
  assert.match(app,/function openSalesRegisterConfirmation\(id\)/);
  assert.match(app,/return Boolean\(String\(order\.shipped_date\|\|''\)\.trim\(\)\)/);
  assert.match(app,/client\.rpc\('set_sales_order_status',\{p_order_id:order\.id,p_sales_status:'완료'\}\)/);
});

test('sales registration search filters the loaded orders by order number or vendor when requested',()=>{
  const elements=new Map(),element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:''});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},filterSalesOrders,number:value=>String(value)});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`salesOrders=[
    {id:'one',order_number:'SO-2026-01',vendor_name:'Alpha'},
    {id:'two',order_number:'SO-2026-02',vendor_name:'Beta'}
  ];renderSalesRegister=()=>{salesRegisterVisibleOrders=filterSalesOrders(salesOrders,{query:salesRegisterQuery})};
    $('sales-register-query').value=' beta ';applySalesRegisterSearch()`,context);
  assert.equal(vm.runInContext('salesRegisterSearched',context),true);
  assert.equal(vm.runInContext('salesRegisterQuery',context),'beta');
  assert.equal(vm.runInContext('salesRegisterVisibleOrders[0].id',context),'two');
  assert.equal(element('sales-register-message').textContent,'검색 결과 1건');
});

test('sales registration hides removed columns and disables unshipped orders',()=>{
  class Element{
    constructor(){this.children=[];this.dataset={};this.attributes={};this.textContent='';this.value='';this.classList={toggle(){}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(name,value){this.attributes[name]=value;}
  }
  const body=new Element(),document={getElementById:id=>id==='sales-register-items'?body:new Element(),createElement:()=>new Element()};
  const context=vm.createContext({
    document,filterSalesOrders,salesOrderStatus,
    number:value=>String(value),money:value=>String(value),
    makeCell:text=>({textContent:String(text)}),emptyRow:(target,columns,text)=>target.append({columns,text})
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`salesOrders=[{id:'line-1',sequence_id:1,order_date:'2026-11-03',order_number:'SO-1',order_type:'온라인 수주',
    vendor_name:'업체',vendor_contact:'010',shipped_date:'',sales_progress_status:'진행',product_name:'품목',specification:'규격',
    unit:'EA',quantity:2,unit_price:5,amount:10,due_date:'2026-11-10',delivery_method:'택배',address:'주소',notes:'비고'}];
    salesRegisterSearched=true;salesRegisterQuery='SO-1';salesStatusUpdating=false;renderSalesRegister()`,context);
  assert.equal(body.children.length,1);
  assert.equal(body.children[0].children.length,17);
  const actionButton=body.children[0].children[1].children[0];
  assert.match(actionButton.innerHTML,/sales-register-icon/);
  assert.match(actionButton.innerHTML,/매출등록/);
  assert.equal(actionButton.disabled,true,'unshipped orders cannot be registered');
  assert.match(actionButton.title,/출고등록/);
  assert.equal(actionButton.dataset.salesRegisterOrderId,'line-1');
  const cells=body.children[0].children.map(cell=>cell.textContent);
  assert.ok(!cells.includes('010'));
  assert.ok(!cells.includes('비고'));
});

test('sales registration confirmation completes the chosen order and keeps the register dialog open',async()=>{
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{open:false,textContent:'',disabled:false,showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(id);
  };
  const testClient={rpc:async(name,args)=>{
    calls.push([name,args]);
    return {data:{id:'line-1',order_number:'SO-1',product_name:'품목',sales_progress_status:'완료',sales_status:'매출완료'},error:null};
  }};
  const context=vm.createContext({document:{getElementById:element},testClient,salesOrderStatus});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'user'};salesOrders=[{id:'line-1',order_number:'SO-1',product_name:'품목',quantity:1,shipped_quantity:0,shipped_date:null,sales_progress_status:'진행'}];
    client=testClient;renderSalesOrders=()=>{};renderSalesStatus=()=>{};renderSalesRegister=()=>{};renderSalesBalance=()=>{};updateIssueSalesOrders=()=>{};
    $('sales-register-dialog').showModal();openSalesRegisterConfirmation('line-1')`,context);
  assert.equal(element('sales-register-confirm-message').textContent,'매출등록을 하시겠습니까?');
  assert.equal(element('complete-sales-register-confirm').disabled,true);
  assert.match(element('sales-register-confirm-status').textContent,/출고등록을 완료한 품목만/);
  await vm.runInContext('completeSalesRegistration()',context);
  assert.equal(calls.length,0,'unshipped orders cannot be completed');
  vm.runInContext('cancelSalesRegisterConfirmation()',context);
  assert.equal(element('sales-register-dialog').open,true,'cancel returns to the sales register dialog');
  vm.runInContext("salesOrders[0].shipped_quantity=1;salesOrders[0].shipped_date='2026-11-03';openSalesRegisterConfirmation('line-1')",context);
  await vm.runInContext('completeSalesRegistration()',context);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'set_sales_order_status');
  assert.equal(calls[0][1].p_order_id,'line-1');
  assert.equal(calls[0][1].p_sales_status,'완료');
  assert.equal(vm.runInContext("salesOrders[0].sales_progress_status",context),'완료');
  assert.equal(element('sales-register-confirm-dialog').open,false);
  assert.equal(element('sales-register-dialog').open,true);
  vm.runInContext("openSalesRegisterConfirmation('line-1');completeSalesRegistration()",context);
  assert.equal(calls.length,1,'an already completed order cannot be registered twice');
});

test('sales registration add button clears conditions and restores the search input',()=>{
  const elements=new Map(),element=id=>{
    if(!elements.has(id))elements.set(id,{value:'old search',textContent:'',disabled:false,focused:false,focus(){this.focused=true;},replaceChildren(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext("salesRegisterQuery='old search';salesRegisterSearched=true;salesRegisterVisibleOrders=[{id:'one'}];renderSalesRegister=()=>{};resetSalesRegisterSearch()",context);
  assert.equal(vm.runInContext('salesRegisterQuery',context),'');
  assert.equal(vm.runInContext('salesRegisterSearched',context),false);
  assert.equal(vm.runInContext('salesRegisterVisibleOrders.length',context),0);
  assert.equal(element('sales-register-query').value,'');
  assert.equal(element('sales-register-query').focused,true);
});

test('bulk sales registration processes only unregistered eligible search results once',async()=>{
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{open:false,textContent:'',disabled:false,showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(id);
  };
  const testClient={rpc:async(name,args)=>{
    calls.push([name,args.p_order_id]);
    return {data:{id:args.p_order_id,order_number:args.p_order_id,product_name:'품목',sales_progress_status:'완료',sales_status:'매출완료'},error:null};
  }};
  const context=vm.createContext({
    document:{getElementById:element},testClient,salesOrderStatus,number:value=>String(value)
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.renderSalesOrders=()=>{};
  context.renderSalesStatus=()=>{};
  context.renderSalesRegister=()=>{};
  context.renderSalesBalance=()=>{};
  context.updateIssueSalesOrders=()=>{};
  vm.runInContext(`currentUser={id:'user'};client=testClient;
    salesOrders=[
      {id:'eligible-1',order_number:'SO-1',product_name:'품목1',quantity:1,shipped_quantity:1,shipped_date:'2026-11-01',sales_progress_status:'진행'},
      {id:'eligible-2',order_number:'SO-2',product_name:'품목2',quantity:1,shipped_quantity:1,shipped_date:'2026-11-02',sales_progress_status:'진행'},
      {id:'unshipped',order_number:'SO-3',product_name:'품목3',quantity:1,shipped_quantity:0,shipped_date:null,sales_progress_status:'진행'},
      {id:'completed',order_number:'SO-4',product_name:'품목4',quantity:1,shipped_quantity:1,shipped_date:'2026-11-03',sales_progress_status:'완료'},
      {id:'partial',order_number:'SO-5',product_name:'품목5',quantity:2,shipped_quantity:1,shipped_date:'2026-11-04',sales_progress_status:'진행'}
    ];
    salesRegisterVisibleOrders=salesOrders;openBulkSalesRegisterConfirmation()`,context);
  assert.equal(element('sales-register-confirm-message').textContent,'2건의 매출등록을 진행하시겠습니까?');
  await vm.runInContext('completeSalesRegistration()',context);
  assert.equal(calls.length,2);
  assert.equal(calls[0][1],'eligible-1');
  assert.equal(calls[1][1],'eligible-2');
  assert.equal(vm.runInContext("salesOrders.filter(order=>order.sales_progress_status==='완료').length",context),3);
  await vm.runInContext('completeSalesRegistration()',context);
  assert.equal(calls.length,2,'a repeated bulk action does not call the database again');
});

test('sales item completion checkbox saves the selected order status',async()=>{
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:''});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element},
    salesOrderStatus,
    testClient:{rpc:async(name,args)=>{
      calls.push([name,args]);
      return {data:{id:'line',order_number:'SO-1',sales_progress_status:args.p_sales_status,sales_status:'매출완료'},error:null};
    }},
    renderSalesOrders(){},renderSalesStatus(){},renderSalesBalance(){},updateIssueSalesOrders(){}
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('client=testClient',context);
  context.renderSalesOrders=()=>{};
  context.renderSalesStatus=()=>{};
  context.renderSalesBalance=()=>{};
  context.updateIssueSalesOrders=()=>{};
  vm.runInContext("salesOrders=[{id:'line',order_number:'SO-1',sales_status:'매출미완료',shipped_date:'2026-11-03'}];currentUser={id:'user'}",context);
  context.completionCheckbox={dataset:{orderId:'line',salesOrderComplete:'true'},checked:true};
  await vm.runInContext("changeSalesOrderStatus({target:completionCheckbox})",context);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'set_sales_order_status');
  assert.equal(calls[0][1].p_order_id,'line');
  assert.equal(calls[0][1].p_sales_status,'완료');
  assert.equal(vm.runInContext('salesOrders[0].sales_progress_status',context),'완료');
  assert.match(element('sales-status-message').textContent,/완료/);
});

test('dashboard sales balance uses the same sales-order columns and status selection',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const statusHeaders=html.match(/<table aria-label="전체 수주현황"[^>]*><thead><tr>([\s\S]*?)<\/tr>/)?.[1]||'';
  const balanceHeaders=html.match(/<table aria-label="수주잔고 현황"[^>]*><thead><tr>([\s\S]*?)<\/tr>/)?.[1]||'';
  assert.equal(balanceHeaders,statusHeaders);
  assert.match(html,/id="sales-balance-items"/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/select\.value=status;select\.disabled=salesStatusUpdating/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/checkbox\.disabled=salesStatusUpdating\|\|Number\(order\.shipped_quantity\|\|0\)>0/);
});

test('dashboard backlog card shows live outstanding order count and exact total',()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,textContent:'',children:[],dataset:{},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=[...nodes];},setAttribute(){}});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element,createElement:tag=>({tag,children:[],dataset:{},classList:{toggle(){}},append(...nodes){this.children.push(...nodes);},setAttribute(){}})},
    number:value=>Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:2}),
    money:value=>Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:2}),
    filterSalesOrders,
    salesOrderStatus,
    validOrderDueDate,
    makeCell:text=>({textContent:String(text),className:''}),
    emptyRow(){}
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`salesOrders=[
    {id:'a',sequence_id:1,order_date:'2026-10-01',order_number:'SO-1',order_type:'온라인 수주',sales_status:'매출미완료',amount:10.25},
    {id:'b',sequence_id:2,order_date:'2026-10-02',order_number:'SO-2',order_type:'오프라인 수주',sales_status:'매출미완료',amount:20.10},
    {id:'c',sequence_id:3,order_date:'2026-10-03',order_number:'SO-3',sales_status:'매출완료',amount:50}
  ];renderSalesBalance()`,context);
  assert.equal(element('total-sales-backlog-count').textContent,'2건');
  assert.equal(element('total-sales-backlog-amount').textContent,'합계 30.35원');
  assert.equal(element('sales-balance-items').children.length,2);
  element('sales-balance-start-date').value='2026-10-01';
  element('sales-balance-end-date').value='2026-10-01';
  element('sales-balance-type-filter').value='온라인 수주';
  vm.runInContext('applySalesBalanceSearch()',context);
  assert.equal(element('sales-balance-items').children.length,1);
  assert.equal(element('sales-balance-summary').textContent,'1건 · 진행·중단 수주 잔고 10.25원');
  assert.equal(element('total-sales-backlog-count').textContent,'2건');
  assert.equal(element('total-sales-backlog-amount').textContent,'합계 30.35원');
  element('sales-balance-start-date').value='2026-10-02';
  element('sales-balance-end-date').value='2026-10-01';
  vm.runInContext('applySalesBalanceSearch()',context);
  assert.equal(element('sales-balance-status').textContent,'시작일은 종료일보다 늦을 수 없습니다.');
  assert.equal(element('sales-balance-items').children.length,1);
  vm.runInContext('applySalesBalanceSearch(true)',context);
  assert.equal(element('sales-balance-start-date').value,'');
  assert.equal(element('sales-balance-end-date').value,'');
  assert.equal(element('sales-balance-type-filter').value,'');
  assert.equal(element('sales-balance-items').children.length,2);
});

test('sales orders filter inclusively by date, type and completion, and summarize period totals',()=>{
  const orders=[
    {order_date:'2026-10-01',order_number:'SO-100',vendor_name:'홍길동',order_type:'온라인 수주',sales_status:'매출완료',amount:'10.25'},
    {order_date:'2026-10-19',order_number:'SO-200',vendor_name:'김철수',order_type:'온라인 수주',sales_status:'매출미완료',amount:'20.10'},
    {order_date:'2026-10-20',order_number:'SO-300',vendor_name:'홍길동',order_type:'오프라인 수주',sales_status:'매출미완료',amount:'30.00'}
  ];
  const filters={startDate:'2026-10-01',endDate:'2026-10-19',orderType:'온라인 수주'};
  assert.equal(filterSalesOrders(orders,{...filters,salesStatus:'완료'}).length,1);
  assert.deepEqual(summarizeSalesOrders(orders,filters),{total:30.35,completed:10.25,outstanding:20.1});
  assert.equal(filterSalesOrders(orders,{salesStatus:'진행'}).length,2);
  assert.deepEqual(filterSalesOrders(orders,{query:'so-20'}).map(order=>order.order_number),['SO-200']);
  assert.deepEqual(filterSalesOrders(orders,{query:'홍길동'}).map(order=>order.order_number),['SO-100','SO-300']);
  assert.equal(filterSalesOrders(orders,{query:'  김철수  ',salesStatus:'진행'}).length,1);
  assert.equal(salesOrderStatus({sales_progress_status:'중단',sales_status:'매출미완료'}),'중단');
});

test('매출현황 조회 날짜 조건과 금액 요약은 출고일자를 기준으로 한다',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(html,/<label for="sales-query-start-date">매출일 시작<\/label>/);
  assert.match(html,/<label for="sales-query-end-date">매출일 종료<\/label>/);
  assert.match(app,/function completedSalesOrders\(rows\)\{return rows\.filter\(order=>salesOrderStatus\(order\)==='완료'\);\}/);
  assert.match(app,/view==='query'\?completedSalesOrders\(salesOrders\):salesOrders/);
  const orders=[
    {order_date:'2026-09-01',shipped_date:'2026-10-01',order_number:'SO-1',sales_status:'매출완료',amount:10},
    {order_date:'2026-10-02',shipped_date:'2026-10-02',order_number:'SO-2',sales_status:'매출미완료',amount:20},
    {order_date:'2026-10-03',shipped_date:null,order_number:'SO-3',sales_status:'매출미완료',amount:30}
  ];
  const filters={startDate:'2026-10-01',endDate:'2026-10-02',dateField:'shipped_date'};
  assert.deepEqual(filterSalesOrders(orders,filters).map(order=>order.order_number),['SO-1','SO-2']);
  assert.deepEqual(summarizeSalesOrders(orders,filters),{total:30,completed:10,outstanding:20});
  assert.deepEqual(filterSalesOrders(orders,{startDate:'2026-10-01',endDate:'2026-10-02'}).map(order=>order.order_number),['SO-2']);
});

test('매출현황 조회는 수주번호와 거래처 조건을 각각 또는 함께 적용한다',()=>{
  const rows=[
    {order_number:'SO-100',vendor_name:'Alpha',shipped_date:'2026-11-01'},
    {order_number:'SO-200',vendor_name:'Alpha',shipped_date:'2026-11-01'},
    {order_number:'SO-100',vendor_name:'Beta',shipped_date:'2026-11-01'}
  ];
  assert.deepEqual(filterSalesOrders(rows,{orderNumber:'so-100'}),[rows[0],rows[2]]);
  assert.deepEqual(filterSalesOrders(rows,{vendorName:'alpha'}),[rows[0],rows[1]]);
  assert.deepEqual(filterSalesOrders(rows,{orderNumber:'SO-100',vendorName:'Alpha'}),[rows[0]]);
  assert.equal(filterSalesOrders(rows,{orderNumber:'missing'}).length,0);
});

test('매출현황 기본 목록과 검색 결과는 매출등록 완료 수주만 표시한다',()=>{
  const rows=[
    {order_number:'SO-100',vendor_name:'Alpha',shipped_date:'2026-11-01',sales_progress_status:'완료'},
    {order_number:'SO-200',vendor_name:'Alpha',shipped_date:'2026-11-02',sales_progress_status:'진행'},
    {order_number:'SO-300',vendor_name:'Beta',shipped_date:'2026-11-03',sales_progress_status:'완료'}
  ];
  const context=vm.createContext({salesOrderStatus,filterSalesOrders});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.orders=rows;
  assert.deepEqual(vm.runInContext('completedSalesOrders(orders).map(order=>order.order_number)',context),['SO-100','SO-300']);
  assert.deepEqual(vm.runInContext("filterSalesOrders(completedSalesOrders(orders),{vendorName:'alpha',dateField:'shipped_date'}).map(order=>order.order_number)",context),['SO-100']);
});

test('issue sales-order selector lists in-progress orders only and selects the linked product',()=>{
  const fields={
    'issue-sales-order':{
      value:'',disabled:true,options:[],
      replaceChildren(...options){this.options=[...options];},
      append(option){this.options.push(option);}
    },
    product_code:{value:''},movement_quantity:{value:''},'form-message':{textContent:''}
  };
  const context=vm.createContext({
    document:{
      getElementById:id=>fields[id],
      createElement:()=>({value:'',textContent:'',disabled:false})
    },
    salesOrderStatus,
    number:value=>Number(value||0).toLocaleString('ko-KR'),
    crypto:{randomUUID:()=> 'request-id'},
    updateAmounts(){}
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`mode='issue';salesOrders=[
    {id:'active',order_number:'SO-OPEN',vendor_name:'고객',product_name:'Shirt',specification:'Blue',unit:'EA(개)',quantity:5,shipped_quantity:2,sales_status:'매출미완료',due_date:'2026-11-10'},
    {id:'complete',order_number:'SO-DONE',product_name:'Shirt',specification:'Blue',unit:'EA(개)',quantity:2,shipped_quantity:2,sales_status:'매출완료'},
    {id:'manual-complete',order_number:'SO-MANUAL-DONE',product_name:'Hat',specification:'',unit:'EA(개)',quantity:1,shipped_quantity:0,sales_status:'매출완료'},
    {id:'stopped',order_number:'SO-STOPPED',product_name:'Bag',specification:'',unit:'EA(개)',quantity:1,shipped_quantity:0,sales_progress_status:'중단',sales_status:'매출미완료'}
  ];updateIssueSalesOrders()`,context);
  assert.equal(fields['issue-sales-order'].options.length,2);
  assert.equal(fields['issue-sales-order'].options[1].value,'active');
  assert.match(fields['issue-sales-order'].options[1].textContent,/SO-OPEN.*고객.*Shirt.*잔여 3 EA\(개\)/);
  assert.equal(fields['issue-sales-order'].disabled,false);

  vm.runInContext(`items=[{id:'p1',product_code:'SHIRT',product_name:'Shirt',specification:'Blue',unit:'EA(개)'}];
    populateProduct=()=>{};updateAmounts=()=>{};`,context);
  fields['issue-sales-order'].value='active';
  vm.runInContext('selectIssueSalesOrder()',context);
  assert.equal(fields.product_code.value,'SHIRT');
  assert.equal(fields.movement_quantity.value,'3');
  assert.equal(fields['form-message'].textContent,'');
});

test('sales order amount updates from quantity and unit price',()=>{
  const fields={sales_quantity:{value:'3'},sales_unit_price:{value:'1250.5'},sales_amount:{value:''}};
  const context=vm.createContext({document:{getElementById:id=>fields[id]},money:value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('updateSalesAmount()',context);
  assert.equal(fields.sales_amount.value,'3,751.5원');
  fields.sales_quantity.value='0';
  vm.runInContext('updateSalesAmount()',context);
  assert.equal(fields.sales_amount.value,'');
});

test('sales order due dates accept valid historical and future dates',()=>{
  assert.equal(validOrderDueDate('2026-12-31'),true);
  assert.equal(validOrderDueDate('2026-02-29'),false);
  assert.equal(validOrderDueDate('1899-12-31'),false);
});

test('sales order dialog is connected to the authenticated database save flow',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const script=fs.readFileSync('inventory-app.js','utf8');
  const sql=fs.readFileSync('supabase/fifo.sql','utf8');
  assert.match(html,/id="sales-order-button"/);
  assert.match(html,/<dialog id="sales-order-dialog"/);
  assert.match(script,/function showSalesOrder\(\)/);
  assert.match(script,/function saveSalesOrder\(event\)/);
  assert.match(script,/client\.rpc\('register_sales_order_group'/);
  assert.match(script,/client\.rpc\('update_sales_order_group'/);
  assert.match(script,/function addSalesOrderLine\(\)/);
  assert.match(script,/p_vendor_name:\$\('sales_vendor_name'\)\.value\.trim\(\)/);
  assert.match(script,/p_lines:\[\.\.\.existingGroupLines,\.\.\.selectedDraftLines\.map/);
  assert.match(script,/client\.rpc\('set_sales_order_status'/);
  assert.match(script,/sales-order-form'\)\.addEventListener\('submit',saveSalesOrder\)/);
  assert.match(script,/\$\('cancel-sales-order'\)\.addEventListener\('click',cancelSalesOrder\)/);
  assert.match(sql,/create table if not exists public\.sales_orders/);
  assert.match(sql,/create or replace function public\.register_sales_order/);
  assert.match(sql,/create or replace function public\.set_sales_order_status/);
  const vendorSql=fs.readFileSync('supabase/sales-order-vendor.sql','utf8');
  assert.match(vendorSql,/references public\.business_partners\(id\)/);
  assert.match(vendorSql,/p_vendor_id uuid default null/);
  const groupedSql=fs.readFileSync('supabase/sales-order-groups.sql','utf8');
  assert.match(groupedSql,/add column if not exists order_group_id uuid/);
  assert.match(groupedSql,/create or replace function public\.register_sales_order_group/);
  assert.match(groupedSql,/create or replace function public\.update_sales_order_group/);
});

test('delivery method input sits right after the contact input in the order header grid',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  assert.match(html,/id="sales_vendor_contact"[^\n]*<\/div>\s*<div class="field"><label for="sales_delivery_method"/);
  assert.ok(html.indexOf('sales_delivery_method')<html.indexOf('sales-order-line-grid'));
});

test('draft table exposes order header columns in the same order as the input boxes',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const head=html.match(/<table aria-label="작성 중인 수주 품목"><thead><tr>([\s\S]*?)<\/tr><\/thead>/)[1];
  const labels=[...head.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(match=>match[1]);
  assert.deepEqual(labels.slice(0,7),['수주일자','수주번호','수주형태','거래처(성명)','연락처','배송방법','품번']);
  assert.equal(labels.at(-1),'관리');
});
