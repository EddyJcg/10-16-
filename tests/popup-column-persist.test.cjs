const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('popup-table-grid.js','utf8');

test('열 너비를 localStorage에 저장하고 불러온다',()=>{
  assert.match(js,/localStorage\.setItem\(STORAGE_KEY/);
  assert.match(js,/localStorage\.getItem\(STORAGE_KEY/);
  assert.match(js,/persistWidths\(\);\s*resizing=null/);
});
