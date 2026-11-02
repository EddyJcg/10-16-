const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const fs=require('node:fs');
const vm=require('node:vm');
const {
  PRODUCT_IMPORT_FIELDS,RECEIPT_IMPORT_FIELDS,parseProductImportWorkbook,parseReceiptImportWorkbook
}=require('../inventory-import.js');

const classifications=[{id:'raw-id',name:'원자재',inventory_asset_type:'원자재'}];
const units=['EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식'];

async function workbookWith(headers,rows){
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet('품목정보');
  sheet.addRow(headers);
  rows.forEach(row=>sheet.addRow(row));
  return workbook;
}

test('product import accepts flexible header spacing and arbitrary column order',async()=>{
  const headers=[' 품번 ',' 재고 자산 종류 ','품목 자산분류','품명','규격','재질','색상','단 위','적정재고'];
  const workbook=await workbookWith(headers,[['sku-001','원자재','원자재','품목명','규격','재질','검정','EA(개)',100]]);
  const result=parseProductImportWorkbook(workbook,classifications,[],units);

  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.rows,[{
    product_category:'원자재',product_code:'SKU-001',product_name:'품목명',
    specification:'규격',material:'재질',color:'검정',unit:'EA(개)',standard_stock_quantity:100
  }]);
});

test('product import reports missing required columns and duplicate headings',async()=>{
  const missingWorkbook=await workbookWith(['품목자산분류','품번'],[]);
  const missing=parseProductImportWorkbook(missingWorkbook,classifications,[],units);
  assert.ok(missing.errors.some(error=>error.includes('필수 열 제목 누락')));
  for(const label of PRODUCT_IMPORT_FIELDS.filter(field=>!['품목자산분류','품번'].includes(field.label)).map(field=>field.label))
    assert.ok(missing.errors.join(' ').includes(label));

  const duplicateWorkbook=await workbookWith(
    PRODUCT_IMPORT_FIELDS.map(field=>field.label).concat(' 품 번 '),[]
  );
  const duplicate=parseProductImportWorkbook(duplicateWorkbook,classifications,[],units);
  assert.ok(duplicate.errors.some(error=>error.includes('중복된 열 제목')));
});

test('receipt import requires all receipt columns and matches the registered product information',async()=>{
  const item={
    product_code:'SKU-001',product_category:'원자재',product_name:'부품',specification:'규격',
    color:'검정',material:'철',unit:'EA(개)'
  };
  const headers=RECEIPT_IMPORT_FIELDS.map(field=>field.label);
  const workbook=await workbookWith(headers,[[
    '원자재','sku-001','부품','규격','검정','선반 A','공급사','2026-11-02',15,'1,250.50'
  ]]);
  const parsed=parseReceiptImportWorkbook(workbook,[item],'2026-11-02');

  assert.deepEqual(parsed.errors,[]);
  assert.deepEqual(parsed.missingProducts,[]);
  assert.deepEqual(parsed.rows,[{
    rowNumber:2,date:'2026-11-02',quantity:15,unitCost:1250.5,
    details:{
      product_category:'원자재',product_code:'SKU-001',product_name:'부품',
      specification:'규격',material:'철',color:'검정',unit:'EA(개)',
      storage_location:'선반 A',supplier:'공급사'
    }
  }]);

  const missingHeaderWorkbook=await workbookWith(headers.slice(1),[]);
  const missingHeaders=parseReceiptImportWorkbook(missingHeaderWorkbook,[item],'2026-11-02');
  assert.ok(missingHeaders.errors.some(error=>error.includes('필수 열 제목 누락: 품목분류')));
});

test('receipt import reports all unregistered products and rejects mismatched or invalid rows',async()=>{
  const item={
    product_code:'SKU-001',product_category:'원자재',product_name:'부품',specification:'규격',
    color:'검정',material:'철',unit:'EA(개)'
  };
  const workbook=await workbookWith(RECEIPT_IMPORT_FIELDS.map(field=>field.label),[
    ['원자재','UNKNOWN-01','미등록 품목','규격','검정','A-1','업체','2026-11-02',10,20],
    ['원자재','SKU-001','다른 품명','규격','검정','A-1','업체','2026-11-03',0,-1],
    ['원자재','UNKNOWN-02','미등록 품목 2','규격','검정','A-1','업체','2026-11-02',5,10]
  ]);
  const parsed=parseReceiptImportWorkbook(workbook,[item],'2026-11-02');

  assert.deepEqual(parsed.missingProducts.map(item=>item.productCode),['UNKNOWN-01','UNKNOWN-02']);
  assert.equal(parsed.rows.length,0);
  assert.match(parsed.errors.join('\n'),/품명.*품목정보와 일치하지 않음/);
  assert.match(parsed.errors.join('\n'),/입고수량은 1~1,000,000의 정수/);
  assert.match(parsed.errors.join('\n'),/입고단가는 0~1,000,000,000원/);
});

test('product import rejects every invalid row before registration',async()=>{
  const workbook=await workbookWith(PRODUCT_IMPORT_FIELDS.map(field=>field.label),[
    ['원자재','원자재','SKU-001','정상 품목','','','','EA(개)',30],
    ['없는 분류','원자재','SKU-002','분류 오류','','','','EA(개)',20],
    ['원자재','원자재','SKU-001','파일 중복','','','','EA(개)',10],
    ['원자재','원자재','EXISTING','이미 등록됨','','','','EA(개)',10],
    ['원자재','원자재','SKU-005','잘못된 단위','','','','없음',0]
  ]);
  const result=parseProductImportWorkbook(workbook,classifications,[{product_code:'existing'}],units);

  assert.equal(result.rows.length,1);
  assert.equal(result.errors.length,4);
  assert.match(result.errors.join('\n'),/등록된 품목자산분류가 아님/);
  assert.match(result.errors.join('\n'),/파일 안에 중복된 품번/);
  assert.match(result.errors.join('\n'),/이미 등록된 품번/);
  assert.match(result.errors.join('\n'),/지원하지 않는 단위/);
  assert.match(result.errors.join('\n'),/적정재고는 1~1,000,000의 정수/);
});

test('product import rejects specifications already in use or repeated in the workbook',async()=>{
  const workbook=await workbookWith(PRODUCT_IMPORT_FIELDS.map(field=>field.label),[
    ['원자재','원자재','SKU-001','정상 품목','기존 규격','','','EA(개)',30],
    ['원자재','원자재','SKU-002','파일 중복 1','새 규격','','','EA(개)',30],
    ['원자재','원자재','SKU-003','파일 중복 2',' 새 규격 ','','','EA(개)',30],
    ['원자재','원자재','SKU-004','빈 규격','','','','EA(개)',30]
  ]);
  const result=parseProductImportWorkbook(workbook,classifications,[{product_code:'OLD',specification:'기존 규격'}],units);
  assert.equal(result.rows.length,2);
  assert.match(result.errors[0],/이미 등록된 규격/);
  assert.match(result.errors[1],/파일 안에 중복된 규격/);
});

test('product import opens the native XLSX picker directly without an intermediate dialog',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const dialog=html.match(/<dialog id="product-info-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.match(dialog,/id="import-product-info-button"[^>]*>Excel 업로드<\/button><button type="button" class="close" id="close-product-info"/);
  assert.match(dialog,/id="product-info-import-file" type="file" accept="[^"]*\.xlsx/);
  assert.doesNotMatch(html,/product-info-import-dialog|product-import-dialog/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/function openProductInfoFilePicker\(\)/);
  assert.match(html,/src="inventory-import\.js"><\/script>/);
});

test('receipt dialog provides an XLSX picker and a missing-product details window',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const dialog=html.match(/<dialog id="movement-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.match(dialog,/id="import-receipt-button" hidden>Excel 업로드<\/button><button type="button" class="close" id="close-dialog"/);
  assert.match(dialog,/id="receipt-import-file" type="file" accept="[^"]*\.xlsx/);
  assert.match(html,/<dialog id="receipt-import-missing-dialog"/);
  assert.match(html,/id="receipt-import-missing-items"/);
});

test('opening a selected product workbook imports every validated row and refreshes the list',async()=>{
  const nodes=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,value:'',textContent:'',open:false,clicks:0,click(){this.clicks++;},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(id);
  };
  class Workbook{constructor(){this.xlsx={load:async()=>{}};}}
  const context=vm.createContext({
    document:{getElementById:element},
    window:{ExcelJS:{Workbook},confirm:()=>{throw new Error('an extra confirmation should not be shown');},alert:message=>alerts.push(message)},
    calls,PRODUCT_UNITS:units
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.window.parseProductImportWorkbook=()=>({errors:[],rows:[
    {product_code:'SKU-001',product_category:'원자재'},
    {product_code:'SKU-002',product_category:'원자재'}
  ]});
  vm.runInContext(`currentUser={id:'user'};authGeneration=3;assetClassifications=[];items=[];
    client={rpc:async(...args)=>(calls.push(args),{error:null})};
    loadStock=async()=>calls.push(['loadStock']);
    renderProductInfoItems=()=>calls.push(['renderProductInfoItems']);`,context);

  const file={name:'items.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)};
  await vm.runInContext('openProductInfoFilePicker()',context);
  assert.equal(element('product-info-import-file').clicks,1);
  context.productImportFile=file;
  await vm.runInContext('importProductInfoFile({target:{files:[productImportFile],value:"selected"}})',context,{timeout:1000});

  assert.equal(calls.filter(call=>call[0]==='register_stock_product').length,2);
  assert.ok(calls.some(call=>call[0]==='loadStock'));
  assert.deepEqual(alerts,['품목정보 2건을 등록했습니다.']);
  assert.equal(element('product-info-editor').disabled,false);
  assert.equal(element('import-product-info-button').disabled,false);
});

test('invalid product-import rows show a warning and make no registration calls',async()=>{
  const nodes=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,value:'',textContent:''});
    return nodes.get(id);
  };
  class Workbook{constructor(){this.xlsx={load:async()=>{}};}}
  const context=vm.createContext({
    document:{getElementById:element},
    window:{ExcelJS:{Workbook},confirm:()=>{throw new Error('confirmation must not be shown');},alert:message=>alerts.push(message)},
    calls,PRODUCT_UNITS:units
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.window.parseProductImportWorkbook=()=>({errors:['필수 열 제목 누락: 품명'],rows:[]});
  vm.runInContext(`currentUser={id:'user'};authGeneration=3;assetClassifications=[];items=[];
    client={rpc:async(...args)=>(calls.push(args),{error:null})};`,context);

  await vm.runInContext('importProductInfoFile({target:{files:[{name:"items.xlsx",arrayBuffer:async()=>new ArrayBuffer(0)}],value:"selected"}})',context);

  assert.equal(calls.length,0);
  assert.match(alerts[0],/필수 열 제목 누락: 품명/);
});

test('confirmed receipt import registers every validated row and refreshes stock',async()=>{
  const nodes=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,value:'',textContent:'',replaceChildren(){},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(id);
  };
  class Workbook{constructor(){this.xlsx={load:async()=>{}};}}
  const context=vm.createContext({
    document:{getElementById:element},
    window:{ExcelJS:{Workbook},confirm:message=>(calls.push(['confirm',message]),true),alert:message=>alerts.push(message)},
    crypto:{randomUUID:()=>`request-${calls.length}`},calls,PRODUCT_UNITS:units
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.window.parseReceiptImportWorkbook=()=>({errors:[],missingProducts:[],rows:[
    {rowNumber:2,date:'2026-11-02',quantity:3,unitCost:10,details:{product_code:'SKU-001'}},
    {rowNumber:3,date:'2026-11-02',quantity:4,unitCost:20,details:{product_code:'SKU-002'}}
  ]});
  vm.runInContext(`currentUser={id:'user'};authGeneration=3;mode='receipt';editingMovementId='';items=[];todayDate=()=> '2026-11-02';
    loadStock=async()=>calls.push(['loadStock']);
    client={rpc:async(...args)=>(calls.push(args),{error:null})};`,context);

  await vm.runInContext('importReceiptFile({target:{files:[{name:"receipts.xlsx",arrayBuffer:async()=>new ArrayBuffer(0)}],value:"selected"}})',context);

  const registrations=calls.filter(call=>call[0]==='post_stock_movement');
  assert.equal(registrations.length,2,JSON.stringify({calls,alerts}));
  assert.equal(registrations[0][1].p_kind,'receipt');
  assert.deepEqual(alerts,['입고 내역 2건을 등록했습니다.']);
  assert.ok(calls.some(call=>call[0]==='loadStock'));
  assert.equal(element('movement-editor').disabled,false);
  assert.equal(element('import-receipt-button').disabled,false);
});

test('receipt import shows unregistered products and prevents every registration',async()=>{
  const nodes=new Map(),alerts=[],calls=[],tableRows=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,value:'',textContent:'',replaceChildren(){tableRows.length=0;},append(row){tableRows.push(row);},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(id);
  };
  class Workbook{constructor(){this.xlsx={load:async()=>{}};}}
  const context=vm.createContext({
    document:{getElementById:element,createElement:()=>({children:[],append(child){this.children.push(child);},textContent:''})},
    window:{ExcelJS:{Workbook},confirm:()=>{throw new Error('confirmation must not be shown');},alert:message=>alerts.push(message)},
    crypto:{randomUUID:()=>`request-${calls.length}`},calls
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.window.parseReceiptImportWorkbook=()=>({
    errors:[],rows:[],missingProducts:[{rowNumber:4,productCode:'UNKNOWN-01',productName:'미등록 품목',productCategory:'원자재'}]
  });
  vm.runInContext(`currentUser={id:'user'};authGeneration=3;mode='receipt';editingMovementId='';items=[];todayDate=()=> '2026-11-02';
    loadStock=async()=>calls.push(['loadStock']);
    client={rpc:async(...args)=>(calls.push(args),{error:null})};`,context);

  await vm.runInContext('importReceiptFile({target:{files:[{name:"receipts.xlsx",arrayBuffer:async()=>new ArrayBuffer(0)}],value:"selected"}})',context);

  assert.equal(calls.filter(call=>call[0]==='post_stock_movement').length,0);
  assert.equal(element('receipt-import-missing-dialog').open,true,JSON.stringify({calls,alerts,modal:element('receipt-import-missing-dialog')}));
  assert.equal(tableRows.length,1);
  assert.equal(tableRows[0].children[1].textContent,'UNKNOWN-01');
  assert.deepEqual(alerts,[]);
});
