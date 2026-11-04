const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('user management page is scaled to 1.44 with 10 percent tighter spacing',()=>{
  assert.match(fs.readFileSync('admin.css','utf8'),/body\{margin:0;zoom:1\.44\}/);
  assert.match(fs.readFileSync('admin.html','utf8'),/href="\/admin\.css\?v=20261104-user-auth-filter"/);
  assert.match(fs.readFileSync('admin.css','utf8'),/\.layout\{gap:19\.8px\}/);
});
