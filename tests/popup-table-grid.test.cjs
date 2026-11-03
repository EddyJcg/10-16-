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

test('일련번호 열과 5개 빈 행 규칙이 있다', () => {
  const js = read('popup-table-grid.js');
  assert.match(js, /data-grid-serial/);
  assert.match(js, /일련번호#0/);
  assert.match(js, /data-grid-blank/);
  assert.match(js, /5/);
  const css = read('popup-table-grid.css');
  assert.match(css, /dialog table thead th/);
});
