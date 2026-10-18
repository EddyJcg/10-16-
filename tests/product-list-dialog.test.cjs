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

test('print settings expose scale and four adjustable margins and apply them to page output',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(html,/id="product-list-print-scale" type="range" min="50" max="100" step="5"/);
  for(const side of ['top','right','bottom','left']){
    assert.match(html,new RegExp(`id="print-margin-${side}" type="number" min="2" max="40"`));
    assert.match(html,new RegExp(`class="margin-handle margin-${side}" data-margin="${side}" role="slider"`));
  }
  assert.match(script,/setPointerCapture\(event\.pointerId\)/);
  assert.match(script,/event\.clientY-y\)\*210\/paper\.height/);
  assert.match(script,/event\.clientX-x\)\*297\/paper\.width/);
  assert.match(script,/@page\{size:A4 landscape;margin:/);
  assert.match(script,/zoom:\$\{scale\};width:\$\{100\/scale\}%/);
  assert.match(style,/@page\{size:A4 landscape\}/);
});

test('print settings button is visually stacked below the print button',()=>{
  const style=readFileSync('inventory.css','utf8');
  assert.match(style,/#print-product-list\{grid-column:1;grid-row:1\}/);
  assert.match(style,/#toggle-print-settings\{grid-column:1;grid-row:2\}/);
  assert.match(style,/#close-product-list\{grid-column:2;grid-row:1/);
});
