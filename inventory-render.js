'use strict';
function makeCell(text,numeric=false){const cell=document.createElement('td');cell.textContent=text;cell.className=numeric?'numeric':'';return cell;}
function emptyRow(body,columns,text){const row=document.createElement('tr'),cell=makeCell(text);cell.colSpan=columns;cell.className='empty';row.append(cell);body.append(row);}
function renderHeaders(){
  $('stock-head').replaceChildren();
  const serialHeader=document.createElement('th');serialHeader.scope='col';serialHeader.textContent='일련번호';serialHeader.className='numeric';$('stock-head').append(serialHeader);
  STOCK_FIELDS.forEach(field=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=field.label;cell.className=(field.numeric?'numeric ':'')+(field.numeric?'group-'+field.key.split('_')[0]:'');$('stock-head').append(cell);});
}
function render(){
  renderCurrentStock();
  $('total-items').textContent=number(items.length);$('total-qty').textContent=number(items.reduce((sum,item)=>sum+Number(item.stock_quantity||0),0));$('total-value').textContent=money(items.reduce((sum,item)=>sum+Number(item.stock_amount||0),0))+'원';$('total-movements').textContent=number(totalMovements);
  const query=$('search').value.trim().toLowerCase(),filter=$('filter').value;
  const shown=items.filter(item=>PRODUCT_FIELDS.some(key=>String(item[key]||'').toLowerCase().includes(query))&&(filter==='all'||(Number(item.stock_quantity)>0)===(filter==='available')));
  $('list-count').textContent=shown.length+'개';$('items').replaceChildren();
  if(!shown.length)emptyRow($('items'),STOCK_FIELDS.length+1,items.length?'검색 조건에 맞는 품목이 없습니다.':'왼쪽 기초재고 또는 입고관리 폴더에서 첫 품목을 등록하세요.');
  shown.forEach((item,index)=>{const row=document.createElement('tr');row.append(makeCell(number(index+1),true));STOCK_FIELDS.forEach(field=>{const cell=makeCell(field.numeric?number(item[field.key]):item[field.key]||'',field.numeric);if(field.key==='product_code'){const button=document.createElement('button');button.className='code-button';button.textContent=item.product_code;button.setAttribute('aria-label',item.product_code+' 입고별 잔량 보기');button.addEventListener('click',()=>showLots(item));cell.replaceChildren(button);}row.append(cell);});$('items').append(row);});
  $('history').replaceChildren();if(!movements.length)emptyRow($('history'),7,'아직 기록된 입출고가 없습니다.');
  movements.forEach(movement=>{const item=items.find(item=>item.id===movement.product_id),row=document.createElement('tr'),kind=makeCell(''),badge=document.createElement('span');badge.className='badge '+movement.kind;badge.textContent=MODE_LABELS[movement.kind]?.[1]||movement.kind;kind.append(badge);row.append(makeCell(movement.movement_date),kind,makeCell(item?.product_code||''),makeCell(item?.product_name||''),makeCell(number(movement.quantity),true),makeCell(money(movement.unit_cost),true));const amount=makeCell(money(movement.amount),true);if(movement.kind==='issue'){const button=document.createElement('button');button.className='code-button';button.textContent=money(movement.amount);button.setAttribute('aria-label',(item?.product_code||'')+' '+movement.movement_date+' 출고 차감 내역');button.addEventListener('click',()=>showAllocations(movement));amount.replaceChildren(button);}row.append(amount);$('history').append(row);});
}
function renderCurrentStock(){
  const shown=currentStockRows(items),head=$('current-stock-head'),body=$('current-stock-items');
  head.replaceChildren();body.replaceChildren();$('current-stock-count').textContent=shown.length+'개';
  [{label:'일련번호',numeric:true},...CURRENT_STOCK_FIELDS].forEach(field=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=field.label;cell.className=field.numeric?'numeric':'';head.append(cell);});
  if(!shown.length)emptyRow(body,CURRENT_STOCK_FIELDS.length+1,'현재 재고가 있는 품목이 없습니다.');
  shown.forEach((item,index)=>{const row=document.createElement('tr');row.append(makeCell(number(index+1),true));CURRENT_STOCK_FIELDS.forEach(field=>row.append(makeCell(field.numeric?number(item[field.key]):item[field.key]||'',field.numeric)));body.append(row);});
}
function renderFifoPreview(allocations){$('fifo-preview').replaceChildren();if(!allocations.length)emptyRow($('fifo-preview'),5,'품번과 출고수량을 입력하면 차감 순서를 표시합니다.');allocations.forEach(lot=>{const row=document.createElement('tr');row.append(makeCell(lot.received_date),makeCell(number(lot.remaining_quantity),true),makeCell(number(lot.take),true),makeCell(money(lot.unit_cost),true),makeCell(money(lot.amount),true));$('fifo-preview').append(row);});}
function renderDetailTable(headers,rows){const wrap=document.createElement('div'),table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),heading=document.createElement('tr');wrap.className='table-wrap';headers.forEach(label=>{const cell=document.createElement('th');cell.textContent=label;heading.append(cell);});head.append(heading);if(!rows.length)emptyRow(body,headers.length,'내역이 없습니다.');rows.forEach(values=>{const row=document.createElement('tr');values.forEach(value=>row.append(makeCell(value)));body.append(row);});table.append(head,body);wrap.append(table);$('detail-content').replaceChildren(wrap);}
