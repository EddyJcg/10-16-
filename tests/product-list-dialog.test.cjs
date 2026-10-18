const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('sidebar opens the searchable full product list in a modal dialog',()=>{
  const html=readFileSync('inventory.html','utf8');
  assert.match(html,/<button type="button" class="sidebar-action" id="product-list-button" aria-haspopup="dialog">품목목록<\/button>/);
  assert.match(html,/<dialog id="product-list-dialog" aria-labelledby="product-list-title">/);
  for(const id of ['product-list-start-date','product-list-end-date','product-list-supplier','product-list-query','product-list-head','product-list-items'])
    assert.match(html,new RegExp(`id="${id}"`));
  for(const detail of ['품번','품명','규격','저장위치'])
    assert.ok(html.includes(detail));
});

test('product list dialog searches all stock fields and prints the displayed list',()=>{
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(script,/filterInventoryItems\(items,\{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds\}\)/);
  assert.match(script,/findMovementProductIds\(startDate,endDate,''\)/);
  assert.match(script,/window\.print\(\)/);
  assert.match(style,/@media print/);
  assert.match(style,/#product-list-dialog \.product-list-search,#product-list-dialog \.product-list-status/);
});

test('product list delegates margin and scale controls to the browser print dialog',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(html,/<button id="print-product-list" class="secondary" type="button">인쇄<\/button>/);
  assert.doesNotMatch(html,/toggle-print-settings|product-list-print-settings|print-margin-(top|right|bottom|left)|product-list-print-scale/);
  assert.match(script,/function printProductList\(\)\s*\{\s*if\(!\$\(\'product-list-dialog\'\)\.open\)return;\s*window\.print\(\);\s*\}/);
  assert.doesNotMatch(script,/printMargins|applyProductListPrintSettings|startProductListPrintSettings/);
  assert.match(style,/@page\{size:A4 landscape\}/);
  assert.doesNotMatch(style,/@page\{[^}]*margin:|zoom:/);
});

test('native print dialog is the only print settings entry point',()=>{
  const html=readFileSync('inventory.html','utf8');
  assert.doesNotMatch(html,/인쇄 설정|비율 축소|여백 경계선/);
});
