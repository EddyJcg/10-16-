const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function setup(products){
  const rows=[];
  const context=vm.createContext({document:{querySelectorAll:()=>rows}});
  vm.runInContext(readFileSync('inventory-app.js','utf8'),context);
  context.products=products;
  vm.runInContext('items=products',context);
  const row=()=>{
    const classes=new Set(['existing-row']);
    const value={classes,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
    rows.push(value);return value;
  };
  return {context,row,run:code=>vm.runInContext(code,context)};
}

test('all stock thresholds use current total stock including equality and zero, without mutating data',()=>{
  const products=[
    {id:'zero',stock_quantity:0,standard_stock_quantity:10},
    {id:'below',stock_quantity:9,standard_stock_quantity:10},
    {id:'equal',stock_quantity:'10',standard_stock_quantity:'10'},
    {id:'above',stock_quantity:11,standard_stock_quantity:10},
    {id:'negative',stock_quantity:-1,standard_stock_quantity:10}
  ];
  const before=JSON.stringify(products),s=setup(products);
  for(const product of products){
    const row=s.row();s.context.row=row;s.context.product=product;s.run('bindStockRow(row,product)');
    assert.equal(row.classes.has('stock-row-low'),product.id!=='above',product.id);
    assert.equal(row.classes.has('stock-row-normal'),product.id==='above',product.id);
    assert.ok(row.classes.has('existing-row'));
  }
  assert.equal(JSON.stringify(products),before);
});

test('historical, purchase and aging rows use live product balances rather than row quantities',()=>{
  const product={id:'p1',product_code:'SKU',stock_quantity:20,standard_stock_quantity:10};
  const s=setup([product]);
  for(const reference of [
    {product_id:'p1',quantity:1,remaining_quantity:0},
    {product_code:'SKU',stock_quantity:0,standard_stock_quantity:999},
    {id:'p1',stock_quantity:0,standard_stock_quantity:999}
  ]){
    const row=s.row();s.context.row=row;s.context.reference=reference;s.run('bindStockRow(row,reference)');
    assert.ok(row.classes.has('stock-row-normal'));
    assert.ok(!row.classes.has('stock-row-low'));
  }
});

test('sales rows match the exact name/specification/unit and never guess ambiguous or missing products',()=>{
  const s=setup([
    {id:'a',product_name:'품목',specification:'규격',unit:'Kg',stock_quantity:1,standard_stock_quantity:2},
    {id:'b',product_name:'품목',specification:'규격',unit:'EA',stock_quantity:3,standard_stock_quantity:2},
    {id:'c',product_name:'중복',specification:'규격',unit:'EA',stock_quantity:1,standard_stock_quantity:2},
    {id:'d',product_name:'중복',specification:'규격',unit:'EA',stock_quantity:3,standard_stock_quantity:2}
  ]);
  for(const [reference,expected] of [
    [{product_name:' 품목 ',specification:'규격',unit:'Kg'},'stock-row-low'],
    [{product_name:'품목',specification:'규격',unit:'EA'},'stock-row-normal'],
    [{product_name:'중복',specification:'규격',unit:'EA'},null],
    [{product_name:'없음',specification:'규격',unit:'EA'},null],
    [null,null]
  ]){
    const row=s.row();s.context.row=row;s.context.reference=reference;s.run('bindStockRow(row,reference)');
    assert.deepEqual([...row.classes],expected?['existing-row',expected]:['existing-row']);
  }
});

test('refresh recolors already-open rows both ways and removes colors when a product is no longer managed',()=>{
  const s=setup([{id:'p1',stock_quantity:10,standard_stock_quantity:10}]);
  const row=s.row();s.context.row=row;s.run("bindStockRow(row,{product_id:'p1'})");
  assert.ok(row.classes.has('stock-row-low'));
  s.run("items=[{id:'p1',stock_quantity:11,standard_stock_quantity:10}];refreshStockRowColors()");
  assert.ok(row.classes.has('stock-row-normal'));assert.ok(!row.classes.has('stock-row-low'));
  s.run('items[0].stock_quantity=0;refreshStockRowColors()');
  assert.ok(row.classes.has('stock-row-low'));assert.ok(!row.classes.has('stock-row-normal'));
  s.run('items[0].quantity_management_disabled=true;refreshStockRowColors()');
  assert.deepEqual([...row.classes],['existing-row']);
  s.run('items=[];refreshStockRowColors()');
  assert.deepEqual([...row.classes],['existing-row']);
});

test('invalid or non-managed stock is not misrepresented and all descendants share the row color',()=>{
  const products=[
    {id:'a',stock_quantity:1,standard_stock_quantity:null},
    {id:'legacy',stock_quantity:0,standard_stock_quantity:0},
    {id:'b',stock_quantity:null,standard_stock_quantity:10},
    {id:'c',stock_quantity:'bad',standard_stock_quantity:10},
    {id:'d',stock_quantity:1,standard_stock_quantity:-1},
    {id:'e',stock_quantity:1,standard_stock_quantity:10,value_management_disabled:true}
  ];
  const s=setup(products);
  for(const product of products){
    const row=s.row();s.context.row=row;s.context.product=product;s.run('bindStockRow(row,product)');
    assert.deepEqual([...row.classes],['existing-row']);
  }
  const css=readFileSync('inventory.css','utf8');
  assert.match(css,/tr\.stock-row-low\{--stock-row-color:#f00\}/);
  assert.match(css,/tr\.stock-row-normal\{--stock-row-color:#000\}/);
  assert.match(css,/tr:is\(\.stock-row-low,\.stock-row-normal\) \*\{color:var\(--stock-row-color\)!important\}/);
});

test('purchase order print rows use the same live colors and leave padded rows uncolored',()=>{
  const s=setup([
    {product_code:'LOW',stock_quantity:10,standard_stock_quantity:10},
    {product_code:'HIGH',stock_quantity:11,standard_stock_quantity:10}
  ]);
  const rows=[s.row(),s.row(),s.row()];
  const print={querySelectorAll:()=>rows};
  s.context.document.getElementById=id=>id==='purchase-order-print'?print:{open:true,close(){}};
  s.context.document.body={dataset:{}};
  s.context.window={print(){},addEventListener(){}};
  s.context.PurchaseOrderPrint={buildPurchaseOrderPrint:()=>'<table></table>'};
  s.run(`purchaseOrderPrintData=()=>({lines:[{product_code:'LOW'},{product_code:'HIGH'}]});
    purchasePrintOrientation=()=>'landscape';applyProductListPrintSettings=()=>{};
    printInventoryList('purchase-order')`);
  assert.ok(rows[0].classes.has('stock-row-low'));
  assert.ok(rows[1].classes.has('stock-row-normal'));
  assert.deepEqual([...rows[2].classes],['existing-row']);
});

test('dashboard count, risk detail rows and red rows all include the same two low-stock products',()=>{
  const products=[
    {id:'low',product_code:'LOW',stock_quantity:10,standard_stock_quantity:100,shortage_control_enabled:true},
    {id:'equal',product_code:'EQUAL',stock_quantity:100,standard_stock_quantity:100,shortage_control_enabled:false},
    {id:'normal',product_code:'NORMAL',stock_quantity:101,standard_stock_quantity:100},
    {id:'unmanaged',product_code:'UNMANAGED',stock_quantity:0,standard_stock_quantity:100,quantity_management_disabled:true},
    {id:'unset',product_code:'UNSET',stock_quantity:0,standard_stock_quantity:0}
  ];
  const s=setup(products),fields=new Map();
  const element=()=>({children:[],textContent:'',classList:{toggle(){}},
    append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}});
  s.context.document.getElementById=id=>{
    if(!fields.has(id))fields.set(id,element());
    return fields.get(id);
  };
  s.context.document.createElement=element;
  s.run(readFileSync('inventory-model.js','utf8'));
  s.run(readFileSync('inventory-render.js','utf8'));
  s.run('renderStockRisk()');
  assert.equal(fields.get('total-risk-items').textContent,'2');
  assert.equal(fields.get('stock-risk-count').textContent,'2개');
  assert.deepEqual(fields.get('stock-risk-items').children.map(row=>row.children[1].textContent),['LOW','EQUAL']);
  const colored=products.map(product=>{
    const row=s.row();s.context.row=row;s.context.product=product;s.run('bindStockRow(row,product)');
    return row.classes.has('stock-row-low');
  });
  assert.deepEqual(colored,[true,true,false,false,false]);
  s.run('items[1].stock_quantity=101;renderStockRisk()');
  assert.equal(fields.get('total-risk-items').textContent,'1');
  assert.equal(fields.get('stock-risk-items').children.length,1);
});

test('risk counts include equality, zero and 20–100 percent, but exclude invalid and unset stock',()=>{
  const {stockRiskItems}=require('../inventory-model.js');
  const values=[0,19,20,50,100,101];
  assert.deepEqual(stockRiskItems(values.map(stock=>({stock_quantity:stock,standard_stock_quantity:100})))
    .map(item=>item.stock_quantity),[0,19,20,50,100]);
  for(const item of [
    {stock_quantity:null,standard_stock_quantity:100},
    {stock_quantity:'bad',standard_stock_quantity:100},
    {stock_quantity:0,standard_stock_quantity:null},
    {stock_quantity:0,standard_stock_quantity:0},
    {stock_quantity:0,standard_stock_quantity:-1}
  ])assert.equal(stockRiskItems([item]).length,0);
  const html=readFileSync('inventory.html','utf8');
  assert.doesNotMatch(html,/적정재고의 20% 미만/);
  assert.match(html,/현재 재고가 적정재고 이하/);
});
