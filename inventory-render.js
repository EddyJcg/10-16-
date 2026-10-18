'use strict';
function makeCell(text,numeric=false){const cell=document.createElement('td');cell.textContent=text;cell.className=numeric?'numeric':'';return cell;}
function emptyRow(body,columns,text){const row=document.createElement('tr'),cell=makeCell(text);cell.colSpan=columns;cell.className='empty';row.append(cell);body.append(row);}
function formatStockQuantityTotals(rows){
  const totals=new Map();
  rows.forEach(item=>{const quantity=Number(item.stock_quantity)||0;if(quantity<=0)return;const unit=item.unit||'EA(개)';totals.set(unit,(totals.get(unit)||0)+quantity);});
  return totals.size?[...totals].map(([unit,quantity])=>number(quantity)+' '+unit).join(' · '):'0';
}
function renderHeaders(){
  $('stock-head').replaceChildren();
  const serialHeader=document.createElement('th');serialHeader.scope='col';serialHeader.textContent='일련번호';serialHeader.className='numeric';$('stock-head').append(serialHeader);
  STOCK_DISPLAY_FIELDS.forEach(field=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=field.label;cell.className=(field.numeric?'numeric ':'')+(field.numeric?'group-'+field.key.split('_')[0]:'');$('stock-head').append(cell);});
}
function render(){
  renderCurrentStock();
  renderStockRisk();
  renderLongStock();
  $('total-items').textContent=number(items.length);$('total-value').textContent=money(items.reduce((sum,item)=>sum+Number(item.stock_amount||0),0))+'원';
  const shown=filterInventoryItems(items,{query:$('search').value,availability:$('filter').value,dateProductIds:appliedDateProductIds,supplier:appliedSupplier});
  $('list-count').textContent=shown.length+'개';$('items').replaceChildren();
  if(!shown.length)emptyRow($('items'),STOCK_DISPLAY_FIELDS.length+1,items.length?'검색 조건에 맞는 품목이 없습니다.':'왼쪽 기초재고 또는 입고관리 폴더에서 첫 품목을 등록하세요.');
  shown.forEach((item,index)=>{const row=document.createElement('tr');row.append(makeCell(number(index+1),true));STOCK_DISPLAY_FIELDS.forEach(field=>{const cell=makeCell(field.numeric?number(item[field.key]):item[field.key]||(field.key==='unit'?'EA(개)':''),field.numeric);if(field.key==='product_code'){const button=document.createElement('button');button.className='code-button';button.textContent=item.product_code;button.setAttribute('aria-label',item.product_code+' 입고별 잔량 보기');button.addEventListener('click',()=>showLots(item));cell.replaceChildren(button);}row.append(cell);});$('items').append(row);});
  $('history').replaceChildren();if(!movements.length)emptyRow($('history'),9,'아직 기록된 입출고가 없습니다.');
  movements.forEach(movement=>{const item=items.find(item=>item.id===movement.product_id),row=document.createElement('tr'),kind=makeCell(''),badge=document.createElement('span');badge.className='badge '+movement.kind;badge.textContent=MODE_LABELS[movement.kind]?.[1]||movement.kind;kind.append(badge);row.append(makeCell(movement.sequence_id==null?'':number(movement.sequence_id),true),makeCell(movement.movement_date),kind,makeCell(item?.product_code||''),makeCell(item?.product_name||''),makeCell(item?.unit||'EA(개)'),makeCell(number(movement.quantity),true),makeCell(money(movement.unit_cost),true));const amount=makeCell(money(movement.amount),true);if(movement.kind==='issue'){const button=document.createElement('button');button.className='code-button';button.textContent=money(movement.amount);button.setAttribute('aria-label',(item?.product_code||'')+' '+movement.movement_date+' 출고 차감 내역');button.addEventListener('click',()=>showAllocations(movement));amount.replaceChildren(button);}row.append(amount);$('history').append(row);});
}
function renderLongStock(){
  const rows=stockAgingRows(agedStock),body=$('long-stock-items');
  $('total-aged-qty').textContent=formatStockQuantityTotals(rows.map(row=>({stock_quantity:row.remaining_quantity,unit:row.unit})));
  $('long-stock-count').textContent='입고일 기준 6개월 이상 · '+rows.length.toLocaleString('ko-KR')+'건';
  $('long-stock-detail-count').textContent=rows.length.toLocaleString('ko-KR')+'건';body.replaceChildren();
  if(!rows.length){emptyRow(body,12,'입고일 기준 6개월 이상 경과한 재고가 없습니다.');return;}
  rows.forEach(item=>{
    const receivedAt=new Date(item.received_at);
    const receivedAtText=Number.isNaN(receivedAt.getTime())?item.received_date:receivedAt.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    const quantity=Number(item.remaining_quantity),row=document.createElement('tr');
    [receivedAtText,item.product_code,item.product_name,item.specification,item.material,item.color,item.unit,number(quantity),money(item.unit_cost),money(quantity*Number(item.unit_cost)),item.storage_location,item.supplier]
      .forEach((value,index)=>row.append(makeCell(value,index>=7&&index<=9)));
    body.append(row);
  });
}
function renderStockRisk(){
  const risky=stockRiskItems(items),body=$('stock-risk-items');
  $('total-risk-items').textContent=number(risky.length);$('stock-risk-count').textContent=risky.length.toLocaleString('ko-KR')+'개';body.replaceChildren();
  if(!risky.length){emptyRow(body,8,'현재 품절위험 품목이 없습니다.');return;}
  risky.forEach(item=>{
    const standard=Number(item.standard_stock_quantity),stock=Number(item.stock_quantity)||0,unit=item.unit||'EA(개)',row=document.createElement('tr');
    [item.product_category,item.product_code,item.product_name,item.specification,item.color,number(standard)+' '+unit,number(stock)+' '+unit,((stock/standard)*100).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%'].forEach(value=>row.append(makeCell(value)));
    body.append(row);
  });
}
function renderCurrentStock(){
  const shown=currentStockRows(items),head=$('current-stock-head'),body=$('current-stock-items');
  head.replaceChildren();body.replaceChildren();$('current-stock-count').textContent=shown.length+'개';
  [{label:'일련번호',numeric:true},...CURRENT_STOCK_FIELDS].forEach((field,index)=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=field.label;cell.className=field.numeric?'numeric':'';const resizer=document.createElement('button');resizer.type='button';resizer.className='column-resizer';resizer.dataset.column=String(index);resizer.setAttribute('role','separator');resizer.setAttribute('aria-orientation','vertical');resizer.setAttribute('aria-valuemin','52');resizer.setAttribute('aria-valuemax','600');resizer.setAttribute('aria-valuenow',String(parseInt($('current-stock-columns').children[index]?.style.width,10)||120));resizer.setAttribute('aria-label',field.label+' 열 너비 조절');resizer.title='드래그 또는 방향키로 너비 조절';cell.append(resizer);head.append(cell);});
  if(!shown.length)emptyRow(body,CURRENT_STOCK_FIELDS.length+1,'현재 재고가 있는 품목이 없습니다.');
  shown.forEach((item,index)=>{const row=document.createElement('tr');row.append(makeCell(number(index+1),true));CURRENT_STOCK_FIELDS.forEach(field=>row.append(makeCell(field.numeric?number(item[field.key]):item[field.key]||(field.key==='unit'?'EA(개)':''),field.numeric)));body.append(row);});
}
function renderFifoPreview(allocations){$('fifo-preview').replaceChildren();if(!allocations.length)emptyRow($('fifo-preview'),5,'품번과 출고수량을 입력하면 차감 순서를 표시합니다.');allocations.forEach(lot=>{const row=document.createElement('tr');row.append(makeCell(lot.received_date),makeCell(number(lot.remaining_quantity),true),makeCell(number(lot.take),true),makeCell(money(lot.unit_cost),true),makeCell(money(lot.amount),true));$('fifo-preview').append(row);});}
function renderDetailTable(headers,rows){const wrap=document.createElement('div'),table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),heading=document.createElement('tr');wrap.className='table-wrap';headers.forEach(label=>{const cell=document.createElement('th');cell.textContent=label;heading.append(cell);});head.append(heading);if(!rows.length)emptyRow(body,headers.length,'내역이 없습니다.');rows.forEach(values=>{const row=document.createElement('tr');values.forEach(value=>row.append(makeCell(value)));body.append(row);});table.append(head,body);wrap.append(table);$('detail-content').replaceChildren(wrap);}
