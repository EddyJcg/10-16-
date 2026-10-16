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
