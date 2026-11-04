const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('팝업 표 그리드 스크립트와 CSS가 연결되고 앱보다 먼저 로드된다', () => {
  const html = read('inventory.html');
  assert.match(html, /popup-table-grid\.css/);
  assert.match(html, /popup-table-menu\.css/);
  const grid = html.indexOf('popup-table-grid.js');
  const app = html.indexOf('inventory-app.js');
  assert.ok(grid > 0 && grid < app);
  assert.ok(html.indexOf('popup-table-menu.js')>app);
});

test('열 경계 드래그 크기 조절과 넘친 내용 숨김 규칙이 있다', () => {
  const js = read('popup-table-grid.js');
  assert.match(js, /grid-col-handle/);
  assert.match(js, /tableLayout='fixed'/);
  const css = read('popup-table-grid.css');
  assert.match(css, /cursor:col-resize/);
  assert.match(css, /grid-resized td\{overflow:hidden/);
});

test('표 제목줄과 행 높이가 2/3로 줄어든다', () => {
  const css = read('popup-table-grid.css');
  assert.match(css, /dialog table th,dialog table td\{padding-top:4\.5px!important;padding-bottom:4\.5px!important/);
  assert.match(css, /\.vendor-list-dialog th[^{]*\{padding-top:1px!important;padding-bottom:1px!important;height:29px!important/);
});

test('일련번호 열과 5개 빈 행 규칙이 있다', () => {
  const js = read('popup-table-grid.js');
  assert.match(js, /data-grid-serial/);
  assert.match(js, /일련번호#0/);
  assert.match(js, /data-grid-blank/);
  assert.match(js, /5/);
  const css = read('popup-table-grid.css');
  assert.match(css, /dialog table thead th/);
});

test('팝업 일련번호 제목은 투명 아이콘으로 표시하고 기존 행 번호는 유지한다', () => {
  const js = read('popup-table-grid.js');
  assert.match(js, /popup-serial-icon\.png/);
  assert.match(js, /gridOwnSerial/);
  assert.match(js, /head\.cells\[0\]\.dataset\.gridOwnSerial==='1'/);
  assert.match(js, /hasAttribute\('data-grid-serial'\)\?SERIAL_LABEL/);
  const css = read('popup-table-grid.css');
  assert.match(css, /data-grid-serial\] img\[data-popup-serial-icon\]/);
  assert.match(css, /width:19\.8px;height:19\.8px/);
  const icon = fs.readFileSync(path.join(__dirname, '..', 'popup-serial-icon.png'));
  assert.equal(icon.readUInt8(25), 6);
});

test('메인 화면의 일련번호 제목도 아이콘으로 바꾸고 팝업 표는 건너뛴다', () => {
  const makeHeader = (textContent) => ({
    textContent,
    dataset: {},
    children: [],
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(child) { this.children = [child]; }
  });
  const mainHeader = makeHeader('일련번호');
  const popupHeader = makeHeader('일련번호');
  const tables = [
    { tHead: { rows: [{ cells: [mainHeader] }] }, closest: () => null },
    { tHead: { rows: [{ cells: [popupHeader] }] }, closest: () => ({}) }
  ];
  const context = vm.createContext({
    document: {
      querySelectorAll: () => tables,
      createElement: () => ({ dataset: {} })
    }
  });
  vm.runInContext(read('inventory-render.js'), context);
  vm.runInContext('convertMainPageSerialHeaders()', context);
  assert.equal(mainHeader.children[0].src, '/popup-serial-icon.png');
  assert.equal(mainHeader.children[0].alt, '일련번호');
  assert.equal(mainHeader.dataset.gridOwnSerial, '1');
  assert.equal(popupHeader.children.length, 0);
});

test('팝업 아이콘 메뉴에서 내보내기·행 추가·시트 설정 기능을 연결한다', () => {
  const menu = read('popup-table-menu.js');
  for(const label of ['Excel로 내보내기','행 추가','시트 초기화','컬럼보기 설정','필터']){
    assert.ok(menu.includes(label));
  }
  assert.match(menu,/contextmenu/);
  assert.match(menu,/localStorage\.setItem\(visibilityKey\(table\)/);
  assert.match(menu,/FILTERED_CLASS/);
  assert.match(menu,/저장된 업무 데이터는 삭제하지 않았습니다/);
  const app = read('inventory-app.js');
  assert.match(app,/function addPopupTableDraftRow\(bodyId\)/);
  assert.match(app,/function resetPopupTableDraftRows\(bodyId\)/);
});
