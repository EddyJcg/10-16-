const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const inventoryCss=fs.readFileSync('inventory.css','utf8');
const adminCss=fs.readFileSync('admin.css','utf8');

test('non-search inventory buttons use the reference color while Excel and print/save colors remain distinct',()=>{
  assert.match(inventoryCss,/body button:not\(\[data-print\]\):not\(\[data-print-settings\]\)/);
  assert.match(inventoryCss,/background:#d2edf5!important;border-color:#d2edf5!important;color:#203b32!important/);
  for(const selector of [
    ':not(#search-product-list)',':not(#search-movement-list)',':not(#search-sales-status-orders)',
    ':not(#search-sales-register)',':not(#search-purchase-orders)',':not(#apply-sales-balance-search)',
    ':not(#apply-search)',':not(#apply-sales-status-search)',':not(#apply-sales-query-search)'
  ])assert.ok(inventoryCss.includes(selector),`search button exclusion ${selector}`);
  assert.match(inventoryCss,/button\[data-print\],button\[data-print-settings\]/);
  assert.match(inventoryCss,/button\[id\^="save-"\]/);
  assert.match(inventoryCss,/button\[id\^="export-"\]/);
  for(const id of ['#export','#import-product-info-button','#import-receipt-button','#import-sales-order-button'])
    assert.ok(inventoryCss.includes(id),`Excel button selector ${id}`);
  assert.match(inventoryCss,/background:#2b9fc1!important;border-color:#2b9fc1!important;color:#fff!important/);
});

test('admin buttons use the reference color except for the blue save button',()=>{
  assert.match(adminCss,/body button:not\(#save-user\)\{background:#d2edf5!important;border-color:#d2edf5!important;color:#203b32!important\}/);
  assert.match(adminCss,/#save-user\{background:#348fe2;border-color:#348fe2;color:#fff\}/);
});
