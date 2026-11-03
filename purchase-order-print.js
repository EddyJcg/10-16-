(function(root){
  const MIN_ROWS=8;
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
    const amount=line?quantity*cost:null;
    return `<tbody class="po-item"><tr><td rowspan="2" class="po-center">${line?index+1:''}</td>`
      +`<td>${esc('')}</td><td>${esc(line?.product_name)}</td><td>${esc('')}</td><td>${esc('')}</td><td class="po-right">${esc('')}</td>`
      +`<td rowspan="2" class="po-center">${esc(line?.unit)}</td><td class="po-right"></td><td class="po-right">${line?money(quantity):''}</td><td class="po-right">${line?money(cost):''}</td></tr>`
      +`<tr><td>${esc(line?.product_code)}</td><td>${esc(line?.specification)}</td><td class="po-small"></td><td></td><td></td>`
      +`<td class="po-right"></td><td class="po-right">${esc(line?.expected_date)}</td><td class="po-right">${line?money(amount):''}</td></tr></tbody>`;
  }

  function buildPurchaseOrderPrint(data={}){
    const company=data.company||{},supplier=data.supplier||{},buyer=data.buyer||{},lines=data.lines||[];
    const total=lines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unit_cost),0);
    const rows=lines.map(itemRows);
    for(let index=lines.length;index<MIN_ROWS;index++)rows.push(itemRows(null,index));
    const body=`<h1 class="po-title">구 매 발 주 서</h1>`
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
      +`<table class="po-summary"><tbody><tr>${label('발주번호')}${value(data.orderNumber)}${label('발주금액')}<td class="po-right">${money(total)}</td>${label('통화')}<td class="po-center">${esc(data.currency||'KRW')}</td></tr></tbody></table>`
      +`<table class="po-lines"><colgroup><col class="po-no"><col><col><col><col><col><col class="po-unit"><col class="po-num"><col class="po-num"><col class="po-money"></colgroup>`
      +`<thead><tr><th rowspan="2">No.</th><th>PJT NO</th><th>품목명</th><th>Maker</th><th>URL</th><th>도면Version</th><th rowspan="2">단위</th><th>본도</th><th>수량</th><th>단가</th></tr>`
      +`<tr><th>품목번호</th><th>규격</th><th>Unit구분</th><th>납품장소</th><th>구매요청자</th><th>대칭</th><th>입고요청일</th><th>금액</th></tr></thead>`
      +rows.join('')+`</table>`;
    return `<table class="po-page"><thead><tr><td><div class="po-margin-top"></div></td></tr></thead><tbody><tr><td class="po-page-body">${body}</td></tr></tbody><tfoot><tr><td><div class="po-margin-bottom"></div></td></tr></tfoot></table>`;
  }

  const api={buildPurchaseOrderPrint,formatDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PurchaseOrderPrint=api;
})(typeof window!=='undefined'?window:globalThis);
