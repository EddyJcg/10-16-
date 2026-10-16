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

test('signed-out state clears shared inventory and disables controls',async () => {
  const {run,elements} = context();
  run('items = [{name:"private"}]; currentUser = {id:"user"}');
  await run('updateSession(null)');
  assert.equal(run('items.length'),0);
  assert.equal(elements.get('inventory-panel').disabled,true);
});

test('stock adjustment uses the atomic database RPC',async () => {
  const {ctx,run} = context(); const calls = [];
  ctx.record = (...args) => calls.push(args);
  run('currentUser = {id:"user"}; client = {rpc:async (...args) => {record(...args); return {error:null}}}; loadItems = async () => {}');
  await run('changeQuantity("item-1",-1)');
  assert.equal(calls[0][0],'adjust_inventory_quantity');
  assert.equal(calls[0][1].item_id,'item-1');
  assert.equal(calls[0][1].delta,-1);
  assert.equal(run('busy'),false);
});

test('failed mutation retains the editing form and reports an error',async () => {
  const {run,elements} = context();
  run('currentUser = {id:"user"}; editing = "item-1"');
  await run('operation(async () => ({error:{code:"23514"}}),"saved")');
  assert.equal(run('editing'),'item-1');
  assert.match(elements.get('message').textContent,/수량 범위/);
  assert.equal(elements.get('inventory-panel').disabled,false);
});

test('inventory loads beyond one API page',async () => {
  const {ctx,run} = context(); const offsets = [];
  ctx.page = offset => { offsets.push(offset); return {error:null,data:Array.from({length:offset === 0 ? 500 : 3},(_,i) => ({id:String(offset+i)}))}; };
  run('currentUser = {id:"user"}; client = {from(){return {select(){return this},order(){return this},range:async offset => page(offset)}}}');
  await run('loadItems()');
  assert.equal(run('items.length'),503);
  assert.deepEqual(offsets,[0,500]);
});
