const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('edit and delete buttons warn when a later process already uses the record',()=>{
  const app=readFileSync('inventory-app.js','utf8'),vendor=readFileSync('vendor-management.js','utf8');
  assert.match(app,/function alertBlocked\(detail\)\{\s*window\.alert\(/);
  assert.match(app,/async function editMovement\(id\)\{[\s\S]*?movementUsedDownstream\(movement\)[\s\S]*?alertBlocked\(reason\)/);
  assert.match(app,/async function revertReceipt\(id\)\{[\s\S]*?movementUsedDownstream\(movement\)[\s\S]*?alertBlocked\(reason\)/);
  assert.match(app,/function editSalesOrder\(id\)\{[\s\S]*?salesOrderDownstreamReason\(id\)[\s\S]*?alertBlocked\(blockedReason\)/);
  assert.match(app,/async function editSalesOrderFromStatus\(id\)\{\s*const blockedReason=salesOrderDownstreamReason\(id\);\s*if\(blockedReason\)\{alertBlocked\(blockedReason\);return;\}\s*\$\('sales-status-dialog'\)\.close\(\)/);
  assert.match(app,/productInfoUsedInMovements\(id\)/);
  assert.match(vendor,/async function deleteVendor\(\)\{[\s\S]*?vendorUsedDownstream\(target\)[\s\S]*?vendorBlockedAlert\(reason\)/);
  assert.match(vendor,/vendorBlockedAlert\('등록된 거래처에서 사용 중인 종류입니다\.'\)/);
});

test('sales order with shipments or completed sales is blocked from editing',()=>{
  const vm=require('node:vm');
  const app=readFileSync('inventory-app.js','utf8');
  const start=app.indexOf('function salesOrderDownstreamReason'),end=app.indexOf('async function editProductInfo');
  const context=vm.createContext({salesOrderStatus:order=>order.done?'완료':'진행',salesOrders:[
    {id:'a',shipped_quantity:0},{id:'b',shipped_quantity:2},{id:'c',shipped_quantity:0,done:true},
    {id:'g1',order_group_id:'g',shipped_quantity:0},{id:'g2',order_group_id:'g',shipped_quantity:1}
  ]});
  vm.runInContext(app.slice(start,end),context);
  assert.equal(context.salesOrderDownstreamReason('a'),'');
  assert.match(context.salesOrderDownstreamReason('b'),/출고/);
  assert.match(context.salesOrderDownstreamReason('c'),/매출 등록/);
  assert.match(context.salesOrderDownstreamReason('g1'),/출고/,'one shipped line blocks the whole order group');
});

test('receipt edit window has a bulk delete button left of the save button',()=>{
  const app=readFileSync('inventory-app.js','utf8');
  assert.match(app,/bulkDelete\.id='bulk-delete-movement'[\s\S]*?bulkDelete\.textContent='일괄삭제'[\s\S]*?revertReceipt\(editingMovementId\)[\s\S]*?footer\.insertBefore\(bulkDelete,save\)/);
  assert.match(app,/\$\('bulk-delete-movement'\)\.hidden=movement\.kind!=='receipt'/);
  assert.match(app,/\$\('bulk-delete-movement'\)\.hidden=true;const \[title,prefix,dateLabel\]/);
});
