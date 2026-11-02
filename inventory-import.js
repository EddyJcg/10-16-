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

if(typeof window!=='undefined')window.parseProductImportWorkbook=parseProductImportWorkbook;
if(typeof module!=='undefined'&&module.exports){
  module.exports={PRODUCT_IMPORT_FIELDS,normalizeProductImportHeader,parseProductImportWorkbook};
}
