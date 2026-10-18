const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('sidebar opens the complete product list in a separate tab',()=>{
  const html=readFileSync('inventory.html','utf8');
  assert.match(html,/<a class="sidebar-action" href="\/products\.html" target="_blank" rel="opener">품목목록/);
});

test('separate product list supports period, supplier and product detail searches',()=>{
  const html=readFileSync('products.html','utf8');
  for(const id of ['start-date','end-date','supplier-filter','product-query','product-head','products'])
    assert.match(html,new RegExp(`id="${id}"`));
  for(const detail of ['품번','품명','규격','저장위치'])
    assert.ok(html.includes(detail));
  assert.match(html,/<script src="\/inventory-model\.js"><\/script><script src="\/products\.js"><\/script>/);
});

test('product list uses the shared stock fields and filtered full stock summary',()=>{
  const script=readFileSync('products.js','utf8');
  const html=readFileSync('products.html','utf8');
  assert.match(script,/STOCK_FIELDS\.forEach/);
  assert.match(script,/readAll\('stock_summary'\)/);
  assert.match(script,/filterInventoryItems\(items,\{query:appliedQuery,supplier:appliedSupplier,dateProductIds:movementProductIds\}\)/);
  assert.match(script,/storageKey:'inventory-note-stock-session'/);
  assert.match(html,/<script>if\(window\.opener\)window\.opener=null;<\/script>/);
});
