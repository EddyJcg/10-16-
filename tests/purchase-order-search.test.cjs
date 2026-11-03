const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('inventory.html', 'utf8');
const app = fs.readFileSync('inventory-app.js', 'utf8');

test('구매발주 품목조회 창에 조회 조건이 발주 현황 표 위에 5열 검색 형태로 있다', () => {
  const view = html.slice(html.indexOf('id="purchase-order-view"'));
  const search = view.indexOf('product-list-search purchase-order-search');
  const table = view.indexOf('aria-label="발주현황"');
  assert.ok(search > 0 && search < table);
  for (const id of ['purchase-search-start-date', 'purchase-search-end-date', 'purchase-search-number',
    'purchase-search-supplier', 'purchase-search-code', 'purchase-search-name', 'purchase-search-specification',
    'search-purchase-orders', 'clear-purchase-order-search']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /발주 시작일[\s\S]*발주 마지막일/);
});

test('발주 조회 조건은 기간·발주번호·거래처·품번·품명·규격으로 필터링한다', () => {
  const context = vm.createContext({});
  vm.runInContext(app, context);
  const order = { order_date: '2026-11-03', order_number: 'PO-2', supplier: '다라물산', status: '부분입고' };
  const item = { product_code: 'B-2', product_name: '신발', specification: '소' };
  const match = (filter) => vm.runInContext(
    `purchaseLineMatches(Object.assign({start:'',end:'',number:'',supplier:'',code:'',name:'',specification:'',status:''},${JSON.stringify(filter)}),${JSON.stringify(order)},${JSON.stringify(item)})`, context);
  assert.equal(match({}), true);
  assert.equal(match({ start: '2026-11-04' }), false);
  assert.equal(match({ end: '2026-11-02' }), false);
  assert.equal(match({ start: '2026-11-03', end: '2026-11-03' }), true);
  assert.equal(match({ number: 'po-2' }), true);
  assert.equal(match({ supplier: '가나' }), false);
  assert.equal(match({ code: 'b-' }), true);
  assert.equal(match({ name: '가방' }), false);
  assert.equal(match({ specification: '소' }), true);
  assert.equal(match({ status: '부분입고' }), true);
  assert.equal(match({ status: '입고완료' }), false);
});
test('상태 선택 항목이 발주 상태 값과 같다', () => {
  const select = html.slice(html.indexOf('id="purchase-search-status"'));
  const options = [...select.slice(0, select.indexOf('</select>')).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(options, ['', '작성중', '발주완료', '부분입고', '입고완료', '취소']);
});
