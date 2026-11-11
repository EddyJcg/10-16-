const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,focus(){this.focused=true;},reset(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},window:{alert(){}},
    validOrderDueDate:value=>['2026-11-11','2026-12-01'].includes(value),money:value=>String(value)});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.renderSalesDraftLines=()=>{};
  const values={sales_order_date:'2026-11-11',sales_order_number:'SO-1',sales_order_type:'온라인 수주',
    sales_vendor_name:'고객',sales_vendor_contact:'',sales_delivery_method:'',
    sales_product_code:'A',sales_product_name:'품목',sales_specification:'규격',sales_unit:'EA(개)',
    sales_quantity:'2',sales_unit_price:'0',sales_address:'서울특별시 강남구 테헤란로 1',sales_postal_code:'06234',sales_due_date:'2026-12-01'};
  Object.entries(values).forEach(([id,value])=>element(id).value=value);
  return {context,element,values};
}

test('연락처·배송방법을 제외한 각 항목이 없으면 가수주가 등록되지 않는다',()=>{
  const required={sales_order_date:'수주일자',sales_order_number:'수주번호',sales_order_type:'수주형태',sales_vendor_name:'거래처',
    sales_product_code:'품번',sales_product_name:'품명',sales_specification:'규격',sales_unit:'단위',
    sales_quantity:'수량',sales_unit_price:'단가',sales_address:'주소',sales_due_date:'납기일자'};
  for(const [id,label] of Object.entries(required)){
    const {context,element}=setup();
    element(id).value='';
    vm.runInContext('addSalesOrderLine()',context);
    assert.equal(vm.runInContext('salesDraftLines.length',context),0,id);
    assert.match(element('sales-draft-validation-status').textContent,/필수 항목/);
    assert.ok(element('sales-draft-validation-status').textContent.includes(label),id);
    assert.equal(element(id).focused,true,id);
  }
  const {context}=setup();
  vm.runInContext('addSalesOrderLine()',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(vm.runInContext('salesDraftLines[0].unit_price',context),0);
});

test('잘못된 숫자와 날짜는 원인을 표시하고 수정 후 등록된다',()=>{
  const {context,element}=setup();
  element('sales_quantity').value='1.5';
  element('sales_unit_price').value='1.234';
  element('sales_due_date').value='1899-12-31';
  vm.runInContext('addSalesOrderLine()',context);
  const message=element('sales-draft-validation-status').textContent;
  for(const label of ['수량','단가','납기일자'])assert.ok(message.includes(label),label);
  assert.equal(element('sales_quantity').focused,true);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  element('sales_quantity').value='2';
  element('sales_unit_price').value='0';
  element('sales_due_date').value='2026-12-01';
  vm.runInContext('addSalesOrderLine()',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(element('sales-draft-validation-status').textContent,'');
});

test('저장된 수주를 불러와도 가수주 입력 오류가 사라지지 않는다',async()=>{
  const {context,element}=setup();
  let resolveQuery;
  context.testClient={from:()=>({select:()=>({order:()=>({range:()=>new Promise(resolve=>{resolveQuery=resolve;})})})})};
  vm.runInContext('client=testClient',context);
  for(const name of ['renderSalesOrders','renderSalesStatus','renderSalesRegister','renderSalesBalance','updateIssueSalesOrders'])
    context[name]=()=>{};
  const loading=context.loadSalesOrders();
  element('sales_specification').value='';
  context.addSalesOrderLine();
  resolveQuery({data:[],error:null});
  await loading;
  assert.match(element('sales-draft-validation-status').textContent,/규격/);
  assert.equal(element('sales-order-status').textContent,'');
});

test('같은 수주에 여러 품목을 추가해도 수주번호와 공통 정보가 유지된다',()=>{
  const {context,element,values}=setup();
  vm.runInContext('addSalesOrderLine()',context);
  for(const id of ['sales_order_date','sales_order_number','sales_order_type','sales_vendor_name','sales_vendor_contact','sales_delivery_method'])
    assert.equal(element(id).value,values[id],id);
  for(const id of ['sales_product_code','sales_product_name','sales_specification','sales_unit','sales_quantity','sales_unit_price','sales_amount','sales_address','sales_postal_code','sales_due_date'])
    assert.equal(element(id).value,'',id);
  for(const id of ['sales_product_code','sales_product_name','sales_specification','sales_unit','sales_quantity','sales_unit_price','sales_address','sales_postal_code','sales_due_date'])
    element(id).value=values[id];
  element('sales_product_code').value='B';
  element('sales_product_name').value='두 번째';
  vm.runInContext('addSalesOrderLine()',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),2);
  assert.equal(vm.runInContext('salesDraftLines[0].product_code',context),'A');
  assert.equal(vm.runInContext('salesDraftLines[1].product_code',context),'B');
  assert.equal(element('sales_order_number').value,'SO-1');
});

test('가수주 수정 중에는 저장을 차단하고 수정 완료 후 기존 행을 갱신한다',async()=>{
  const {context,element}=setup();
  vm.runInContext(`currentUser={id:'u'};addSalesOrderLine();salesDraftLines[0].line_id='saved-id';
    salesDraftLines[0].selected=false;editSalesDraft(salesDraftLines[0].draftId)`,context);
  assert.equal(element('sales_product_code').value,'A');
  assert.equal(element('sales_product_name').value,'품목');
  assert.equal(element('sales_amount').value,'0원');
  element('sales_product_name').value='수정 품목';
  element('sales_quantity').value='3';
  await vm.runInContext('saveSalesOrder({preventDefault(){}})',context);
  assert.match(element('sales-order-status').textContent,/수정 중인 가수주/);
  vm.runInContext('addSalesOrderLine()',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(vm.runInContext('salesDraftLines[0].product_name',context),'수정 품목');
  assert.equal(vm.runInContext('salesDraftLines[0].quantity',context),3);
  assert.equal(vm.runInContext('salesDraftLines[0].line_id',context),'saved-id');
  assert.equal(vm.runInContext('salesDraftLines[0].selected',context),false);
  assert.equal(vm.runInContext('editingSalesDraftId',context),'');
});

test('가수주 삭제는 지정 행만 지우며 수정 중인 행 삭제 시 입력을 초기화한다',()=>{
  const {context,element,values}=setup();
  vm.runInContext('addSalesOrderLine()',context);
  Object.entries(values).forEach(([id,value])=>element(id).value=value);
  element('sales_product_code').value='B';
  vm.runInContext('addSalesOrderLine();editSalesDraft(salesDraftLines[0].draftId)',context);
  vm.runInContext('deleteSalesDraft(salesDraftLines[1].draftId)',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(element('sales_product_code').value,'A');
  vm.runInContext('deleteSalesDraft(salesDraftLines[0].draftId)',context);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  assert.equal(element('sales_product_code').value,'');
  assert.equal(vm.runInContext('editingSalesDraftId',context),'');
});

test('엑셀 가수주도 공통 필수 정보와 각 품목의 품번·규격이 필요하다',async()=>{
  const {context,element}=setup(),alerts=[];
  context.window={alert:message=>alerts.push(message),ExcelJS:{Workbook:class{
    constructor(){this.xlsx={load:async()=>{}};}
  }},parseSalesOrderImportWorkbook:()=>({errors:[],rows:[
    {product_code:'',product_name:'품목',specification:'규격',unit:'EA(개)',quantity:1,unit_price:0,due_date:'2026-12-01'}
  ]})};
  context.PRODUCT_UNITS=['EA(개)'];
  vm.runInContext("currentUser={id:'u'}",context);
  const event=()=>({target:{files:[{arrayBuffer:async()=>new ArrayBuffer(0)}],value:'file'}});
  element('sales_order_number').value='';
  await context.importSalesOrderFile(event());
  assert.match(element('sales-order-status').textContent,/먼저 입력/);
  element('sales_order_number').value='SO-1';
  await context.importSalesOrderFile(event());
  assert.match(alerts[0],/품번과 규격은 필수/);
  assert.equal(vm.runInContext('salesDraftLines.length',context),0);
  context.window.parseSalesOrderImportWorkbook=()=>({errors:[],rows:[
    {product_code:'A',product_name:'품목',specification:'규격',unit:'EA(개)',quantity:1,unit_price:0,due_date:'2026-12-01'}
  ]});
  await context.importSalesOrderFile(event());
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
});

test('표 메뉴는 수정 중인 가수주를 덮어쓰거나 초기화하지 않는다',()=>{
  const {context,element}=setup();
  vm.runInContext("addPopupTableDraftRow('sales-order-draft-items');editSalesDraft(salesDraftLines[0].draftId)",context);
  element('sales_product_name').value='수정 중';
  assert.equal(vm.runInContext("addPopupTableDraftRow('sales-order-draft-items')",context),false);
  assert.equal(vm.runInContext("resetPopupTableDraftRows('sales-order-draft-items')",context),false);
  assert.equal(vm.runInContext('salesDraftLines.length',context),1);
  assert.equal(element('sales_product_name').value,'수정 중');
});
