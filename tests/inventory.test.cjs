const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {STOCK_FIELDS,planFifo,validDate}=require('../inventory-model.js');

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
