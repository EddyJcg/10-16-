const {test} = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {createInventoryWorkbook} = require('../inventory-excel.js');

test('export produces a real XLSX workbook with Korean headings and typed values',async () => {
  const workbook = createInventoryWorkbook(ExcelJS,[{name:'복사용지',category:'사무용품',received_date:'2026-10-16',quantity:12,minimum:5,price:4500}]);
  const bytes = await workbook.xlsx.writeBuffer();
  assert.equal(bytes[0],0x50); assert.equal(bytes[1],0x4b);
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(bytes);
  const sheet = loaded.getWorksheet('재고목록');
  assert.deepEqual(sheet.getRow(1).values.slice(1),['품목명','분류','입고일자','현재 수량','최소 수량','단가(원)']);
  assert.equal(sheet.getCell('A2').value,'복사용지');
  assert.equal(sheet.getCell('C2').value.toISOString(),'2026-10-16T00:00:00.000Z');
  assert.equal(sheet.getCell('C2').numFmt,'yyyy-mm-dd');
  assert.equal(sheet.getCell('D2').value,12);
  assert.equal(sheet.getCell('F2').value,4500);
  assert.equal(sheet.views[0].ySplit,1);
  assert.ok(sheet.autoFilter);
});

test('missing received dates stay blank, zeros stay numeric and formula-like names stay text',async () => {
  const workbook = createInventoryWorkbook(ExcelJS,[{name:'=1+1',category:'기타',received_date:null,quantity:0,minimum:0,price:0}]);
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = loaded.getWorksheet('재고목록');
  assert.equal(sheet.getCell('A2').value,'=1+1');
  assert.equal(sheet.getCell('A2').type,ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('C2').value,null);
  assert.equal(sheet.getCell('D2').value,0);
  assert.equal(sheet.getCell('F2').value,0);
});
