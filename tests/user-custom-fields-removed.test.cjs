const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('user-specific custom fields are removed from entry screens and application code',()=>{
  const html=readFileSync('inventory.html','utf8');
  const app=readFileSync('inventory-app.js','utf8');
  const css=readFileSync('inventory.css','utf8');

  assert.doesNotMatch(html,/data-user-custom-fields|data-custom-field-table|user-custom-fields/);
  assert.doesNotMatch(app,/CustomField|custom-field|customFields|save_inventory_custom_fields/i);
  assert.doesNotMatch(css,/user-custom-field/i);
});

test('movement history keeps its management column and matching table layout',()=>{
  const html=readFileSync('inventory.html','utf8');
  const table=html.match(/<table id="movement-list-table"[\s\S]*?<\/table>/)?.[0]||'';
  assert.ok(table);
  assert.equal([...table.matchAll(/<th(?:\s[^>]*)?>/g)].length,14);
  assert.equal([...table.matchAll(/<col>/g)].length,14);
});
