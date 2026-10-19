const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {searchCalendarDays,parseSearchCalendarDate,searchCalendarDateAllowed}=require('../inventory-datepicker.js');

test('search calendar lays out leap years and month boundaries using ISO dates',()=>{
  const days=searchCalendarDays(2024,1);
  assert.equal(days.length,42);
  assert.equal(days[0],null);
  assert.equal(days[4],'2024-02-01');
  assert.equal(days.filter(Boolean).length,29);
  assert.equal(searchCalendarDays(2025,1).filter(Boolean).length,28);
  assert.equal(searchCalendarDays(2026,11).filter(Boolean).at(-1),'2026-12-31');
});

test('search calendar rejects invalid dates and honors inclusive input bounds',()=>{
  assert.equal(parseSearchCalendarDate('2026-02-29'),null);
  assert.equal(parseSearchCalendarDate(''),null);
  assert.equal(parseSearchCalendarDate('2024-02-29').getDate(),29);
  assert.equal(searchCalendarDateAllowed('2026-10-19','2026-10-19','2026-10-20'),true);
  assert.equal(searchCalendarDateAllowed('2026-10-18','2026-10-19',''),false);
  assert.equal(searchCalendarDateAllowed('2026-10-21','','2026-10-20'),false);
});

test('enlarged calendar attaches only to search dates and keeps native date inputs',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const script=fs.readFileSync('inventory-datepicker.js','utf8');
  assert.match(html,/src="inventory-datepicker.js"/);
  assert.match(html,/startSearchDatePickers\(\)/);
  assert.match(script,/\.search-conditions input\[type="date"\]/);
  assert.match(script,/\.product-list-search input\[type="date"\]/);
  assert.match(script,/\.sales-status-filters input\[type="date"\]/);
  assert.doesNotMatch(script,/\.type\s*=\s*['"]text/);
  assert.match(fs.readFileSync('inventory-datepicker.css','utf8'),/--calendar-scale:1\.3/);
});
