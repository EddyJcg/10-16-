(function(root){
  const ROWS_LANDSCAPE=10,ROWS_PORTRAIT=22;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=value=>Number.isFinite(Number(value))&&value!==''&&value!==null?Math.round(Number(value)).toLocaleString('ko-KR'):'';
  function formatDate(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');
    return match?`${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`:'';
  }
  const label=(text,attrs='')=>`<th class="po-label"${attrs?' '+attrs:''}>${esc(text)}</th>`;
  const value=(text,attrs='')=>`<td${attrs?' '+attrs:''}>${esc(text)}</td>`;

  function itemRows(line,index){
    const quantity=line?Number(line.quantity):null,cost=line?Number(line.unit_cost):null;
    return `<tr><td class="po-center">${index+1}</td><td>${esc(line?.product_code)}</td><td>${esc(line?.product_name)}</td><td>${esc(line?.specification)}</td>`
      +`<td class="po-center">${esc(line?.unit)}</td><td class="po-right">${line?money(quantity):''}</td><td class="po-right">${line?money(cost):''}</td>`
      +`<td class="po-right">${line?money(quantity*cost):''}</td><td class="po-center">${esc(line?.expected_date)}</td><td>${esc(line?.notes)}</td></tr>`;
  }
  function buildPurchaseOrderPrint(data={}){
    const company=data.company||{},supplier=data.supplier||{},buyer=data.buyer||{},lines=data.lines||[];
    const total=lines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unit_cost),0);
    const landscape=data.orientation!=='portrait',perPage=landscape?ROWS_LANDSCAPE:ROWS_PORTRAIT;
    const pages=Math.max(1,Math.ceil(lines.length/perPage));
    const top=`<h1 class="po-title">구 매 발 주 서</h1>`
      +`<table class="po-company"><tbody>`
      +`<tr>${label('상　　　호')}<td>: ${esc(company.name)}</td></tr>`
      +`<tr>${label('사업자등록번호')}<td>: ${esc(company.business_number)}</td></tr>`
      +`<tr>${label('대 표 자 명')}<td>: ${esc(company.representative)}</td></tr>`
      +`<tr>${label('주　　　소')}<td>: ${esc(company.address)}</td></tr></tbody></table>`
      +`<p class="po-date">P/O DATE : ${esc(formatDate(data.orderDate))}</p>`
      +`<table class="po-party"><colgroup><col class="po-narrow"><col class="po-lab"><col><col class="po-lab"><col><col class="po-narrow"><col class="po-lab"><col></colgroup><tbody>`
      +`<tr><th rowspan="5" class="po-side">공<br>급<br>자</th>${label('거 래 처 명')}${value(supplier.name)}${label('대 표 자 명')}${value(supplier.representative)}`
      +`<th rowspan="5" class="po-side">발<br>주<br>자</th>${label('발 주 부 서')}${value(buyer.department)}</tr>`
      +`<tr>${label('주　　소')}${value(supplier.address,'colspan="3"')}${label('발 주 담 당')}${value(buyer.manager)}</tr>`
      +`<tr>${label('사업자등록번호')}${value(supplier.business_number)}${label('전 화 번 호')}${value(supplier.phone)}${label('전 화 번 호')}${value(buyer.phone)}</tr>`
      +`<tr>${label('담 당 자')}${value(supplier.contact)}${label('연 락 처')}${value(supplier.contact_phone)}${label('H.P')}${value(buyer.mobile)}</tr>`
      +`<tr>${label('H.P')}${value(supplier.mobile)}${label('E-mail 주소')}${value(supplier.email)}${label('E-mail 주소')}${value(buyer.email)}</tr>`
      +`</tbody></table>`
      +`<table class="po-summary"><tbody><tr>${label('발주번호')}${value(data.orderNumber)}${label('발주금액')}<td class="po-right">${money(total)}</td>${label('통화')}<td class="po-center">${esc(data.currency||'KRW')}</td></tr></tbody></table>`;
    const linesTable=rows=>`<table class="po-lines"><colgroup><col class="po-no"><col><col><col><col class="po-unit"><col class="po-num"><col class="po-num"><col class="po-num"><col class="po-due"><col></colgroup>`
      +`<thead><tr><th>NO</th><th>품번</th><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>발주단가</th><th>발주금액</th><th>입고예정일</th><th>비고</th></tr></thead><tbody>`
      +rows.join('')+`</tbody></table>`;
    const sheets=[];
    for(let page=0;page<pages;page++){
      const rows=[];
      for(let index=page*perPage;index<(page+1)*perPage;index++)rows.push(itemRows(lines[index],index));
      sheets.push(`<section class="po-sheet ${landscape?'po-landscape':'po-portrait'}"><div class="po-sheet-body">${top}<div class="po-lines-wrap">${linesTable(rows)}</div></div>`
        +(pages>1?`<div class="po-pageno">${page+1}/${pages}</div>`:'')+`</section>`);
    }
    return sheets.join('');
  }

  const api={buildPurchaseOrderPrint,formatDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PurchaseOrderPrint=api;
})(typeof window!=='undefined'?window:globalThis);
