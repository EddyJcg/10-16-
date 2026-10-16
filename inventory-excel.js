'use strict';

function createInventoryWorkbook(ExcelJS, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '재고노트';
  const sheet = workbook.addWorksheet('재고목록',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns = [
    {header:'품목명',width:32}, {header:'분류',width:16}, {header:'입고일자',width:16},
    {header:'현재 수량',width:15}, {header:'최소 수량',width:15}, {header:'단가(원)',width:18}
  ];
  rows.forEach(item => {
    const date = item.received_date ? new Date(item.received_date + 'T00:00:00Z') : null;
    if (date && !Number.isFinite(date.getTime())) throw new Error('입고일자를 확인해 주세요.');
    // 문자열을 수식 객체로 변환하지 않아 =, + 등으로 시작하는 품목명도 그대로 보존합니다.
    sheet.addRow([String(item.name),String(item.category),date,item.quantity,item.minimum,item.price]);
  });
  sheet.eachRow(row => { row.font = {name:'Arial',size:11}; row.height = 22; });
  const header = sheet.getRow(1);
  header.font = {name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};
  header.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF163E32'}};
  header.height = 28;
  sheet.getColumn(3).numFmt = 'yyyy-mm-dd';
  [4,5,6].forEach(column => sheet.getColumn(column).numFmt = '#,##0');
  sheet.autoFilter = {from:'A1',to:'F' + sheet.rowCount};
  return workbook;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {createInventoryWorkbook};
