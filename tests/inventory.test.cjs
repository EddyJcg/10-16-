const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function context() {
  const elements = new Map();
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id,{textContent:'',value:'',disabled:false,classList:{toggle(){},add(){}},reset(){}});
    return elements.get(id);
  }};
  const ctx = vm.createContext({document,console,render(){}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),ctx);
  return {ctx,elements,run:code => vm.runInContext(code,ctx)};
}

test('stock adjustment works without login and uses the atomic database RPC',async () => {
  const {ctx,run} = context(); const calls = [];
  ctx.record = (...args) => calls.push(args);
  run('client = {rpc:async (...args) => {record(...args); return {error:null}}}; loadItems = async () => {}');
  await run('changeQuantity("item-1",-1)');
  assert.equal(calls[0][0],'adjust_inventory_quantity');
  assert.equal(calls[0][1].item_id,'item-1');
  assert.equal(calls[0][1].delta,-1);
  assert.equal(run('busy'),false);
});

test('failed mutation retains the editing form and reports an error',async () => {
  const {run,elements} = context();
  run('client = {}; editing = "item-1"');
  await run('operation(async () => ({error:{code:"23514"}}),"saved")');
  assert.equal(run('editing'),'item-1');
  assert.match(elements.get('message').textContent,/수량 범위/);
  assert.equal(elements.get('inventory-panel').disabled,false);
});

test('inventory loads beyond one API page',async () => {
  const {ctx,run} = context(); const offsets = [];
  ctx.page = offset => { offsets.push(offset); return {error:null,data:Array.from({length:offset === 0 ? 500 : 3},(_,i) => ({id:String(offset+i)}))}; };
  run('client = {from(){return {select(){return this},order(){return this},range:async offset => page(offset)}}}');
  await run('loadItems()');
  assert.equal(run('items.length'),503);
  assert.deepEqual(offsets,[0,500]);
});

test('stale item updates are rejected and the draft is preserved',async () => {
  const {ctx,run,elements} = context(); const filters = [];
  ctx.record = (...args) => filters.push(args);
  run('editing = "item-1"; editingVersion = 2; client = {from(){return {update(){return this},eq(...args){record(...args);return this},select:async () => ({error:null,data:[]})}}}; loadItems = async () => {}');
  await run('operation(() => saveItem({name:"draft"},editing,editingVersion),"saved",true)');
  assert.deepEqual(filters,[['id','item-1'],['version',2]]);
  assert.equal(run('editing'),'item-1');
  assert.match(elements.get('message').textContent,/다른 사용자가/);
});

test('automatic inventory reload retains the editing draft and original version',async () => {
  const {ctx,run} = context();
  ctx.page = () => ({error:null,data:[{id:'item-1',version:4}]});
  run('editing = "item-1"; editingVersion = 2; client = {from(){return {select(){return this},order(){return this},range:async () => page()}}}');
  await run('loadItems()');
  assert.equal(run('items[0].version'),4);
  assert.equal(run('editingVersion'),2);
  assert.equal(run('editing'),'item-1');
});

test('realtime listens to inserts, updates and deletes on the shared table',() => {
  const {ctx,run,elements} = context(); const calls = [];
  ctx.record = (...args) => calls.push(args);
  run('client = {channel(){return {on(event,filter,callback){record(event,filter,callback);return this},subscribe(callback){callback("CHANNEL_ERROR");return this}}}}');
  run('subscribeToChanges()');
  assert.equal(calls[0][0],'postgres_changes');
  assert.equal(calls[0][1].event,'*');
  assert.equal(calls[0][1].table,'inventory_items');
  assert.match(elements.get('sync-status').textContent,/5초/);
});
