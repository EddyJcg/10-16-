'use strict';

const PRODUCT_IMPORT_FIELDS=[
  {key:'product_category',label:'품목자산분류'},
  {key:'inventory_asset_type',label:'재고자산종류'},
  {key:'product_code',label:'품번'},
  {key:'product_name',label:'품명'},
  {key:'specification',label:'규격'},
  {key:'material',label:'재질'},
  {key:'color',label:'색상'},
  {key:'unit',label:'단위'},
  {key:'standard_stock_quantity',label:'적정재고'}
];

const RECEIPT_IMPORT_FIELDS=[
  {key:'product_category',label:'품목분류'},
  {key:'product_code',label:'품번'},
  {key:'product_name',label:'품명'},
  {key:'specification',label:'규격'},
  {key:'color',label:'색상'},
  {key:'storage_location',label:'저장위치'},
  {key:'supplier',label:'납품업체'},
  {key:'movement_date',label:'입고일자'},
  {key:'quantity',label:'입고수량'},
  {key:'unit_cost',label:'입고단가'}
];

function normalizeProductImportHeader(value){
  return String(value??'').trim().replace(/\s+/g,'').toLocaleLowerCase();
}

function productImportCellText(cell){
  if(cell.value===null||cell.value===undefined)return '';
  return String(cell.text??cell.value).trim();
}

function parseProductImportWorkbook(workbook,classifications,existingItems,units){
  const sheet=workbook.worksheets?.[0];
  if(!sheet)return {errors:['엑셀 파일에 시트가 없습니다.'],rows:[]};

  const headerRow=sheet.getRow(1),headerIndexes=new Map(),duplicateHeaders=[];
  headerRow.eachCell({includeEmpty:false},(cell,column)=>{
    const header=normalizeProductImportHeader(productImportCellText(cell));
    if(!header)return;
    if(headerIndexes.has(header))duplicateHeaders.push(productImportCellText(cell));
    else headerIndexes.set(header,column);
  });
  const missingHeaders=PRODUCT_IMPORT_FIELDS
    .filter(field=>!headerIndexes.has(normalizeProductImportHeader(field.label)))
    .map(field=>field.label);
  if(missingHeaders.length||duplicateHeaders.length){
    const errors=[];
    if(missingHeaders.length)errors.push('필수 열 제목 누락: '+missingHeaders.join(', '));
    if(duplicateHeaders.length)errors.push('중복된 열 제목: '+[...new Set(duplicateHeaders)].join(', '));
    return {errors,rows:[]};
  }

  const classificationByName=new Map(classifications.map(item=>[String(item.name||'').trim(),item]));
  const knownCodes=new Set(existingItems.map(item=>String(item.product_code||'').trim().toUpperCase()));
  const seenCodes=new Set(),allowedUnits=new Set(units),rows=[],errors=[];
  sheet.eachRow((row,rowNumber)=>{
    if(rowNumber===1)return;
    const values=Object.fromEntries(PRODUCT_IMPORT_FIELDS.map(field=>{
      const column=headerIndexes.get(normalizeProductImportHeader(field.label));
      return [field.key,productImportCellText(row.getCell(column))];
    }));
    if(Object.values(values).every(value=>!value))return;

    const rowErrors=[];
    if(!values.product_category)rowErrors.push('품목자산분류 누락');
    const classification=classificationByName.get(values.product_category);
    if(values.product_category&&!classification)rowErrors.push('등록된 품목자산분류가 아님');
    if(!values.inventory_asset_type)rowErrors.push('재고자산종류 누락');
    if(values.inventory_asset_type&&classification&&classification.inventory_asset_type!==values.inventory_asset_type){
      rowErrors.push('품목자산분류와 재고자산종류가 일치하지 않음');
    }
    if(!values.product_code)rowErrors.push('품번 누락');
    else{
      values.product_code=values.product_code.toUpperCase();
      if(values.product_code.length>80)rowErrors.push('품번은 80자 이하여야 함');
      if(knownCodes.has(values.product_code))rowErrors.push('이미 등록된 품번');
      if(seenCodes.has(values.product_code))rowErrors.push('파일 안에 중복된 품번');
      seenCodes.add(values.product_code);
    }
    if(!values.product_name)rowErrors.push('품명 누락');
    if(values.product_name.length>120)rowErrors.push('품명은 120자 이하여야 함');
    if(values.specification.length>200)rowErrors.push('규격은 200자 이하여야 함');
    if(values.material.length>120)rowErrors.push('재질은 120자 이하여야 함');
    if(values.color.length>120)rowErrors.push('색상은 120자 이하여야 함');
    if(!values.unit)rowErrors.push('단위 누락');
    else if(!allowedUnits.has(values.unit))rowErrors.push('지원하지 않는 단위');
    const stockQuantityText=values.standard_stock_quantity.replace(/,/g,'');
    if(!/^\d{1,7}$/.test(stockQuantityText)){
      rowErrors.push('적정재고는 1~1,000,000의 정수여야 함');
    }else{
      const quantity=Number(stockQuantityText);
      if(quantity<1||quantity>1000000)rowErrors.push('적정재고는 1~1,000,000의 정수여야 함');
      values.standard_stock_quantity=quantity;
    }

    if(rowErrors.length)errors.push(`${row.number||rowNumber}행: ${rowErrors.join(', ')}`);
    else rows.push({
      product_category:classification.name,
      product_code:values.product_code,
      product_name:values.product_name,
      specification:values.specification,
      material:values.material,
      color:values.color,
      unit:values.unit,
      standard_stock_quantity:values.standard_stock_quantity
    });
  });
  if(!rows.length&&!errors.length)errors.push('등록할 품목정보가 없습니다.');
  return {errors,rows};
}

function receiptImportDate(cell,workbook){
  const value=cell.value;
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  if(typeof value==='number'&&Number.isFinite(value)){
    const epoch=workbook.properties?.date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
    const date=new Date(epoch+Math.floor(value)*86400000);
    if(!Number.isNaN(date.getTime()))return date.toISOString().slice(0,10);
  }
  const text=productImportCellText(cell);
  const match=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if(!match)return '';
  return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
}

function isValidReceiptImportDate(value,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value
    &&value>='1900-01-01'&&value<=today;
}

function parseReceiptImportWorkbook(workbook,existingItems,today=new Date().toISOString().slice(0,10)){
  const sheet=workbook.worksheets?.[0];
  if(!sheet)return {errors:['엑셀 파일에 시트가 없습니다.'],missingProducts:[],rows:[]};

  const headerRow=sheet.getRow(1),headerIndexes=new Map(),duplicateHeaders=[];
  headerRow.eachCell({includeEmpty:false},(cell,column)=>{
    const header=normalizeProductImportHeader(productImportCellText(cell));
    if(!header)return;
    if(headerIndexes.has(header))duplicateHeaders.push(productImportCellText(cell));
    else headerIndexes.set(header,column);
  });
  const missingHeaders=RECEIPT_IMPORT_FIELDS
    .filter(field=>!headerIndexes.has(normalizeProductImportHeader(field.label)))
    .map(field=>field.label);
  if(missingHeaders.length||duplicateHeaders.length){
    const errors=[];
    if(missingHeaders.length)errors.push('필수 열 제목 누락: '+missingHeaders.join(', '));
    if(duplicateHeaders.length)errors.push('중복된 열 제목: '+[...new Set(duplicateHeaders)].join(', '));
    return {errors,missingProducts:[],rows:[]};
  }

  const productsByCode=new Map(existingItems.map(item=>[String(item.product_code||'').trim().toUpperCase(),item]));
  const errors=[],missingProducts=[],rows=[];
  sheet.eachRow((row,rowNumber)=>{
    if(rowNumber===1)return;
    const values=Object.fromEntries(RECEIPT_IMPORT_FIELDS.map(field=>{
      const column=headerIndexes.get(normalizeProductImportHeader(field.label));
      const cell=row.getCell(column);
      return [field.key,field.key==='movement_date'?receiptImportDate(cell,workbook):productImportCellText(cell)];
    }));
    if(Object.values(values).every(value=>!value))return;

    const rowErrors=[],lineNumber=row.number||rowNumber;
    RECEIPT_IMPORT_FIELDS.filter(field=>field.key!=='quantity'&&field.key!=='unit_cost')
      .forEach(field=>{if(!values[field.key])rowErrors.push(`${field.label} 누락`);});
    const code=values.product_code.toUpperCase();
    const item=code?productsByCode.get(code):null;
    if(code&&!item)missingProducts.push({
      rowNumber:lineNumber,productCode:code,productName:values.product_name,productCategory:values.product_category
    });
    if(item){
      if(item.quantity_management_disabled===true)rowErrors.push('재고수량관리를 하지 않는 품목');
      [
        ['product_category','product_category','품목분류'],
        ['product_name','product_name','품명'],
        ['specification','specification','규격'],
        ['color','color','색상']
      ].forEach(([inputKey,itemKey,label])=>{
        if(String(values[inputKey]||'').trim()!==String(item[itemKey]||'').trim()){
          rowErrors.push(`${label}이 품목정보와 일치하지 않음`);
        }
      });
    }

    if(!isValidReceiptImportDate(values.movement_date,today))rowErrors.push('입고일자는 1900-01-01부터 오늘까지의 올바른 날짜여야 함');
    const quantityText=values.quantity.replace(/,/g,'');
    const quantity=/^\d{1,7}$/.test(quantityText)?Number(quantityText):NaN;
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)rowErrors.push('입고수량은 1~1,000,000의 정수여야 함');
    const unitCostText=values.unit_cost.replace(/,/g,'');
    const unitCost=/^\d{1,10}(?:\.\d{1,2})?$/.test(unitCostText)?Number(unitCostText):NaN;
    if(!Number.isFinite(unitCost)||unitCost<0||unitCost>1000000000)rowErrors.push('입고단가는 0~1,000,000,000원(소수 둘째 자리까지)이어야 함');
    if(values.storage_location.length>120)rowErrors.push('저장위치는 120자 이하여야 함');
    if(values.supplier.length>120)rowErrors.push('납품업체는 120자 이하여야 함');

    if(rowErrors.length)errors.push(`${lineNumber}행: ${rowErrors.join(', ')}`);
    else if(item)rows.push({
      rowNumber:lineNumber,
      date:values.movement_date,
      quantity,
      unitCost,
      details:{
        product_category:item.product_category,
        product_code:item.product_code,
        product_name:item.product_name,
        specification:item.specification||'',
        material:item.material||'',
        color:item.color||'',
        unit:item.unit||'EA(개)',
        storage_location:values.storage_location,
        supplier:values.supplier
      }
    });
  });
  if(!rows.length&&!errors.length&&!missingProducts.length)errors.push('등록할 입고 내역이 없습니다.');
  return {errors,missingProducts,rows};
}

if(typeof window!=='undefined')window.parseProductImportWorkbook=parseProductImportWorkbook;
if(typeof window!=='undefined')window.parseReceiptImportWorkbook=parseReceiptImportWorkbook;
if(typeof module!=='undefined'&&module.exports){
  module.exports={PRODUCT_IMPORT_FIELDS,RECEIPT_IMPORT_FIELDS,normalizeProductImportHeader,parseProductImportWorkbook,parseReceiptImportWorkbook};
}
