const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('user management page is scaled 1.5 times more with 10 percent tighter spacing',()=>{
  assert.match(fs.readFileSync('admin.css','utf8'),/body\{margin:0;zoom:1\.8\}/);
  assert.match(fs.readFileSync('admin.html','utf8'),/href="\/admin\.css\?v=20261103-zoom-18"/);
  assert.match(fs.readFileSync('admin.css','utf8'),/\.layout\{gap:19\.8px\}/);
});
