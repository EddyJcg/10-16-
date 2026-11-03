const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('main popups are non-modal so sidebar menus stay clickable',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  assert.ok(html.indexOf('popup-floating.js')<html.indexOf('inventory-app.js'));
  assert.match(html,/href="\/popup-floating\.css\?v=/);
  const js=fs.readFileSync('popup-floating.js','utf8');
  assert.match(js,/this\.show\(\)/);
  assert.match(js,/sales-register-confirm-dialog/);
  assert.doesNotMatch(js,/\.sidebar-action|\.close\(\)/);
});

test('showModal override opens main popups without modal and keeps them open on sidebar click',()=>{
  const calls=[];
  const closed=[];
  const dialog={id:'sales-order-dialog',open:false,style:{},classList:{add:c=>calls.push('class:'+c),contains:()=>false},show(){calls.push('show');this.open=true;},close(){closed.push(this.id);}};
  const confirmDialog={id:'sales-register-confirm-dialog',open:false,classList:{contains:()=>false}};
  const proto={showModal(){calls.push('native');}};
  let clickHandler;
  const context={HTMLDialogElement:function(){},document:{addEventListener:(type,fn)=>{if(type==='click')clickHandler=fn;},querySelectorAll:()=>[dialog]}};
  context.HTMLDialogElement.prototype=proto;
  new Function('HTMLDialogElement','document',fs.readFileSync('popup-floating.js','utf8'))(context.HTMLDialogElement,context.document);
  proto.showModal.call(dialog);
  proto.showModal.call(confirmDialog);
  assert.deepEqual(calls,['class:popup-floating','show','native']);
  assert.equal(clickHandler,undefined);
  assert.deepEqual(closed,[]);
});
test('already open popup flashes instead of reopening',()=>{
  const js=fs.readFileSync('popup-floating.js','utf8');
  assert.match(js,/this\.open\)\{[^}]*popup-flash/);
  assert.match(fs.readFileSync('popup-floating.css','utf8'),/dialog\.popup-flash\{animation:popup-flash/);
});

test('later popups cascade from top-left to bottom-right and stack above earlier ones',()=>{
  const open=[];
  const make=id=>({id,open:false,style:{},classList:{add(){},contains:()=>false},show(){this.open=true;open.push(this);}});
  const proto={showModal(){}};
  const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document',fs.readFileSync('popup-floating.js','utf8'))(Ctor,{addEventListener(){},querySelectorAll:()=>open});
  const a=make('a'),b=make('b');
  proto.showModal.call(a);proto.showModal.call(b);
  assert.ok(parseInt(b.style.left)>parseInt(a.style.left));
  assert.ok(parseInt(b.style.top)>parseInt(a.style.top));
  assert.ok(Number(b.style.zIndex)>Number(a.style.zIndex));
});

test('floating popups are clamped inside the viewport',()=>{
  const js=fs.readFileSync('popup-floating.js','utf8');
  const dialog={id:'x',open:false,style:{},classList:{add(){},contains:()=>false},show(){this.open=true;},getBoundingClientRect:()=>({left:900,top:700,width:400,height:300})};
  const proto={showModal(){}};const Ctor=function(){};Ctor.prototype=proto;
  new Function('HTMLDialogElement','document','innerWidth','innerHeight',js)(Ctor,{addEventListener(){},querySelectorAll:()=>[]},1000,800);
  proto.showModal.call(dialog);
  assert.equal(dialog.style.left,'600px');
  assert.equal(dialog.style.top,'500px');
});
