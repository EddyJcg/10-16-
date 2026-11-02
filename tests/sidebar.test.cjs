const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function boot(saved={}){
  const values=new Map(Object.entries(saved)),elements=new Map(),classes=new Set();
  const make=id=>({id,style:{setProperty(key,value){this[key]=value;}},attributes:{},handlers:{},classList:{contains:key=>classes.has(key),toggle(key,force){const on=force??!classes.has(key);on?classes.add(key):classes.delete(key);return on;}},setAttribute(key,value){this.attributes[key]=String(value);},addEventListener(event,handler){this.handlers[event]=handler;},getBoundingClientRect(){return {left:0};},setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return true;}});
  for(const id of ['app-layout','sidebar','sidebar-resizer','sidebar-toggle'])elements.set(id,make(id));
  const folder=Object.assign(make('opening-folder'),{open:false});
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const context=vm.createContext({document:{getElementById:id=>elements.get(id),querySelectorAll:selector=>selector==='[data-sidebar-folder]'?[folder]:[]},window:{innerWidth:1280,localStorage:storage,addEventListener(){}},JSON,Number,Math});
  vm.runInContext(fs.readFileSync('inventory-sidebar.js','utf8'),context);
  vm.runInContext('startSidebar()',context);
  return {context,elements,folder,values};
}

test('sidebar width restores safely, clamps limits and supports keyboard resizing',()=>{
  const app=boot({'inventory-sidebar-width':'300'}),resizer=app.elements.get('sidebar-resizer');
  assert.equal(resizer.attributes['aria-valuenow'],'300');
  resizer.handlers.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(app.values.get('inventory-sidebar-width'),'320');
  resizer.handlers.keydown({key:'End',preventDefault(){}});
  assert.equal(resizer.attributes['aria-valuenow'],'546');
  resizer.handlers.keydown({key:'Home',preventDefault(){}});
  assert.equal(resizer.attributes['aria-valuenow'],'200');
  assert.equal(boot({'inventory-sidebar-width':'invalid'}).elements.get('sidebar-resizer').attributes['aria-valuenow'],'250');
});
test('sidebar width supports the extended maximum, persists pointer resizing and respects viewport limits',()=>{
  const app=boot(),resizer=app.elements.get('sidebar-resizer');
  assert.equal(resizer.attributes['aria-valuemax'],'546');
  resizer.handlers.pointerdown({button:0,pointerId:1,preventDefault(){}});
  resizer.handlers.pointermove({pointerId:1,clientX:600});
  resizer.handlers.pointerup({pointerId:1});
  assert.equal(app.values.get('inventory-sidebar-width'),'546');
  assert.equal(boot(Object.fromEntries(app.values)).elements.get('sidebar-resizer').attributes['aria-valuenow'],'546');
  app.context.window.innerWidth=800;
  resizer.handlers.keydown({key:'End',preventDefault(){}});
  assert.equal(resizer.attributes['aria-valuemax'],'440');
  assert.equal(resizer.attributes['aria-valuenow'],'440');
});

test('existing menu folders stay under the new inventory parent folder',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),nav=html.match(/<nav aria-label="재고관리 메뉴">([\s\S]*?)<\/nav>/)[1];
  assert.ok(nav.indexOf('id="basic-info-folder"')<nav.indexOf('id="sales-folder"'),'기본정보 should appear before 매출관리');
  assert.match(nav,/<details id="product-info-folder"[^>]*data-sidebar-folder><summary>품목정보 입력<\/summary><div class="folder-children"><button[^>]*id="product-info-button"[^>]*>품목정보 등록<\/button><button[^>]*id="product-info-status-button"[^>]*>품목정보 현황<\/button><\/div><\/details>/);
  const basicStart=nav.indexOf('<details id="basic-info-folder"'),salesPosition=nav.indexOf('id="sales-folder"');
  assert.ok(basicStart>=0&&salesPosition>basicStart);
  const basicMenu=nav.slice(basicStart,salesPosition);
  assert.match(basicMenu,/<details id="vendor-info-entry-folder"[^>]*><summary>거래처정보 입력<\/summary><div class="folder-children"><details id="vendor-registration-folder"[^>]*><summary>거래처 등록<\/summary><div class="folder-children"><details id="vendor-status-folder"[^>]*><summary>거래처 현황<\/summary><\/details><\/div><\/details><\/div><\/details>/);
  assert.ok(nav.indexOf('id="basic-info-folder"')<nav.indexOf('id="vendor-info-entry-folder"')&&nav.indexOf('id="vendor-status-folder"')<nav.indexOf('id="sales-folder"'),'vendor folders should be inside 기본정보');
  assert.ok(nav.indexOf('id="vendor-info-entry-folder"')<nav.indexOf('id="vendor-registration-folder"')&&nav.indexOf('id="vendor-registration-folder"')<nav.indexOf('id="vendor-status-folder"'),'vendor folders should follow the requested hierarchy');
  assert.ok(nav.indexOf('id="sales-folder"')<nav.indexOf('id="inventory-folder"'),'매출관리 should appear above 재고관리');
  assert.match(nav,/<details id="sales-folder"[^>]*data-sidebar-folder><summary>매출관리<\/summary><div class="folder-children"><button[^>]*id="sales-order-button"[^>]*>수주 입력<\/button><button[^>]*id="sales-status-button"[^>]*>수주 현황<\/button><\/div><\/details>/);
  const purchasePosition=nav.indexOf('id="purchase-folder"'),inventoryPosition=nav.indexOf('id="inventory-folder"');
  assert.ok(nav.indexOf('id="sales-folder"')<purchasePosition&&purchasePosition<inventoryPosition,'발주관리 should appear between 매출관리 and 재고관리');
  assert.match(nav,/<details id="purchase-folder"[^>]*data-sidebar-folder><summary>발주관리<\/summary><div class="folder-children">[\s\S]*?<details id="purchase-entry-folder"[^>]*><summary>구매발주 품목입력<\/summary><div class="folder-children"><button[^>]*id="purchase-entry-button"[^>]*>품목 입력<\/button><\/div><\/details>[\s\S]*?<details id="purchase-query-folder"[^>]*><summary>구매발주 품목조회<\/summary><div class="folder-children"><button[^>]*id="purchase-query-button"[^>]*>품목 조회<\/button><\/div><\/details>[\s\S]*?<\/div><\/details>/);
  assert.ok(nav.indexOf('id="purchase-entry-folder"')>purchasePosition&&nav.indexOf('id="purchase-query-folder"')>purchasePosition,'purchase folders should be nested under 발주관리');
  const parentStart=nav.indexOf('<details id="inventory-folder"');
  const parentEnd=nav.indexOf('\n      </div></details>',parentStart);
  assert.ok(parentStart>=0);
  assert.ok(parentEnd>parentStart);
  assert.match(nav.slice(parentStart,parentEnd),/<summary>재고관리<\/summary>/);
  for(const folder of ['opening-folder','receipt-folder','issue-folder','stock-folder'])
    assert.ok(nav.indexOf(`id="${folder}"`)>parentStart,`${folder} should be nested under 재고관리`);
  assert.ok(nav.indexOf('id="purchase-folder"')<parentStart,'발주관리 should be outside 재고관리');
  const adminPosition=nav.indexOf('id="admin-folder"');
  assert.ok(adminPosition>parentEnd,'관리자 should be outside 재고관리');
  assert.ok(adminPosition>nav.indexOf('id="inventory-folder"'),'관리자 should appear after 재고관리');
  const adminFolderStart=nav.lastIndexOf('<details',adminPosition);
  assert.equal(nav.slice(adminFolderStart).match(/<details\b/g).length,1,'관리자 should be the last menu folder');
  assert.match(nav,/id="inventory-folder"[^>]*data-sidebar-folder open/);
});
test('vendor folders reuse the asset classification icon at the same size',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const style=fs.readFileSync('vendor-folder-icon.css','utf8');
  assert.match(html,/href="\/vendor-folder-icon\.css\?v=20261102-vendor-folders"/);
  assert.match(style,/#vendor-info-entry-folder>summary::before,#vendor-registration-folder>summary::before,#vendor-status-folder>summary::before\{content:'';display:inline-block;flex:0 0 28\.6px;width:28\.6px;height:28\.6px;background:currentColor;-webkit-mask:url\('\/product-bag\.svg'\) center\/contain no-repeat;mask:url\('\/product-bag\.svg'\) center\/contain no-repeat\}/);
});
test('sidebar text sizes are increased by approximately twenty percent',()=>{
  const style=fs.readFileSync('inventory.css','utf8');
  assert.match(style,/\.sidebar-heading\{[^}]*font-size:23\.4px/);
  assert.match(style,/\.sidebar-heading span\{[^}]*font-size:13px/);
  assert.match(style,/\.menu-folder summary\{[^}]*font-size:17px/);
  assert.match(style,/\.sidebar-action\{[^}]*font-size:16px/);
  assert.match(style,/\.sidebar-hint\{[^}]*font-size:13px/);
});
test('procurement folder uses the supplied settings icon without a background',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const style=fs.readFileSync('purchase-folder-icon.css','utf8');
  const icon=fs.readFileSync('purchase-settings.svg','utf8');
  assert.match(html,/href="\/purchase-folder-icon\.css\?v=20261102-hide-purchase-subfolder-icons"/);
  assert.match(style,/#purchase-folder>summary::before\{[^}]*width:29\.9px;height:29\.9px[^}]*mask:url\('\/purchase-settings\.svg'\)/);
  assert.match(style,/#purchase-entry-folder>summary::before,#purchase-query-folder>summary::before\{content:none;display:none\}/);
  assert.doesNotMatch(icon,/<rect\b|<image\b/i);
  assert.match(icon,/<svg\b[^>]*viewBox="0 0 24 24"/);
});
test('pointer resize persists width and folders remember their open state',()=>{
  const app=boot(),resizer=app.elements.get('sidebar-resizer');
  resizer.handlers.pointerdown({button:0,pointerId:1,preventDefault(){}});
  resizer.handlers.pointermove({pointerId:1,clientX:350});
  resizer.handlers.pointerup({pointerId:1});
  assert.equal(app.values.get('inventory-sidebar-width'),'350');
  app.folder.open=true;app.folder.handlers.toggle();
  assert.equal(boot(Object.fromEntries(app.values)).folder.open,true);
});
test('sidebar still works when browser preference storage is unavailable',()=>{
  const app=boot();app.context.window.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.doesNotThrow(()=>vm.runInContext('startSidebar()',app.context));
});
