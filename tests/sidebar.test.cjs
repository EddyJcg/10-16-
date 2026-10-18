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
  assert.equal(resizer.attributes['aria-valuenow'],'420');
  resizer.handlers.keydown({key:'Home',preventDefault(){}});
  assert.equal(resizer.attributes['aria-valuenow'],'200');
  assert.equal(boot({'inventory-sidebar-width':'invalid'}).elements.get('sidebar-resizer').attributes['aria-valuenow'],'250');
});
test('existing menu folders stay under the new inventory parent folder',()=>{
  const html=fs.readFileSync('inventory.html','utf8'),nav=html.match(/<nav aria-label="재고관리 메뉴">([\s\S]*?)<\/nav>/)[1];
  assert.ok(nav.indexOf('id="basic-info-folder"')<nav.indexOf('id="sales-folder"'),'기본정보 should appear before 매출관리');
  assert.match(nav,/<details id="basic-info-folder"[^>]*data-sidebar-folder><summary>기본정보<\/summary><div class="folder-children"><button[^>]*id="product-info-button"[^>]*>품목정보<\/button><\/div><\/details>/);
  assert.ok(nav.indexOf('id="sales-folder"')<nav.indexOf('id="inventory-folder"'),'매출관리 should appear above 재고관리');
  assert.match(nav,/<details id="sales-folder"[^>]*data-sidebar-folder><summary>매출관리<\/summary><div class="folder-children"><button[^>]*id="sales-order-button"[^>]*>수주 입력<\/button><button[^>]*id="sales-status-button"[^>]*>수주현황<\/button><\/div><\/details>/);
  const parentStart=nav.indexOf('<details id="inventory-folder"');
  const parentEnd=nav.indexOf('\n      </div></details>',parentStart);
  assert.ok(parentStart>=0);
  assert.ok(parentEnd>parentStart);
  assert.match(nav.slice(parentStart,parentEnd),/<summary>재고관리<\/summary>/);
  for(const folder of ['opening-folder','receipt-folder','issue-folder','stock-folder'])
    assert.ok(nav.indexOf(`id="${folder}"`)>parentStart,`${folder} should be nested under 재고관리`);
  const adminPosition=nav.indexOf('id="admin-folder"');
  assert.ok(adminPosition>parentEnd,'관리자 should be outside 재고관리');
  assert.ok(adminPosition>nav.indexOf('id="inventory-folder"'),'관리자 should appear after 재고관리');
  const adminFolderStart=nav.lastIndexOf('<details',adminPosition);
  assert.equal(nav.slice(adminFolderStart).match(/<details\b/g).length,1,'관리자 should be the last menu folder');
  assert.match(nav,/id="inventory-folder"[^>]*data-sidebar-folder open/);
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
