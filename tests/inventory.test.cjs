const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {STOCK_FIELDS,STOCK_DISPLAY_FIELDS,PRODUCT_FIELDS,PRODUCT_UNITS,planFifo,validDate,filterInventoryItems,stockRiskItems,stockAgingRows,sixMonthsAgoDate}=require('../inventory-model.js');
const {CURRENT_STOCK_FIELDS,currentStockRows}=require('../inventory-model.js');

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
test('product information form autofills existing item by SKU or unique specification',()=>{
  const nodes=new Map(),context=vm.createContext({document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:''});return nodes.get(id);}}});
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
  assert.match(script,/order=>\(order\.sales_status\|\|'매출미완료'\)==='매출미완료'/);
  assert.match(style,/body\[data-print-target="sales-balance"\] #sales-balance/);
});
test('dashboard replaces registered-item card with live sales backlog count and amount',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),app=fs.readFileSync('inventory-app.js','utf8'),renderer=fs.readFileSync('inventory-render.js','utf8');
  const stats=html.match(/<section class="stats"[^>]*>([\s\S]*?)<\/section>/)?.[1]||'';
  assert.match(stats,/<span>수주잔고 현황<\/span><strong id="total-sales-backlog-count">0건<\/strong><span id="total-sales-backlog-amount" class="stat-description">합계 0원<\/span>/);
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
  const transactionFilter=html.match(/<div class="transaction-filter">([\s\S]*?)<\/div><div class="search-actions">/)[1];
  assert.match(transactionFilter,/<select id="movement-kind-filter"[^>]*>/);
  for(const condition of ['opening','receipt','issue','supplier'])
    assert.match(transactionFilter,new RegExp(`<option value="${condition}">`));
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
  const ctx=vm.createContext({document:{getElementById:id=>fields[id]},window:{alert:message=>alerts.push(message)},planFifo,validDate:value=>value==='2020-01-02',PRODUCT_FIELDS:['product_code'],client:{rpc(){rpcCalls++;}}});
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
