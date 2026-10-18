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

test('print settings button is positioned to the left of print',()=>{
  const html=readFileSync('inventory.html','utf8');
  const toolbar=html.match(/<div class="product-list-toolbar">([\s\S]*?)<\/div>/)?.[1]||'';
  assert.ok(toolbar.indexOf('data-print-settings="product-list"')<toolbar.indexOf('data-print="product-list"'));
});

test('current stock and movement history expose printing with shared adjustable settings',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  for(const target of ['current-stock','movement-history']){
    assert.match(html,new RegExp(`data-print-settings="${target}"`));
    assert.match(html,new RegExp(`data-print="${target}"`));
  }
  assert.match(html,/<dialog id="print-settings-dialog"/);
  assert.match(script,/document\.querySelectorAll\('\[data-print\]'\)/);
  assert.match(script,/document\.querySelectorAll\('\[data-print-settings\]'\)/);
  assert.match(script,/'current-stock':'#current-stock-dialog table'/);
  assert.match(script,/'movement-history':'#movement-history table'/);
  assert.match(style,/body\[data-print-target="current-stock"\] #current-stock-dialog/);
  assert.match(style,/body\[data-print-target="movement-history"\] #movement-history/);
});

test('movement history opens a searchable full-history dialog and preserves FIFO details and printing',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(html,/<button type="button" class="sidebar-action" id="movement-list-button" aria-haspopup="dialog">입출고 내역<\/button>/);
  assert.match(html,/<dialog id="movement-list-dialog" aria-labelledby="movement-list-title">/);
  for(const id of ['movement-list-start-date','movement-list-end-date','movement-list-supplier','movement-list-query','movement-list-kind','movement-list-items'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.match(script,/readAll\('stock_movements','sequence_id'\)/);
  assert.match(script,/movementListRows\.filter/);
  assert.match(script,/showAllocations\(movement\)/);
  assert.match(script,/'movement-list':'#movement-list-dialog \.product-list-table table'/);
  assert.match(script,/movement-list-dialog/);
  assert.match(style,/body\[data-print-target="movement-list"\] #movement-list-dialog/);
});

test('movement history columns can be resized by pointer and keyboard and keep their widths',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  const columns=html.match(/<colgroup id="movement-list-columns">([\s\S]*?)<\/colgroup>/)?.[1]||'';
  const resizers=html.match(/class="column-resizer"/g)||[];
  assert.equal((columns.match(/<col>/g)||[]).length,11);
  assert.equal(resizers.length,11);
  assert.match(script,/function startMovementListColumnResizing\(\)/);
  assert.match(script,/handle\.setPointerCapture\(event\.pointerId\)/);
  assert.match(script,/ArrowLeft:widths\[index\]-delta,ArrowRight:widths\[index\]\+delta/);
  assert.match(script,/inventory-movement-list-column-widths/);
  assert.match(style,/#movement-list-table\{width:max-content;table-layout:fixed\}/);
  assert.match(style,/#movement-list-table \.column-resizer\{display:none!important\}/);
});
