const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

test('separate receipt and issue histories preserve their kind through reset and export',async()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,open:false,setAttribute(){},showModal(){this.open=true;}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element}});
  vm.runInContext(readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'test'};items=[];
    loadStock=async()=>{};updateMovementListSuppliers=()=>{};renderMovementList=()=>{};
    readAll=async()=>[{id:'r',sequence_id:1,kind:'receipt',movement_date:'2026-10-01'},{id:'i',sequence_id:2,kind:'issue',movement_date:'2026-10-02'},{id:'o',sequence_id:3,kind:'opening',movement_date:'2026-10-03'}];
    downloadDataWorkbook=(...args)=>args;`,context);
  for(const [kind,title] of [['receipt','입고 내역'],['issue','출고 내역']]){
    await vm.runInContext(`showMovementList('${kind}')`,context);
    assert.equal(element('movement-list-heading').textContent,title);
    assert.equal(element('movement-list-kind').value,kind);
    assert.equal(element('movement-list-kind').disabled,true);
    element('movement-list-start-date').value='2026-10-10';
    vm.runInContext('clearMovementListSearch()',context);
    assert.equal(element('movement-list-start-date').value,'');
    assert.equal(element('movement-list-kind').value,kind);
    assert.deepEqual(Array.from(vm.runInContext('filteredMovementListRows().map(row=>row.kind)',context)),[kind]);
    const exported=vm.runInContext('exportMovementListExcel()',context);
    assert.equal(exported[1],title);
    assert.equal(exported[4].length,1);
    assert.equal(exported[4][0][2],kind==='receipt'?'입고':'출고');
  }
});

test('sidebar opens the searchable full product list in a modal dialog',()=>{
  const html=readFileSync('inventory.html','utf8');
  assert.match(html,/<button type="button" class="sidebar-action" id="product-list-button" aria-haspopup="dialog">품목 목록<\/button>/);
  assert.match(html,/<dialog id="product-list-dialog" aria-labelledby="product-list-title">/);
  for(const id of ['product-list-start-date','product-list-end-date','product-list-supplier','product-list-query','product-list-head','product-list-items'])
    assert.match(html,new RegExp(`id="${id}"`));
  for(const detail of ['품번','품명','규격','저장위치'])
    assert.ok(html.includes(detail));
});

test('product list dialog searches all stock fields and prints the displayed list',()=>{
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(script,/function productListFields\(\) \{ return STOCK_DISPLAY_FIELDS\.flatMap\(field=>field\.key==='material'\?\[field,\{key:'color',label:'색상',numeric:false\}\]:\[field\]\); \}/);
  assert.match(script,/productListFields\(\)\.forEach\(field=>/);
  assert.match(script,/cell\.colSpan=fields\.length\+1/);
  assert.match(script,/filterInventoryItems\(items,\{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds\}\)/);
  assert.match(script,/findMovementProductIds\(startDate,endDate,''\)/);
  assert.match(script,/window\.print\(\)/);
  assert.match(style,/@media print/);
  assert.match(style,/#product-list-dialog \.product-list-search,#product-list-dialog \.product-list-status/);
});

test('all requested status and inventory dialogs offer Excel downloads using visible result sets',()=>{
  const html=readFileSync('inventory.html','utf8'),script=readFileSync('inventory-app.js','utf8');
  for(const id of ['export-sales-status','export-current-stock','export-product-list','export-movement-list'])
    assert.match(html,new RegExp(`id="${id}"[^>]*>↓ Excel 다운로드`),id);
  for(const [id,handler] of [
    ['export-sales-status','exportSalesStatusExcel'],['export-current-stock','exportCurrentStockExcel'],
    ['export-product-list','exportProductListExcel'],['export-movement-list','exportMovementListExcel']
  ])assert.match(script,new RegExp(`\\$\\('${id}'\\)\\.addEventListener\\('click',${handler}\\)`),id);
  assert.match(script,/filterSalesOrders\(salesOrders,appliedSalesStatusFilters\)/);
  assert.match(script,/currentStockRows\(items\)/);
  assert.match(script,/filterInventoryItems\(items,\{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds\}\)/);
  assert.match(script,/const rows=filteredMovementListRows\(\)/);
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

test('current stock and sales balance expose printing with shared adjustable settings',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  for(const target of ['current-stock','sales-balance']){
    assert.match(html,new RegExp(`data-print-settings="${target}"`));
    assert.match(html,new RegExp(`data-print="${target}"`));
  }
  assert.match(html,/<dialog id="print-settings-dialog"/);
  assert.match(script,/document\.querySelectorAll\('\[data-print\]'\)/);
  assert.match(script,/document\.querySelectorAll\('\[data-print-settings\]'\)/);
  assert.match(script,/'current-stock':'#current-stock-dialog table'/);
  assert.match(script,/'sales-balance':'#sales-balance table'/);
  assert.match(style,/body\[data-print-target="current-stock"\] #current-stock-dialog/);
  assert.match(style,/body\[data-print-target="sales-balance"\] #sales-balance/);
});

test('stock risk card opens a printable list and its threshold uses standard stock',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const renderer=readFileSync('inventory-render.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  const model=readFileSync('inventory-model.js','utf8');
  assert.match(html,/<button id="stock-risk-button" class="stat stat-action" type="button" aria-haspopup="dialog">/);
  assert.doesNotMatch(html,/<span>재고수량<\/span><strong id="total-qty">/);
  assert.match(html,/<input id="info_standard_stock_quantity" type="number" required min="1" max="1000000" step="1"/);
  assert.match(html,/<dialog id="stock-risk-dialog" aria-labelledby="stock-risk-title">/);
  assert.match(html,/data-print-settings="stock-risk"/);
  assert.match(html,/data-print="stock-risk"/);
  assert.match(script,/stock-risk':'#stock-risk-dialog table'/);
  assert.match(script,/function showStockRisk\(\)/);
  assert.match(script,/set_stock_product_standard_stock_quantity/);
  assert.match(script,/다른 품목정보는 변경되지 않았습니다/);
  assert.match(renderer,/stockRiskItems\(items\)/);
  assert.match(model,/stock\*5<standard/);
  assert.match(style,/body\[data-print-target="stock-risk"\] #stock-risk-dialog/);
});

test('long-stock card displays aged quantities and opens printable lot details',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const renderer=readFileSync('inventory-render.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  const sql=readFileSync('supabase/fifo.sql','utf8');
  const card=html.match(/<section class="stats"[^>]*>([\s\S]*?)<\/section>/)?.[1]||'';
  assert.match(card,/<button id="long-stock-button" class="stat stat-action long-stock" type="button" aria-haspopup="dialog">/);
  assert.match(card,/<span>장기재고<\/span><strong id="total-aged-qty">0<\/strong>/);
  assert.doesNotMatch(card,/기록된 입출고|total-movements/);
  assert.match(html,/<dialog id="long-stock-dialog" aria-labelledby="long-stock-title">/);
  for(const heading of ['입고일시','품번','품명','규격','재질','색상','단위','수량','단가','금액','위치','거래처명'])
    assert.ok(html.includes('<th>'+heading+'</th>'),heading);
  assert.match(sql,/p\.specification,p\.material,p\.color,p\.unit,p\.storage_location,p\.supplier/);
  for(const target of ['long-stock'])
    assert.match(html,new RegExp(`data-print-settings="${target}"`)) && assert.match(html,new RegExp(`data-print="${target}"`));
  assert.match(script,/from\('stock_aging'\)/);
  assert.match(script,/function showLongStock\(\)/);
  assert.match(script,/'long-stock':'#long-stock-dialog table'/);
  assert.match(renderer,/formatStockQuantityTotals\(rows\.map\(row=>\(\{stock_quantity:row\.remaining_quantity,unit:row\.unit\}\)\)\)/);
  assert.match(renderer,/receivedAt\.toLocaleString\('ko-KR'/);
  assert.match(sql,/create or replace view public\.stock_aging with \(security_invoker = true\)/);
  assert.match(style,/body\[data-print-target="long-stock"\] #long-stock-dialog/);
});

test('movement history opens a searchable full-history dialog and preserves FIFO details and printing',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(html,/<button type="button" class="sidebar-action" id="receipt-list-button" aria-haspopup="dialog">입고 내역<\/button>/);
  assert.match(html,/<button type="button" class="sidebar-action" id="issue-list-button" aria-haspopup="dialog">출고 내역<\/button>/);
  assert.doesNotMatch(html,/id="movement-list-button"/);
  assert.ok(html.indexOf('id="receipt-list-button"')<html.indexOf('id="issue-list-button"'));
  assert.ok(html.indexOf('id="issue-list-button"')<html.indexOf('id="product-list-button"'));
  assert.match(html,/<dialog id="movement-list-dialog" aria-labelledby="movement-list-title">/);
  for(const id of ['movement-list-start-date','movement-list-end-date','movement-list-supplier','movement-list-query','movement-list-kind','movement-list-items'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.match(script,/readAll\('stock_movements','sequence_id'\)/);
  assert.match(script,/movementListRows\.filter/);
  assert.match(script,/showAllocations\(movement\)/);
  assert.match(script,/item\?\.color/);
  assert.match(script,/item\?\.specification,item\?\.color,item\?\.storage_location/);
  assert.match(script,/'movement-list':'#movement-list-dialog \.product-list-table table'/);
  assert.match(script,/movement-list-dialog/);
  assert.match(style,/body\[data-print-target="movement-list"\] #movement-list-dialog/);
});

test('movement history columns can be resized by pointer and keyboard and keep their widths',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const renderer=readFileSync('inventory-render.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  const columns=html.match(/<colgroup id="movement-list-columns">([\s\S]*?)<\/colgroup>/)?.[1]||'';
  const resizers=html.match(/class="column-resizer"/g)||[];
  assert.equal((columns.match(/<col>/g)||[]).length,13);
  assert.equal(resizers.length,13);
  assert.match(html,/<th>색상<button class="column-resizer" type="button" data-column="6"/);
  assert.match(html,/<th>단위<button class="column-resizer" type="button" data-column="9"/);
  assert.match(script,/function startColumnResizing\(tableId,columnsId,storageKey,defaults\)/);
  assert.match(script,/handle\.setPointerCapture\(event\.pointerId\)/);
  assert.match(script,/ArrowLeft:widths\[index\]-delta,ArrowRight:widths\[index\]\+delta/);
  assert.match(script,/inventory-movement-list-column-widths/);
  assert.match(style,/#current-stock-table,#movement-list-table\{width:max-content;table-layout:fixed\}/);
  assert.match(style,/#current-stock-table \.column-resizer,#movement-list-table \.column-resizer\{display:none!important\}/);
  assert.match(renderer,/resizer\.className='column-resizer'/);
});

test('current stock dialog has a resizable column for every displayed field',()=>{
  const html=readFileSync('inventory.html','utf8');
  const script=readFileSync('inventory-app.js','utf8');
  const renderer=readFileSync('inventory-render.js','utf8');
  const style=readFileSync('inventory.css','utf8');
  assert.match(html,/<table id="current-stock-table" aria-label="현재 재고현황">/);
  const columns=html.match(/<colgroup id="current-stock-columns">([\s\S]*?)<\/colgroup>/)?.[1]||'';
  assert.equal((columns.match(/<col>/g)||[]).length,13);
  assert.match(renderer,/\[\{label:'일련번호',numeric:true\},\.\.\.CURRENT_STOCK_FIELDS\]\.forEach\(\(field,index\)/);
  assert.match(script,/'current-stock-table','current-stock-columns','inventory-current-stock-column-widths'/);
  assert.match(style,/#current-stock-table \.column-resizer,#movement-list-table \.column-resizer\{display:none!important\}/);
});

test('current stock and movement history table cell text is centered',()=>{
  const style=readFileSync('inventory.css','utf8');
  assert.match(style,/#current-stock-table th,#current-stock-table td,#movement-list-table th,#movement-list-table td\{text-align:center\}/);
});
