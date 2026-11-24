'use strict';

function createInventoryWorkbook(ExcelJS, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '재고노트';
  const fields = typeof STOCK_EXPORT_FIELDS !== 'undefined' ? STOCK_EXPORT_FIELDS : require('./inventory-model.js').STOCK_EXPORT_FIELDS;
  const columnLetter = index => String.fromCharCode(64 + index);
  const letterOf = key => columnLetter(fields.findIndex(field=>field.key===key)+1);
  const sheet = workbook.addWorksheet('재고현황',{views:[{state:'frozen',xSplit:3,ySplit:1}]});
  sheet.columns = fields.map(field=>({header:field.label,width:field.numeric?17:field.key==='product_name'||field.key==='specification'?26:20}));
  rows.forEach(item => {
    // 문자열을 수식 객체로 변환하지 않아 =, + 등으로 시작하는 품목명도 그대로 보존합니다.
    const row=sheet.addRow(fields.map(field=>field.numeric?Number(item[field.key]||0):String(item[field.key]||'')));
    const r=row.number;
    const oq=letterOf('opening_quantity'),rq=letterOf('receipt_quantity'),iq=letterOf('issue_quantity'),sq=letterOf('stock_quantity');
    const oa=letterOf('opening_amount'),ra=letterOf('receipt_amount'),ia=letterOf('issue_amount'),sa=letterOf('stock_amount');
    for(const [column,formula,key] of [
      [letterOf('opening_unit_cost'),`IF(${oq}${r}=0,0,${oa}${r}/${oq}${r})`,'opening_unit_cost'],
      [letterOf('receipt_unit_cost'),`IF(${rq}${r}=0,0,${ra}${r}/${rq}${r})`,'receipt_unit_cost'],
      [letterOf('issue_unit_cost'),`IF(${iq}${r}=0,0,${ia}${r}/${iq}${r})`,'issue_unit_cost'],
      [sq,`${oq}${r}+${rq}${r}-${iq}${r}`,'stock_quantity'],
      [letterOf('stock_unit_cost'),`IF(${sq}${r}=0,0,${sa}${r}/${sq}${r})`,'stock_unit_cost']
    ])row.getCell(column).value={formula,result:Number(item[key]||0)};
  });
  sheet.eachRow(row => { row.font = {name:'Arial',size:11}; row.height = 22; });
  const header = sheet.getRow(1);
  header.font = {name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};
  header.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF163E32'}};
  header.height = 28;
  fields.forEach((field,index)=>{if(field.numeric)sheet.getColumn(index+1).numFmt=field.key.endsWith('_quantity')?'#,##0':'#,##0.00';});
  sheet.autoFilter = {from:'A1',to:columnLetter(fields.length) + sheet.rowCount};
  return workbook;
}

function createDataWorkbook(ExcelJS,{sheetName,headers,rows,numericColumns=[]}) {
  const workbook=new ExcelJS.Workbook();
  workbook.creator='재고노트';
  const sheet=workbook.addWorksheet(sheetName,{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=headers.map((header,index)=>({
    header,
    width:Math.min(32,Math.max(12,String(header).length*2+4)),
    ...(numericColumns.includes(index)?{style:{numFmt:'#,##0.##'}}:{})
  }));
  rows.forEach(values=>sheet.addRow(values.map((value,index)=>{
    if(numericColumns.includes(index))return Number(value||0);
    return String(value??'');
  })));
  sheet.eachRow(row=>{row.font={name:'Arial',size:11};row.height=22;});
  const header=sheet.getRow(1);
  header.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};
  header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF163E32'}};
  header.height=28;
  sheet.autoFilter={from:'A1',to:sheet.getCell(1,headers.length).address.replace(/\d+$/,'')+sheet.rowCount};
  return workbook;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {createInventoryWorkbook,createDataWorkbook};
