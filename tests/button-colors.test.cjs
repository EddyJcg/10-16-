const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const inventoryCss=fs.readFileSync('inventory.css','utf8');
const adminCss=fs.readFileSync('admin.css','utf8');

test('only Excel upload/download buttons use the reference color and print/save colors remain distinct',()=>{
  assert.doesNotMatch(inventoryCss,/background:#d2edf5/);
  assert.match(inventoryCss,/button\[data-print\],button\[data-print-settings\]/);
  assert.match(inventoryCss,/button\[id\^="save-"\]/);
  assert.match(inventoryCss,/button\[id\^="export-"\]/);
  for(const id of ['#export','#import-product-info-button','#import-receipt-button','#import-sales-order-button'])
    assert.ok(inventoryCss.includes(id),`Excel button selector ${id}`);
  assert.match(inventoryCss,/background:#2b9fc1!important;border-color:#2b9fc1!important;color:#fff!important/);
});

test('admin page retains its original button styles and blue save button',()=>{
  assert.doesNotMatch(adminCss,/d2edf5/);
  assert.match(adminCss,/#save-user\{background:#348fe2;border-color:#348fe2;color:#fff\}/);
});
