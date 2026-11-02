const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('all popup input grids use five columns on desktop and responsive columns on small screens',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const css=fs.readFileSync('popup-input-grid.css','utf8');
  const head=html.match(/<head>([\s\S]*?)<\/head>/)?.[1]||'';
  const stylesheetLinks=[...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
  const popupInputGridIndex=stylesheetLinks.indexOf('/popup-input-grid.css?v=20261102-all-popups-five-column-inputs');
  const productInfoStyleIndex=stylesheetLinks.indexOf('/product-info-dialog.css?v=20261102-product-info-text-scale-108');
  assert.ok(popupInputGridIndex>=0,'the shared popup grid stylesheet should be loaded');
  assert.ok(productInfoStyleIndex>popupInputGridIndex,'product information overrides should load after shared popup styles');

  for(const grid of [
    'form-grid','transaction-grid','product-list-search','sales-status-filters',
    'vendor-top-fields','vendor-fields','vendor-option-form','vendor-query-grid',
    'purchase-product-details','print-margin-inputs'
  ]){
    assert.match(css,new RegExp(`dialog \\.${grid}[\\s\\S]*?grid-template-columns:repeat\\(5,minmax\\(0,1fr\\)\\)`),grid);
  }
  assert.match(css,/@media\(min-width:601px\) and \(max-width:850px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:600px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/dialog \.purchase-order-line-form>button\{grid-column:auto\}/);
  assert.match(css,/dialog \.sales-order-wide,[\s\S]*?grid-column:1\/-1/);
});
