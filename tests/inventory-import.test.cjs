const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const fs=require('node:fs');
const vm=require('node:vm');
const {PRODUCT_IMPORT_FIELDS,parseProductImportWorkbook}=require('../inventory-import.js');

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

test('product import UI provides a local XLSX picker beside the popup close button',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const dialog=html.match(/<dialog id="product-info-dialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.match(dialog,/id="import-product-info-button"[^>]*>Excel 업로드<\/button><button type="button" class="close" id="close-product-info"/);
  assert.match(dialog,/id="product-info-import-file" type="file" accept="[^"]*\.xlsx/);
  assert.match(html,/src="inventory-import\.js"><\/script>/);
});

test('confirmed product import registers every validated row and refreshes the list',async()=>{
  const nodes=new Map(),alerts=[],calls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,value:'',textContent:''});
    return nodes.get(id);
  };
  class Workbook{constructor(){this.xlsx={load:async()=>{}};}}
  const context=vm.createContext({
    document:{getElementById:element},
    window:{ExcelJS:{Workbook},confirm:message=>(calls.push(['confirm',message]),true),alert:message=>alerts.push(message)},
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

  await vm.runInContext('importProductInfoFile({target:{files:[{name:"items.xlsx",arrayBuffer:async()=>new ArrayBuffer(0)}],value:"selected"}})',context);

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
