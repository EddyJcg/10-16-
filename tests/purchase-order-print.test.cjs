const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildPurchaseOrderPrint,formatDate}=require('../purchase-order-print.js');
const html=fs.readFileSync('inventory.html','utf8');
const app=fs.readFileSync('inventory-app.js','utf8');

test('발주서 양식에 이미지의 모든 항목 제목이 들어간다', () => {
  const out=buildPurchaseOrderPrint({orderNumber:'ISPO20261103-0001',orderDate:'2026-11-03',lines:[]});
  ['구 매 발 주 서','상　　　호','P/O DATE : 2026년 11월 3일','거 래 처 명','발 주 부 서','발 주 담 당','E-mail 주소','발주번호','발주금액','통화','NO','품번','품명','규격','단위','수량','발주단가','발주금액','입고예정일','비고','ISPO20261103-0001']
    .forEach(text=>assert.ok(out.includes(text),text));
  const lines=out.slice(out.indexOf('class="po-lines"'));
  assert.equal((lines.slice(0,lines.indexOf('</table>')).match(/<tr>/g)||[]).length,11);
  assert.ok(!out.includes('PJT NO')&&!out.includes('Maker'));
});

test('발주 품목과 금액 합계를 채우고 HTML을 이스케이프한다', () => {
  const out=buildPurchaseOrderPrint({orderDate:'2026-11-03',supplier:{name:'<A&B>'},lines:[
    {product_code:'P1',product_name:'볼트',specification:'M8',unit:'EA',quantity:10,unit_cost:1500,expected_date:'2026-11-20'},
    {product_code:'P2',product_name:'너트',specification:'M6',unit:'EA',quantity:5,unit_cost:200,expected_date:null}]});
  assert.ok(out.includes('&lt;A&amp;B&gt;'));
  assert.ok(out.includes('16,000'));
  assert.ok(out.includes('15,000')&&out.includes('1,000'));
  assert.equal(formatDate('bad'),'');
});

test('구매발주 입력 창에 인쇄 설정·인쇄 버튼과 인쇄 영역이 연결된다', () => {
  assert.match(html,/data-print-settings="purchase-order"[^>]*>인쇄 설정<\/button><button[^>]*data-print="purchase-order"[^>]*>인쇄<\/button><button[^>]*id="close-purchase-order"/);
  assert.match(html,/id="purchase-order-print"/);
  assert.match(app,/'purchase-order':'purchase-order-dialog'/);
  assert.match(app,/\?'portrait':'landscape'/);
  assert.match(html,/name="purchase-print-orientation" value="portrait">세로[\s\S]*?value="landscape" checked>가로/);
  assert.ok(app.includes('size:A4 ${purchasePrintOrientation()}'));
});

test('인쇄 및 저장 관련 버튼은 첨부한 파란색을 사용한다',()=>{
  const inventoryCss=fs.readFileSync('inventory.css','utf8');
  const adminCss=fs.readFileSync('admin.css','utf8');
  const menu=fs.readFileSync('popup-table-menu.js','utf8');
  assert.match(inventoryCss,/button\[data-print\],button\[data-print-settings\][\s\S]*?button\[id\^="save-"\],button\[data-vendor-action="save"\][\s\S]*?#complete-sales-register-confirm,#password-update-button,[\s\S]*?background:#348fe2!important;border-color:#348fe2!important;color:#fff!important/);
  assert.match(adminCss,/#save-user\{background:#348fe2;border-color:#348fe2;color:#fff\}/);
  assert.match(menu,/save\.className='secondary popup-table-save-button'/);
});

test('품목이 많으면 다음 페이지로 넘어가고 페이지 번호가 표시된다', () => {
  const make=(count,orientation)=>buildPurchaseOrderPrint({orientation,lines:Array.from({length:count},(_, i)=>({product_code:'P'+i,product_name:'품목'+i,quantity:1,unit_cost:100}))});
  const sheets=out=>(out.match(/class="po-sheet /g)||[]).length;
  assert.equal(sheets(make(3,'landscape')),1);
  assert.ok(!make(3,'landscape').includes('po-pageno'));
  assert.equal(sheets(make(10,'landscape')),1);
  const two=make(11,'landscape');
  assert.equal(sheets(two),2);
  assert.ok(two.includes('<div class="po-pageno">1/2</div>')&&two.includes('<div class="po-pageno">2/2</div>'));
  assert.ok(two.includes('<td class="po-center">11</td>'));
  assert.equal(sheets(make(22,'portrait')),1);
  assert.equal(sheets(make(23,'portrait')),2);
  assert.equal(sheets(make(35)),4);
});
