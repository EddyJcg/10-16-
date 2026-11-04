const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('팝업 표 그리드 스크립트와 CSS가 연결되고 앱보다 먼저 로드된다', () => {
  const html = read('inventory.html');
  assert.match(html, /popup-table-grid\.css/);
  const grid = html.indexOf('popup-table-grid.js');
  const app = html.indexOf('inventory-app.js');
  assert.ok(grid > 0 && grid < app);
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
