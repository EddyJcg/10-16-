const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {STOCK_FIELDS,planFifo,validDate,filterInventoryItems}=require('../inventory-model.js');
const {CURRENT_STOCK_FIELDS,currentStockRows}=require('../inventory-model.js');

test('current stock keeps all workbook fields except opening, receipt and issue totals',()=>{
  assert.deepEqual(CURRENT_STOCK_FIELDS.map(field=>field.label),['품목분류','품번','품명','규격','재질','재고수량','재고단가','재고금액','저장위치','납품업체']);
});
test('current stock includes every positive balance and excludes exhausted products',()=>{
  const rows=[{id:1,stock_quantity:2},{id:2,stock_quantity:0},{id:3,stock_quantity:'3'},{id:4,stock_quantity:null},{id:5,stock_quantity:-1}];
  assert.deepEqual(currentStockRows(rows).map(row=>row.id),[1,3]);
  assert.equal(rows.length,5);
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
test('start, end and supplier search inputs are optional',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  for(const id of ['movement-start-date','movement-end-date','supplier-filter'])
    assert.match(html,new RegExp(`<input id="${id}"(?![^>]*\\brequired\\b)[^>]*>`));
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
});
test('insufficient FIFO preview does not present a misleading unit price',()=>{
  const fields={product_code:{value:'SKU'},movement_quantity:{value:'2'},movement_date:{value:'2020-01-02'},movement_cost:{value:'0'},movement_amount:{value:''},'form-message':{textContent:''}};
  const ctx=vm.createContext({document:{getElementById:id=>fields[id]},planFifo,renderFifoPreview(){}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  vm.runInContext('mode="issue";items=[{product_code:"SKU"}];productLots=[{id:1,received_date:"2020-01-01",remaining_quantity:1,unit_cost:30000}];updateAmounts()',ctx);
  assert.equal(fields.movement_cost.value,'');assert.equal(fields.movement_amount.value,'재고 부족');assert.match(fields['form-message'].textContent,/1개 부족/);
});
test('FIFO preview adds decimal currency at cent precision',()=>{
  const plan=planFifo([{id:1,received_date:'2020-01-01',remaining_quantity:1,unit_cost:0.1},{id:2,received_date:'2020-01-01',remaining_quantity:1,unit_cost:0.2}],2,'2020-01-02');
  assert.equal(plan.amount,0.3);
});
