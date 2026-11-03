const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildPurchaseOrderPrint,formatDate}=require('../purchase-order-print.js');
const html=fs.readFileSync('inventory.html','utf8');
const app=fs.readFileSync('inventory-app.js','utf8');

test('발주서 양식에 이미지의 모든 항목 제목이 들어간다', () => {
  const out=buildPurchaseOrderPrint({orderNumber:'ISPO20261103-0001',orderDate:'2026-11-03',lines:[]});
  ['구 매 발 주 서','상　　　호','P/O DATE : 2026년 11월 3일','거 래 처 명','발 주 부 서','발 주 담 당','E-mail 주소','발주번호','발주금액','통화','PJT NO','품목명','Maker','URL','도면Version','단위','본도','수량','단가','품목번호','규격','Unit구분','납품장소','구매요청자','대칭','입고요청일','금액','ISPO20261103-0001']
    .forEach(text=>assert.ok(out.includes(text),text));
  assert.equal((out.match(/class="po-item"/g)||[]).length,8);
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
  assert.match(app,/\?'landscape':'portrait'/);
  assert.match(html,/name="purchase-print-orientation" value="portrait" checked>세로[\s\S]*?value="landscape">가로/);
  assert.ok(app.includes('size:A4 ${purchasePrintOrientation()}'));
});