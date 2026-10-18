const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {createInventoryWorkbook,createDataWorkbook}=require('../inventory-excel.js');
const {STOCK_FIELDS}=require('../inventory-model.js');
test('Excel export retains all 19 fields, numeric values and FIFO costs',async()=>{
  const item={product_category:'BAG',product_code:'ET005-00-1120',product_name:'Eco Bag',specification:'450*300 자연색',material:'니나리찌',opening_quantity:1,opening_unit_cost:28000,opening_amount:28000,receipt_quantity:1,receipt_unit_cost:30000,receipt_amount:30000,issue_quantity:1,issue_unit_cost:28000,issue_amount:28000,stock_quantity:1,stock_unit_cost:30000,stock_amount:30000,storage_location:'A-1-3-1',supplier:'종로가방'};
  const bytes=await createInventoryWorkbook(ExcelJS,[item]).xlsx.writeBuffer();
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
  const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);const sheet=loaded.getWorksheet('재고현황');
  assert.deepEqual(sheet.getRow(1).values.slice(1),STOCK_FIELDS.map(field=>field.label));
  assert.equal(sheet.getCell('N2').value,28000);assert.equal(sheet.getCell('O2').value.result,1);assert.equal(sheet.getCell('P2').value.result,30000);assert.equal(sheet.getCell('Q2').value,30000);assert.equal(sheet.getCell('S2').value,'종로가방');
  assert.equal(sheet.views[0].xSplit,3);assert.equal(sheet.views[0].ySplit,1);
});
test('formula-like product names remain text and zero-stock unit cost is safe',async()=>{
  const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await createInventoryWorkbook(ExcelJS,[{product_name:'=1+1',stock_quantity:0,stock_amount:0}]).xlsx.writeBuffer());
  const sheet=loaded.getWorksheet('재고현황');assert.equal(sheet.getCell('C2').value,'=1+1');assert.equal(sheet.getCell('C2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('P2').result,0);
});
test('filtered list export writes typed values, headers, filters and frozen header row',async()=>{
  const workbook=createDataWorkbook(ExcelJS,{sheetName:'수주현황',headers:['수주번호','수주금액'],rows:[['=SUM(A1)',1250.5]],numericColumns:[1]});
  const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet=loaded.getWorksheet('수주현황');
  assert.deepEqual(sheet.getRow(1).values.slice(1),['수주번호','수주금액']);
  assert.equal(sheet.getCell('A2').value,'=SUM(A1)');
  assert.equal(sheet.getCell('A2').type,ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('B2').value,1250.5);
  assert.equal(sheet.autoFilter,'A1:B2');
  assert.equal(sheet.views[0].ySplit,1);
});
