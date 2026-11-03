const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('inventory-app.js','utf8');
const html=fs.readFileSync('inventory.html','utf8');

test('발주 저장 후 표를 유지하고 발주 추가작성으로 새 발주번호를 만든다',()=>{
  assert.match(html,/id=\"new-purchase-order\"[^>]*>발주 추가작성<\/button><button type=\"button\" id=\"add-purchase-line\"[^>]*>품목 추가/);
  const save=app.slice(app.indexOf('async function savePurchaseOrder'),app.indexOf('function openPurchaseReceipt'));
  assert.match(save,/purchaseOrderSaved=true/);
  assert.doesNotMatch(save,/purchaseDraftLines=\[\]/);
  assert.match(app,/function startNewPurchaseOrder\(\)\{[^}]*resetPurchaseOrderForm\(\)/);
  assert.match(app,/function resetPurchaseOrderForm\(\)\{\s*purchaseOrderSaved=false;[\s\S]*?purchaseDraftLines=\[\];renderPurchaseDraftLines\(\)/);
});
