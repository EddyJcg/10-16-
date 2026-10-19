'use strict';
const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('ko-KR',{maximumFractionDigits:2});
const money = number;
const MODE_LABELS = {opening:['기초재고','기초','기초일자'],receipt:['입고관리','입고','입고일자'],issue:['출고관리','출고','출고일자']};
let client,currentUser = null,items = [],agedStock = [],authGeneration = 0;
let loadPromise = null,reloadQueued = false,syncTimer = null,salesSyncTimer=null,busy = false,exporting = false;
let appliedDateProductIds = null,appliedSupplier = '',searching = false;
let productListDateIds = null,productListSupplier = '',productListQuery = '',productListSearching = false;
let movementListRows = [],movementListLoading = false;
let salesOrders = [],salesOrdersLoading = false,salesOrderSaving = false;
let appliedSalesStatusFilters={startDate:'',endDate:'',orderType:'',salesStatus:''},salesStatusUpdating=false;
let appliedSalesBalanceFilters={startDate:'',endDate:'',orderType:''};
const printMargins = {top:10,right:10,bottom:10,left:10};
let printMarginDrag = null,activePrintTarget='product-list';
const columnWidthDefaults={
  'current-stock':[120,140,160,150,120,120,110,110,90,120,140,150,150],
  'movement-list':[100,115,90,140,160,150,120,130,150,90,100,110,120]
};
let mode = 'opening',requestId = null,selectedCode = '',productLots = [],lotsGeneration = 0,productLotsReady = false;
let selectedProductInfoCode = '';
function notify(text,error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function errorText(error) {
  const message = error?.message || '';
  const errors = {
    ACCOUNT_DISABLED:'사용이 중지되었거나 만료된 계정입니다. 관리자에게 문의하세요.',
    INSUFFICIENT_STOCK:'출고일자 기준으로 재고가 부족합니다. 최신 잔량과 출고수량을 확인하세요.',
    BACKDATE_CONFLICT:'이미 확정된 거래보다 앞선 날짜입니다. 과거 출고 원가를 바꾸지 않도록 거래를 날짜 순서대로 입력하세요.',
    OPENING_ALREADY_STARTED:'이 품목은 이미 거래가 시작되었습니다. 기초재고는 처음 한 번만 등록할 수 있습니다.',
    PRODUCT_DETAILS_CONFLICT:'같은 품번의 품목 정보가 다릅니다. 기존 품목을 선택하거나 다른 품번을 사용하세요.',
    PRODUCT_CODE_ALREADY_EXISTS:'이미 등록된 품번입니다. 다른 품번을 입력하세요.',
    PRODUCT_INFO_REQUIRED:'품목정보를 입력해 주세요!',
    PRODUCT_NOT_FOUND:'출고할 품번을 목록에서 선택하세요.',
    REQUEST_CONFLICT:'같은 요청번호에 다른 내용이 들어 있습니다. 창을 다시 열어 확인하세요.',
    INVALID_INPUT:'날짜, 수량과 단가를 확인하세요. 미래 일자와 소수 수량은 사용할 수 없습니다.',
    INVALID_PRODUCT_DETAILS:'품목분류·품명 등 품목 정보를 확인하세요.',
    INVALID_PRODUCT_CODE:'품번을 입력하세요.',
    INVALID_SALES_ORDER:'수주번호, 수주형태, 품명, 단위, 수량, 단가와 납기일자를 확인하세요.'
  };
  for (const [key,text] of Object.entries(errors)) if (message.includes(key)) return text;
  if (['PGRST205','PGRST202','42P01','42703','42501'].includes(error?.code)) return '재고 DB 설정이 필요합니다. Supabase SQL Editor에서 supabase/fifo.sql을 실행하세요. 로그인·권한 설정은 기존 schema.sql을 사용합니다.';
  return '요청을 완료하지 못했습니다. 네트워크와 로그인 상태를 확인하세요. 저장 응답이 끊겼다면 내역을 확인하거나 같은 내용으로 다시 저장하세요.';
}
async function showLongStock() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  $('long-stock-status').textContent='최신 재고를 불러오는 중…';renderLongStock();$('long-stock-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('long-stock-status').textContent='';}
  catch(error){if(generation===authGeneration)$('long-stock-status').textContent='최신 조회에 실패했습니다. 표시된 내역은 마지막 조회 결과입니다. '+errorText(error);}
}
async function showStockRisk() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  $('stock-risk-status').textContent='최신 재고를 불러오는 중…';renderStockRisk();$('stock-risk-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('stock-risk-status').textContent='';}
  catch(error){if(generation===authGeneration)$('stock-risk-status').textContent='최신 조회에 실패했습니다. 표시된 목록은 마지막 조회 결과입니다. '+errorText(error);}
}
function renderSalesOrders(){
  const body=$('sales-order-items');body.replaceChildren();
  if(!salesOrders.length){emptyRow(body,14,'저장된 수주가 없습니다.');return;}
  salesOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number,order.order_type,order.product_name,order.specification,order.unit,
      number(order.quantity),money(order.unit_price),money(order.amount),String(order.due_date).slice(0,10),
      order.delivery_method,order.address,order.notes].forEach((value,index)=>row.append(makeCell(value,index===0||index===7||index===8||index===9)));
    body.append(row);
  });
}
function renderSalesBalance(){
  const body=$('sales-balance-items'),outstanding=salesOrders.filter(order=>(order.sales_status||'매출미완료')==='매출미완료');
  const visibleOrders=filterSalesOrders(outstanding,{...appliedSalesBalanceFilters,salesStatus:'매출미완료'});
  const totalCents=outstanding.reduce((sum,order)=>sum+Math.round(Number(order.amount||0)*100),0);
  const visibleCents=visibleOrders.reduce((sum,order)=>sum+Math.round(Number(order.amount||0)*100),0);
  body.replaceChildren();
  $('total-sales-backlog-count').textContent=outstanding.length.toLocaleString('ko-KR')+'건';
  $('total-sales-backlog-amount').textContent='합계 '+money(totalCents/100)+'원';
  $('sales-balance-summary').textContent=visibleOrders.length.toLocaleString('ko-KR')+'건 · 수주 잔고 '+money(visibleCents/100)+'원';
  if(!visibleOrders.length){emptyRow(body,15,outstanding.length?'검색 조건에 해당하는 수주잔고가 없습니다.':'현재 매출미완료 수주가 없습니다.');return;}
  visibleOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number].forEach((value,index)=>row.append(makeCell(value,index===0)));
    const statusCell=document.createElement('td'),select=document.createElement('select');
    select.dataset.orderId=order.id;select.setAttribute('aria-label',order.order_number+' 매출 상태');
    [['매출완료','매출 완료'],['매출미완료','매출 미완료']].forEach(([value,label])=>{
      const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
    });
    select.value='매출미완료';select.disabled=salesStatusUpdating;statusCell.append(select);row.append(statusCell);
    [order.order_type,order.product_name,order.specification,order.unit,number(order.quantity),money(order.unit_price),
      money(order.amount),String(order.due_date).slice(0,10),order.delivery_method,order.address,order.notes]
      .forEach((value,index)=>row.append(makeCell(value,index===4||index===5||index===6)));
    body.append(row);
  });
}
function applySalesBalanceSearch(clear=false){
  const startDate=clear?'':$('sales-balance-start-date').value,endDate=clear?'':$('sales-balance-end-date').value;
  const orderType=clear?'':$('sales-balance-type-filter').value;
  if((startDate&&!validOrderDueDate(startDate))||(endDate&&!validOrderDueDate(endDate))){
    $('sales-balance-status').textContent='올바른 시작일과 종료일을 입력하세요.';return;
  }
  if(startDate&&endDate&&startDate>endDate){$('sales-balance-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  if(clear){$('sales-balance-start-date').value='';$('sales-balance-end-date').value='';$('sales-balance-type-filter').value='';}
  appliedSalesBalanceFilters={startDate,endDate,orderType};
  $('sales-balance-status').textContent='';
  renderSalesBalance();
}
function renderSalesStatus(){
  const body=$('sales-status-items');body.replaceChildren();
  const filters=appliedSalesStatusFilters,baseOrders=filterSalesOrders(salesOrders,{...filters,salesStatus:''});
  const totals=summarizeSalesOrders(salesOrders,filters);
  const visibleOrders=filterSalesOrders(baseOrders,filters);
  $('sales-status-period').textContent=filters.startDate||filters.endDate
    ? `${filters.startDate||'처음부터'} ~ ${filters.endDate||'현재까지'}`:'전체 기간';
  $('sales-status-total').textContent='총수주액 '+money(totals.total)+'원';
  $('sales-status-completed-total').textContent=money(totals.completed)+'원';
  $('sales-status-outstanding-total').textContent=money(totals.outstanding)+'원';
  if(!visibleOrders.length){emptyRow(body,15,'검색 조건에 해당하는 수주가 없습니다.');return;}
  visibleOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number].forEach((value,index)=>row.append(makeCell(value,index===0)));
    const statusCell=document.createElement('td'),select=document.createElement('select');
    select.dataset.orderId=order.id;select.setAttribute('aria-label',order.order_number+' 매출 상태');
    [['매출완료','매출 완료'],['매출미완료','매출 미완료']].forEach(([value,label])=>{
      const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
    });
    select.value=order.sales_status||'매출미완료';select.disabled=salesStatusUpdating;statusCell.append(select);row.append(statusCell);
    [order.order_type,order.product_name,order.specification,order.unit,number(order.quantity),money(order.unit_price),
      money(order.amount),String(order.due_date).slice(0,10),order.delivery_method,order.address,order.notes]
      .forEach((value,index)=>row.append(makeCell(value,index===4||index===5||index===6)));
    body.append(row);
  });
}
async function loadSalesOrders(){
  if(salesOrdersLoading)return;
  salesOrdersLoading=true;$('sales-order-status').textContent='저장된 수주를 불러오는 중…';$('sales-status-message').textContent='수주 정보를 불러오는 중…';
  try{
    const rows=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await client.from('sales_orders').select('*').order('sequence_id',{ascending:false}).range(offset,offset+499);
      if(error)throw error;
      rows.push(...data);
      if(data.length<500)break;
    }
    salesOrders=rows;renderSalesOrders();renderSalesStatus();renderSalesBalance();$('sales-order-status').textContent='';$('sales-status-message').textContent='';$('sales-balance-status').textContent='';
  }catch(error){$('sales-order-status').textContent=errorText(error);$('sales-status-message').textContent=errorText(error);$('sales-balance-status').textContent=errorText(error);}
  finally{salesOrdersLoading=false;}
}
async function showSalesStatus(){
  if(!currentUser||busy||salesOrderSaving)return;
  appliedSalesStatusFilters={startDate:'',endDate:'',orderType:'',salesStatus:''};
  $('sales-status-start-date').value='';$('sales-status-end-date').value='';
  $('sales-status-type-filter').value='';$('sales-status-filter').value='';
  $('sales-status-message').textContent='';renderSalesStatus();$('sales-status-dialog').showModal();
  await loadSalesOrders();
}
function applySalesStatusSearch(clear=false){
  const startDate=clear?'':$('sales-status-start-date').value,endDate=clear?'':$('sales-status-end-date').value;
  const orderType=clear?'':$('sales-status-type-filter').value,salesStatus=clear?'':$('sales-status-filter').value;
  if((startDate&&!validOrderDueDate(startDate))||(endDate&&!validOrderDueDate(endDate))){
    $('sales-status-message').textContent='올바른 시작일과 종료일을 입력하세요.';return;
  }
  if(startDate&&endDate&&startDate>endDate){$('sales-status-message').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  if(clear){$('sales-status-start-date').value='';$('sales-status-end-date').value='';$('sales-status-type-filter').value='';$('sales-status-filter').value='';}
  appliedSalesStatusFilters={startDate,endDate,orderType,salesStatus};$('sales-status-message').textContent='';renderSalesStatus();
}
async function changeSalesOrderStatus(event){
  const select=event.target,order=salesOrders.find(row=>row.id===select.dataset.orderId);
  if(!order||!currentUser||salesStatusUpdating)return;
  const previousStatus=order.sales_status||'매출미완료',generation=authGeneration;
  salesStatusUpdating=true;renderSalesStatus();renderSalesBalance();$('sales-status-message').textContent='매출 상태를 저장하는 중…';
  try{
    const {data,error}=await client.rpc('set_sales_order_status',{p_order_id:order.id,p_sales_status:select.value});
    if(error)throw error;
    if(generation!==authGeneration)return;
    salesOrders=salesOrders.map(row=>row.id===data.id?data:row);renderSalesOrders();renderSalesStatus();renderSalesBalance();
    $('sales-status-message').textContent='수주 '+order.order_number+'의 매출 상태를 저장했습니다.';
  }catch(error){
    if(generation===authGeneration){salesOrders=salesOrders.map(row=>row.id===order.id?{...row,sales_status:previousStatus}:row);renderSalesStatus();renderSalesBalance();$('sales-status-message').textContent='매출 상태 저장에 실패했습니다. '+errorText(error);}
  }finally{salesStatusUpdating=false;renderSalesStatus();renderSalesBalance();}
}
function updateSalesAmount(){
  const quantity=Number($('sales_quantity').value),price=Number($('sales_unit_price').value);
  $('sales_amount').value=$('sales_quantity').value&&$('sales_unit_price').value&&Number.isSafeInteger(quantity)&&quantity>0&&Number.isFinite(price)&&price>=0
    ? money(quantity*price)+'원':'';
}
async function showSalesOrder(){
  if(!currentUser||busy||salesOrderSaving)return;
  $('sales-order-form').reset();$('sales-order-status').textContent='';updateSalesAmount();renderSalesOrders();
  $('sales-order-dialog').showModal();await loadSalesOrders();
}
async function saveSalesOrder(event){
  event.preventDefault();
  if(!currentUser||busy||salesOrderSaving)return;
  const quantity=Number($('sales_quantity').value),unitPrice=Number($('sales_unit_price').value),dueDate=$('sales_due_date').value;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000000
    ||Math.abs(unitPrice*100-Math.round(unitPrice*100))>0.0001||!validOrderDueDate(dueDate)){
    $('sales-order-status').textContent='수량은 1~1,000,000의 정수, 단가는 0~1,000,000,000원(소수 둘째 자리까지), 납기일자는 올바른 날짜로 입력하세요.';
    return;
  }
  const generation=authGeneration,fields=['sales_order_number','sales_order_type','sales_product_name','sales_specification','sales_unit','sales_delivery_method','sales_address','sales_notes'];
  const details=Object.fromEntries(fields.map(id=>[id,$(id).value.trim()]));
  salesOrderSaving=true;$('sales-order-editor').disabled=true;$('sales-order-status').textContent='수주를 저장하는 중…';
  try{
    const {data,error}=await client.rpc('register_sales_order',{
      p_order_number:details.sales_order_number,p_order_type:details.sales_order_type,p_product_name:details.sales_product_name,
      p_specification:details.sales_specification,p_unit:details.sales_unit,p_quantity:quantity,p_unit_price:unitPrice,
      p_due_date:dueDate,p_delivery_method:details.sales_delivery_method,p_address:details.sales_address,p_notes:details.sales_notes
    });
    if(error)throw error;
    if(generation!==authGeneration)return;
    salesOrders=[data,...salesOrders.filter(order=>order.id!==data.id)];renderSalesOrders();renderSalesStatus();renderSalesBalance();
    $('sales-order-form').reset();updateSalesAmount();
    $('sales-order-status').textContent='수주를 저장했습니다. 일련번호 '+number(data.sequence_id)+' · 수주금액 '+money(data.amount)+'원';
  }catch(error){if(generation===authGeneration)$('sales-order-status').textContent=errorText(error);}
  finally{salesOrderSaving=false;$('sales-order-editor').disabled=false;}
}
async function readAll(table,order = 'id',productId = null) {
  const result = [];
  for (let offset=0;;offset+=500) {
    let query = client.from(table).select('*').order(order).range(offset,offset+499);
    if (productId) query = query.eq('product_id',productId);
    const {data,error} = await query;
    if (error) throw error;
    result.push(...data.map(row=>({...row,...(row.received_date?{received_date:String(row.received_date).slice(0,10)}:{})}))); if (data.length<500) return result;
  }
}
async function readAgedStock() {
  const rows=[],cutoff=sixMonthsAgoDate();
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from('stock_aging').select('*').gt('remaining_quantity',0)
      .lte('received_date',cutoff).order('received_date',{ascending:true}).order('sequence_id',{ascending:true}).range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)return stockAgingRows(rows);
  }
}
async function findMovementProductIds(startDate,endDate,kind) {
  if (!startDate && !endDate && !kind) return null;
  const productIds=new Set();
  for (let offset=0;;offset+=500) {
    let query=client.from('stock_movements').select('product_id').order('id');
    if (startDate) query=query.gte('movement_date',startDate);
    if (endDate) query=query.lte('movement_date',endDate);
    if (kind) query=query.eq('kind',kind);
    const {data,error}=await query.range(offset,offset+499);
    if (error) throw error;
    data.forEach(row=>productIds.add(String(row.product_id)));
    if (data.length<500) return productIds;
  }
}
function updateSupplierOptions() {
  const select=$('supplier-filter'),selected=select.value;
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent='거래처를 선택하세요';select.append(placeholder);
  [...new Set(items.map(item=>String(item.supplier||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
async function applyInventorySearch() {
  if (searching) return;
  const generation=authGeneration;
  const startDate=$('movement-start-date').value,endDate=$('movement-end-date').value,selection=$('movement-kind-filter').value;
  const kind=selection==='supplier'?'':selection,supplier=selection==='supplier' ? $('supplier-filter').value.trim().toLowerCase() : '';
  if (startDate && endDate && startDate>endDate) {
    notify('시작일은 종료일보다 늦을 수 없습니다.',true);
    return;
  }
  if (selection==='supplier' && !supplier) {
    notify('거래처별 검색을 하려면 거래처를 선택하세요.',true);
    return;
  }
  searching=true;$('apply-search').disabled=true;$('clear-search').disabled=true;
  $('movement-start-date').disabled=true;$('movement-end-date').disabled=true;$('movement-kind-filter').disabled=true;$('supplier-filter').disabled=true;
  try {
    const dateProductIds=await findMovementProductIds(startDate,endDate,kind);
    if (generation!==authGeneration) return;
    appliedDateProductIds=dateProductIds;
    appliedSupplier=supplier;
    render();
  } catch (error) {
    notify(errorText(error),true);
  } finally {
    searching=false;$('apply-search').disabled=false;$('clear-search').disabled=false;
    $('movement-start-date').disabled=false;$('movement-end-date').disabled=false;$('movement-kind-filter').disabled=false;$('supplier-filter').disabled=false;
  }
}
function clearInventorySearch() {
  $('movement-start-date').value='';$('movement-end-date').value='';$('movement-kind-filter').value='';$('supplier-filter').value='';
  $('supplier-filter-wrap').hidden=true;
  appliedDateProductIds=null;appliedSupplier='';render();
}
function loadStock() {
  if (loadPromise) { reloadQueued = true; return loadPromise; }
  loadPromise = (async () => {
    do {
      reloadQueued = false;
      if (!currentUser) return;
      const generation = authGeneration;
      const access = await client.rpc('inventory_access_allowed');
      if (access.error) throw access.error;
      if (!access.data) {
        await updateSession(null); client.auth.signOut({scope:'local'}).catch(()=>{});
        throw {message:'ACCOUNT_DISABLED'};
      }
      const [summary,aging] = await Promise.all([
        readAll('stock_summary'),
        readAgedStock()
      ]);
      if (generation!==authGeneration || !currentUser) return;
      items = summary;agedStock=aging;updateSupplierOptions();render();
      if ($('movement-dialog').open && mode==='issue') loadSelectedLots();
    } while (reloadQueued);
  })().finally(()=>{loadPromise=null;});
  return loadPromise;
}
function scheduleSync() {
  clearTimeout(syncTimer); syncTimer = setTimeout(async()=>{
    if (!currentUser || busy) return;
    try { await loadStock(); } catch (error) { notify(errorText(error),true); }
  },250);
}
function scheduleSalesOrderSync() {
  clearTimeout(salesSyncTimer);
  salesSyncTimer=setTimeout(()=>{if(currentUser&&!salesOrderSaving)loadSalesOrders();},250);
}
function subscribeToChanges() {
  client.channel('stock-ledger').on('postgres_changes',{event:'*',schema:'public',table:'stock_products'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_lots'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'sales_orders'},scheduleSalesOrderSync)
    .subscribe(status=>{
      if (!currentUser) return;
      $('sync-status').textContent = status==='SUBSCRIBED' ? '● 실시간 연결됨' : '○ 자동 동기화 · 5초 간격';
      if (status==='SUBSCRIBED') scheduleSync();
    });
}
async function refreshAdminAccess() {
  const generation = authGeneration;
  $('admin-link').hidden = true;
  $('admin-folder').hidden = true;
  if (!currentUser) return;
  try {
    const {data,error} = await client.auth.getSession();
    if (error || !data.session || generation !== authGeneration) return;
    const response = await fetch('/api/admin-users?action=permissions',{
      headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'
    });
    if (!response.ok) return;
    const result = await response.json();
    if (generation === authGeneration && currentUser) {
      $('admin-link').hidden = result.is_admin !== true;
      $('admin-folder').hidden = result.is_admin !== true;
    }
  } catch { /* 권한 조회에 실패하면 관리자 링크를 숨긴 상태로 유지합니다. */ }
}
async function updateSession(session) {
  const next = session?.user || null;
  if (currentUser && next?.id===currentUser.id || !currentUser && !next && authGeneration>0) return;
  authGeneration++; currentUser = next; client.removeAllChannels(); clearTimeout(syncTimer);clearTimeout(salesSyncTimer); lotsGeneration++;
  appliedSalesBalanceFilters={startDate:'',endDate:'',orderType:''};
  $('sales-balance-start-date').value='';$('sales-balance-end-date').value='';$('sales-balance-type-filter').value='';
  appliedDateProductIds=null;appliedSupplier='';$('movement-start-date').value='';$('movement-end-date').value='';$('movement-kind-filter').value='';$('supplier-filter').value='';$('supplier-filter-wrap').hidden=true;
  $('admin-link').hidden = true;
  $('admin-folder').hidden = true;
  $('sidebar-toggle').hidden = !currentUser;
  $('app-layout').classList.toggle('signed-in',!!currentUser);
  items = []; agedStock=[];salesOrders=[];renderSalesOrders();renderSalesStatus();renderSalesBalance();updateSupplierOptions();render();
  $('login-panel').hidden = !!currentUser; $('workspace').hidden = !currentUser;
  $('user-email').textContent = currentUser?.email || '';
  if (!currentUser) {
    $('movement-dialog').close(); $('product-info-dialog').close(); $('sales-order-dialog').close(); $('sales-status-dialog').close(); $('detail-dialog').close(); $('current-stock-dialog').close(); $('stock-risk-dialog').close(); $('long-stock-dialog').close(); $('product-list-dialog').close(); $('movement-list-dialog').close(); $('print-settings-dialog').close(); notify('등록된 계정으로 로그인해 주세요.'); return;
  }
  try { await loadStock(); if (currentUser) {await loadSalesOrders();subscribeToChanges();notify('재고 현황을 불러왔습니다.');await refreshAdminAccess();} }
  catch (error) { notify(errorText(error),true); }
}
function activeProduct() {
  const code = $('product_code').value.trim().toUpperCase();
  return items.find(item=>item.product_code===code);
}
function productForLookup(source,value=$(source).value) {
  const normalizedValue=String(value||'').trim();
  if(!normalizedValue)return null;
  if(source==='product_code'||source==='info_product_code')return items.find(item=>item.product_code===normalizedValue.toUpperCase())||null;
  if(source==='specification'||source==='info_specification'){
    const normalized=normalizedValue.toLocaleLowerCase();
    const matches=items.filter(item=>String(item.specification||'').trim().toLocaleLowerCase()===normalized);
    return matches.length===1?matches[0]:null;
  }
  return null;
}
function populateProductInfo(source) {
  const previous=selectedProductInfoCode,item=productForLookup(source);
  selectedProductInfoCode=item?.product_code||'';
  ['info_product_category','info_product_name','info_specification','info_material','info_color'].forEach(id=>$(id).readOnly=!!item);
  $('info_unit').disabled=!!item;
  if(item)$('info_product_code').value=item.product_code;
  else if(source==='info_specification')$('info_product_code').value='';
  ['product_category','product_code','product_name','specification','material','color','unit','standard_stock_quantity'].forEach(key=>{
    if(item)$('info_'+key).value=item[key]??(key==='unit'?'EA(개)':'');
    else if(previous&&source!=='info_'+key)$('info_'+key).value=key==='unit'?'EA(개)':'';
  });
}
function populateProduct(source='product_code') {
  const item = productForLookup(source);
  const previous = selectedCode; selectedCode = item?.product_code || '';
  if(item)$('product_code').value=item.product_code;
  else if(source==='specification')$('product_code').value='';
  PRODUCT_FIELDS.filter(key=>key!=='product_code').forEach(key=>{
    if(key==='unit'){
      $('unit').disabled=!!item;
      if(item)$('unit').value=item.unit||'EA(개)';
      else if(previous)$('unit').value='EA(개)';
      return;
    }
    const optionalDetail=key==='storage_location'||key==='supplier';
    $(key).readOnly=mode==='issue'||!item||!optionalDetail||!!item[key];
    if(item)$(key).value=item[key]||'';
    else if(previous&&key!==source)$(key).value='';
  });
  if(mode==='issue'){productLots=[];productLotsReady=false;updateAmounts();loadSelectedLots();}
}
async function loadSelectedLots() {
  const item = activeProduct(), generation = ++lotsGeneration;
  productLotsReady=false;
  if (!item) { productLots=[]; updateAmounts(); return; }
  try {
    const lots = await readAll('stock_lots','id',item.id);
    if (generation!==lotsGeneration || !$('movement-dialog').open || mode!=='issue') return;
    productLots = lots; productLotsReady=true; updateAmounts();
  } catch (error) { if (generation===lotsGeneration) $('form-message').textContent=errorText(error); }
}
function updateAmounts() {
  const quantity = Number($('movement_quantity').value), cost = Number($('movement_cost').value);
  if (mode!=='issue') { $('movement_amount').value=money(quantity*cost); return; }
  const unit=$('unit').value||'EA(개)';
  $('fifo-remaining-heading').textContent=`현재 잔량 (${unit})`;
  $('fifo-issue-heading').textContent=`차감수량 (${unit})`;
  const plan = planFifo(productLots,Number.isSafeInteger(quantity) && quantity>0 ? quantity : 0,$('movement_date').value);
  $('movement_cost').value = plan.shortage>0 ? '' : plan.unitCost.toFixed(2); $('movement_amount').value = plan.shortage>0 ? '재고 부족' : money(plan.amount);
  renderFifoPreview(plan.allocations);
  $('form-message').textContent = !activeProduct() ? '출고할 기존 품번을 선택하세요.' : plan.shortage>0 ? `선택한 날짜 기준 재고가 ${number(plan.shortage)} ${unit} 부족합니다.` : '';
}
function validateIssueQuantity(showAlert=false) {
  if(mode!=='issue'||!productLotsReady)return true;
  const quantity=Number($('movement_quantity').value),date=$('movement_date').value;
  if(!Number.isSafeInteger(quantity)||quantity<1||!validDate(date))return true;
  const plan=planFifo(productLots,quantity,date);
  if(plan.shortage<=0)return true;
  if(showAlert){
    const unit=$('unit').value||'EA(개)',available=quantity-plan.shortage;
    window.alert(`출고 수량이 재고수량을 초과했습니다. 선택한 출고일자 기준 출고 가능 수량은 ${number(available)} ${unit}입니다.`);
  }
  return false;
}
function openMovement(kind) {
  if (!currentUser || busy) return;
  if(kind!=='issue'&&!items.length){window.alert('품목정보를 입력해 주세요!');return;}
  mode = kind; const [title,prefix,dateLabel] = MODE_LABELS[mode];
  $('movement-form').reset(); selectedCode=''; productLots=[]; productLotsReady=false; lotsGeneration++; requestId=crypto.randomUUID();
  $('dialog-title').textContent = title;
  $('dialog-description').textContent = mode==='issue' ? '먼저 들어온 입고 건부터 자동 차감합니다.' : '품목정보에 등록된 품번을 선택하세요.';
  $('date-label').textContent=dateLabel; $('quantity-label').textContent=prefix+'수량'; $('cost-label').textContent=prefix+'단가'; $('amount-label').textContent=prefix+'금액';
  $('movement_date').value=todayDate(); $('movement_date').max=todayDate();
  $('movement_cost').readOnly=mode==='issue'; $('movement_cost').required=mode!=='issue'; $('movement_cost').value='0';
  $('fifo-section').hidden=mode!=='issue'; $('form-message').textContent=''; $('movement-editor').disabled=false;
  PRODUCT_FIELDS.forEach(key=>{if(key==='unit')$(key).disabled=false;else $(key).readOnly=key!=='product_code';});
  $('product-codes').replaceChildren();
  $('product-specifications').replaceChildren();
  items.forEach(item=>{
    const option=document.createElement('option');option.value=item.product_code;option.label=item.product_name;$('product-codes').append(option);
    if(item.specification){const specOption=document.createElement('option');specOption.value=item.specification;specOption.label=item.product_code+' · '+item.product_name;$('product-specifications').append(specOption);}
  });
  updateAmounts(); $('movement-dialog').showModal();
}
function renderProductInfoItems() {
  const body=$('product-info-items');body.replaceChildren();
  $('product-info-codes').replaceChildren();$('product-info-specifications').replaceChildren();
  if(!items.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=8;cell.className='empty';cell.textContent='등록된 품목정보가 없습니다.';row.append(cell);body.append(row);return;}
  items.forEach(item=>{
    const row=document.createElement('tr');
    ['product_category','product_code','product_name','specification','material','color','unit'].forEach(key=>row.append(makeCell(item[key]||'')));
    row.append(makeCell(number(item.standard_stock_quantity)+' '+(item.unit||'EA(개)')));
    body.append(row);
    const codeOption=document.createElement('option');codeOption.value=item.product_code;codeOption.label=item.product_name;$('product-info-codes').append(codeOption);
    if(item.specification){const specOption=document.createElement('option');specOption.value=item.specification;specOption.label=item.product_code+' · '+item.product_name;$('product-info-specifications').append(specOption);}
  });
}
function showProductInfo() {
  if(!currentUser||busy)return;
  selectedProductInfoCode='';
  renderProductInfoItems();$('product-info-status').textContent='';
  $('product-info-dialog').showModal();
}
async function saveProductInfo(event) {
  event.preventDefault();
  if(!currentUser||busy)return;
  const fields=['product_category','product_code','product_name','specification','material','color','unit','standard_stock_quantity'];
  const details=Object.fromEntries(fields.map(key=>[key,$('info_'+key).value.trim()]));
  details.product_code=details.product_code.toUpperCase();
  details.standard_stock_quantity=Number(details.standard_stock_quantity);
  if(!Number.isSafeInteger(details.standard_stock_quantity)||details.standard_stock_quantity<1||details.standard_stock_quantity>1000000){
    $('product-info-status').textContent='적정재고 수량은 1~1,000,000 사이의 정수로 입력하세요.';
    return;
  }
  const updatingStandard=!!selectedProductInfoCode&&details.product_code===selectedProductInfoCode;
  const generation=authGeneration;busy=true;$('product-info-editor').disabled=true;
  $('product-info-status').textContent='품목정보를 저장하는 중…';
  try {
    const {data,error}=updatingStandard
      ? await client.rpc('set_stock_product_standard_stock_quantity',{p_product_code:details.product_code,p_standard_stock_quantity:details.standard_stock_quantity})
      : await client.rpc('register_stock_product',{p_details:details});
    if(error)throw error;
    if(generation!==authGeneration)return;
    if(updatingStandard){
      items=items.map(item=>item.id===data.id?{...item,...data}:item);render();renderProductInfoItems();
      $('product-info-status').textContent='적정재고 수량을 수정했습니다. 다른 품목정보는 변경되지 않았습니다.';
    }else{
      items.push(data);selectedProductInfoCode='';
      $('product-info-form').reset();renderProductInfoItems();
      $('product-info-status').textContent='품목정보를 저장했습니다. 이제 기초재고 또는 입고를 등록할 수 있습니다.';
    }
    try {await loadStock();if(generation===authGeneration)renderProductInfoItems();}
    catch(refreshError) {if(generation===authGeneration)$('product-info-status').textContent='품목정보는 저장했지만 목록 갱신에 실패했습니다. '+errorText(refreshError);}
  } catch(error) {
    if(generation===authGeneration)$('product-info-status').textContent=errorText(error);
  } finally {
    busy=false;$('product-info-editor').disabled=false;
  }
}
async function showCurrentStock() {
  if (!currentUser || busy) return;
  const generation=authGeneration;
  renderCurrentStock();$('current-stock-status').textContent='최신 재고를 불러오는 중…';$('current-stock-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('current-stock-status').textContent='';}
  catch(error){if(generation===authGeneration)$('current-stock-status').textContent='최신 조회에 실패했습니다. 표시된 재고는 마지막 조회 결과입니다. '+errorText(error);}
}
function renderProductListHeaders() {
  const head=$('product-list-head');head.replaceChildren();
  const serial=document.createElement('th');serial.scope='col';serial.className='numeric';serial.textContent='일련번호';head.append(serial);
  productListFields().forEach(field=>{const header=document.createElement('th');header.scope='col';header.textContent=field.label;if(field.numeric)header.className='numeric';head.append(header);});
}
function productListFields() { return STOCK_DISPLAY_FIELDS.flatMap(field=>field.key==='material'?[field,{key:'color',label:'색상',numeric:false}]:[field]); }
function renderProductList() {
  const shown=filterInventoryItems(items,{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds});
  const fields=productListFields(),body=$('product-list-items');body.replaceChildren();$('product-list-count').textContent=shown.length.toLocaleString('ko-KR')+'개';
  if(!shown.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=fields.length+1;cell.className='empty';cell.textContent=items.length?'검색 조건에 맞는 품목이 없습니다.':'등록된 품목이 없습니다.';row.append(cell);body.append(row);return;}
  shown.forEach((item,index)=>{const row=document.createElement('tr'),serial=document.createElement('td');serial.className='numeric';serial.textContent=number(index+1);row.append(serial);fields.forEach(field=>{const cell=document.createElement('td');if(field.numeric)cell.className='numeric';cell.textContent=field.numeric?number(item[field.key]):item[field.key]||'';row.append(cell);});body.append(row);});
}
function updateProductListSuppliers() {
  const select=$('product-list-supplier'),selected=select.value;select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='전체 업체';select.append(all);
  [...new Set(items.map(item=>String(item.supplier||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
async function showProductList() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  renderProductListHeaders();
  $('product-list-status').textContent='최신 품목 목록을 불러오는 중…';$('product-list-dialog').showModal();
  try {
    await loadStock();
    if(generation!==authGeneration||!$('product-list-dialog').open)return;
    updateProductListSuppliers();renderProductList();$('product-list-status').textContent='';
  } catch(error) {
    if(generation===authGeneration)$('product-list-status').textContent='최신 품목 목록을 불러오지 못했습니다. 표시된 목록은 마지막 조회 결과입니다. '+errorText(error);
  }
}
function updateMovementListSuppliers() {
  const select=$('movement-list-supplier'),selected=select.value;select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='전체 업체';select.append(all);
  [...new Set(items.map(item=>String(item.supplier||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
function filteredMovementListRows() {
  const startDate=$('movement-list-start-date').value,endDate=$('movement-list-end-date').value;
  const supplier=$('movement-list-supplier').value.trim().toLowerCase(),query=$('movement-list-query').value.trim().toLowerCase();
  const kind=$('movement-list-kind').value;
  const itemsById=new Map(items.map(item=>[item.id,item]));
  return movementListRows.filter(movement=>{
    const date=String(movement.movement_date||'').slice(0,10),item=itemsById.get(movement.product_id);
    if(startDate&&date<startDate||endDate&&date>endDate||kind&&movement.kind!==kind)return false;
    if(supplier&&supplier!==String(item?.supplier||'').trim().toLowerCase())return false;
    if(!query)return true;
    return [movement.sequence_id,date,MODE_LABELS[movement.kind]?.[1],item?.product_code,item?.product_name,item?.specification,item?.color,item?.storage_location,item?.supplier]
      .some(value=>String(value??'').toLowerCase().includes(query));
  });
}
function renderMovementList() {
  const shown=filteredMovementListRows(),itemsById=new Map(items.map(item=>[item.id,item]));
  const body=$('movement-list-items');body.replaceChildren();$('movement-list-count').textContent=shown.length.toLocaleString('ko-KR')+'건';
  if(!shown.length){
    const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=13;cell.className='empty';
    cell.textContent=movementListRows.length?'검색 조건에 맞는 내역이 없습니다.':'기록된 입출고 내역이 없습니다.';row.append(cell);body.append(row);return;
  }
  shown.forEach(movement=>{
    const item=itemsById.get(movement.product_id),row=document.createElement('tr');
    const kindCell=document.createElement('td'),badge=document.createElement('span');badge.className='badge '+movement.kind;badge.textContent=MODE_LABELS[movement.kind]?.[1]||movement.kind;kindCell.append(badge);
    row.append(
      makeCell(movement.sequence_id==null?'':number(movement.sequence_id),true),
      makeCell(String(movement.movement_date||'').slice(0,10)),
      kindCell,
      makeCell(item?.product_code||''),
      makeCell(item?.product_name||''),
      makeCell(item?.specification||''),
      makeCell(item?.color||''),
      makeCell(item?.storage_location||''),
      makeCell(item?.supplier||''),
      makeCell(item?.unit||'EA(개)'),
      makeCell(number(movement.quantity),true),
      makeCell(money(movement.unit_cost),true)
    );
    const amount=makeCell(money(movement.amount),true);
    if(movement.kind==='issue'){
      const button=document.createElement('button');button.className='code-button';button.textContent=money(movement.amount);
      button.setAttribute('aria-label',(item?.product_code||'')+' '+String(movement.movement_date||'').slice(0,10)+' 출고 차감 내역');
      button.addEventListener('click',()=>showAllocations(movement));amount.replaceChildren(button);
    }
    row.append(amount);body.append(row);
  });
}
async function showMovementList() {
  if(!currentUser||busy||movementListLoading)return;
  movementListLoading=true;
  const generation=authGeneration;
  $('movement-list-status').textContent='전체 입출고 내역을 불러오는 중…';$('movement-list-dialog').showModal();
  try {
    await loadStock();
    if(generation!==authGeneration||!$('movement-list-dialog').open)return;
    updateMovementListSuppliers();
    movementListRows=(await readAll('stock_movements','sequence_id')).sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    if(generation!==authGeneration||!$('movement-list-dialog').open)return;
    renderMovementList();$('movement-list-status').textContent=movementListRows.length.toLocaleString('ko-KR')+'건의 전체 내역을 불러왔습니다.';
  } catch(error) {
    if(generation===authGeneration)$('movement-list-status').textContent='최신 입출고 내역을 불러오지 못했습니다. '+errorText(error);
  } finally {movementListLoading=false;}
}
function searchMovementList() {
  if(!currentUser||movementListLoading)return;
  const startDate=$('movement-list-start-date').value,endDate=$('movement-list-end-date').value;
  if(startDate&&endDate&&startDate>endDate){$('movement-list-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  renderMovementList();$('movement-list-status').textContent='검색이 완료되었습니다.';
}
function clearMovementListSearch() {
  if(movementListLoading)return;
  ['movement-list-start-date','movement-list-end-date','movement-list-supplier','movement-list-query','movement-list-kind'].forEach(id=>$(id).value='');
  renderMovementList();$('movement-list-status').textContent='검색 조건을 초기화했습니다.';
}
function startColumnResizing(tableId,columnsId,storageKey,defaults) {
  const columnGroup=$(columnsId),table=$(tableId);
  if(!columnGroup?.children||!table)return;
  const columns=[...columnGroup.children];
  const minimum=52,maximum=600;
  let widths=[...defaults],drag=null;
  try {
    const saved=JSON.parse(window.localStorage.getItem(storageKey)||'null');
    if(Array.isArray(saved)&&saved.length===columns.length&&saved.every(width=>Number.isInteger(width)&&width>=minimum&&width<=maximum))widths=saved;
  } catch {}
  function applyWidth(index,width) {
    widths[index]=Math.max(minimum,Math.min(maximum,Math.round(width)));
    columns[index].style.width=widths[index]+'px';
    const handle=table.querySelector(`.column-resizer[data-column="${index}"]`);
    if(!handle)return;
    handle.setAttribute('aria-valuemin',String(minimum));handle.setAttribute('aria-valuemax',String(maximum));handle.setAttribute('aria-valuenow',String(widths[index]));
  }
  function saveWidths() {
    try {window.localStorage.setItem(storageKey,JSON.stringify(widths));} catch {}
  }
  columns.forEach((_,index)=>applyWidth(index,widths[index]));
  table.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.column-resizer');
    if(!handle||!table.contains(handle))return;
    if(event.button!==0)return;
    const index=Number(handle.dataset.column);
    drag={pointerId:event.pointerId,index,startX:event.clientX,startWidth:widths[index]};
    handle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  table.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    applyWidth(drag.index,drag.startWidth+event.clientX-drag.startX);
  });
  function finish(event) {
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag=null;saveWidths();
  }
  table.addEventListener('pointerup',finish);
  table.addEventListener('pointercancel',finish);
  table.addEventListener('keydown',event=>{
    const handle=event.target.closest('.column-resizer');
    if(!handle||!table.contains(handle))return;
    const index=Number(handle.dataset.column);
    const delta=event.shiftKey?50:10;
    const next={ArrowLeft:widths[index]-delta,ArrowRight:widths[index]+delta,Home:minimum,End:maximum}[event.key];
    if(next===undefined)return;
    event.preventDefault();applyWidth(index,next);saveWidths();
  });
}
async function searchProductList() {
  if(!currentUser||productListSearching)return;
  const startDate=$('product-list-start-date').value,endDate=$('product-list-end-date').value;
  if(startDate&&endDate&&startDate>endDate){$('product-list-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  const supplier=$('product-list-supplier').value.trim().toLowerCase(),query=$('product-list-query').value.trim();
  const generation=authGeneration;productListSearching=true;$('search-product-list').disabled=true;
  $('clear-product-list-search').disabled=true;$('product-list-start-date').disabled=true;$('product-list-end-date').disabled=true;
  $('product-list-supplier').disabled=true;$('product-list-query').disabled=true;
  try {
    productListDateIds=await findMovementProductIds(startDate,endDate,'');
    if(generation!==authGeneration)return;
    productListSupplier=supplier;productListQuery=query;
    renderProductList();$('product-list-status').textContent='검색이 완료되었습니다.';
  } catch(error) {
    if(generation===authGeneration)$('product-list-status').textContent=errorText(error);
  } finally {
    productListSearching=false;$('search-product-list').disabled=false;$('clear-product-list-search').disabled=false;
    $('product-list-start-date').disabled=false;$('product-list-end-date').disabled=false;$('product-list-supplier').disabled=false;$('product-list-query').disabled=false;
  }
}
function clearProductListSearch() {
  if(productListSearching)return;
  $('product-list-start-date').value='';$('product-list-end-date').value='';$('product-list-supplier').value='';$('product-list-query').value='';
  productListDateIds=null;productListSupplier='';productListQuery='';renderProductList();$('product-list-status').textContent='검색 조건을 초기화했습니다.';
}
function openPrintSettings(target) {
  activePrintTarget=target;
  $('print-settings-dialog').showModal();
}
function printInventoryList(target) {
  const targetDialogs={'product-list':'product-list-dialog','current-stock':'current-stock-dialog','stock-risk':'stock-risk-dialog','long-stock':'long-stock-dialog','movement-list':'movement-list-dialog'};
  if(target in targetDialogs&&!$(targetDialogs[target]).open)return;
  activePrintTarget=target;
  applyProductListPrintSettings();
  if($('print-settings-dialog').open)$('print-settings-dialog').close();
  document.body.dataset.printTarget=target;
  window.addEventListener('afterprint',()=>{delete document.body.dataset.printTarget;},{once:true});
  window.print();
}
function setProductListPrintMargin(side,value) {
  const margin=Number(value);
  if(!Number.isFinite(margin))return;
  printMargins[side]=Math.min(40,Math.max(2,Math.round(margin)));
  const input=$('print-margin-'+side),handle=document.querySelector(`.margin-handle[data-margin="${side}"]`);
  input.value=String(printMargins[side]);handle.setAttribute('aria-valuenow',String(printMargins[side]));
  $('printable-area').style.setProperty('--margin-'+side+'-offset',(printMargins[side]/(side==='top'||side==='bottom'?210:297)*100)+'%');
}
function applyProductListPrintSettings() {
  const scale=Number($('product-list-print-scale').value)/100;
  const tables={
    'product-list':'#product-list-dialog .product-list-table table',
    'current-stock':'#current-stock-dialog table',
    'stock-risk':'#stock-risk-dialog table',
    'long-stock':'#long-stock-dialog table',
    'sales-balance':'#sales-balance table',
    'movement-list':'#movement-list-dialog .product-list-table table'
  };
  let style=document.getElementById('product-list-print-page-style');
  if(!style){style=document.createElement('style');style.id='product-list-print-page-style';document.head.append(style);}
  style.textContent=`@page{size:A4 landscape;margin:${printMargins.top}mm ${printMargins.right}mm ${printMargins.bottom}mm ${printMargins.left}mm}@media print{${tables[activePrintTarget]}{zoom:${scale};width:${100/scale}%}}`;
}
function startProductListPrintSettings() {
  const scale=$('product-list-print-scale');
  scale.addEventListener('input',()=>{$('product-list-print-scale-value').value=scale.value+'%';});
  document.querySelectorAll('.margin-handle').forEach(handle=>{
    handle.addEventListener('pointerdown',event=>{
      const side=handle.dataset.margin;
      printMarginDrag={side,x:event.clientX,y:event.clientY,value:printMargins[side]};
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
      setProductListPrintMargin(handle.dataset.margin,printMargins[handle.dataset.margin]+direction*(event.shiftKey?5:1));
    });
  });
  document.addEventListener('pointermove',event=>{
    if(!printMarginDrag)return;
    const paper=$('product-list-print-preview').getBoundingClientRect(),{side,x,y,value}=printMarginDrag;
    const vertical=side==='top'||side==='bottom';
    const delta=vertical?(event.clientY-y)*210/paper.height:(event.clientX-x)*297/paper.width;
    const direction=side==='bottom'||side==='right'?-1:1;
    setProductListPrintMargin(side,value+delta*direction);
  });
  document.addEventListener('pointerup',()=>{printMarginDrag=null;});
  document.addEventListener('pointercancel',()=>{printMarginDrag=null;});
  ['top','right','bottom','left'].forEach(side=>{
    const input=$('print-margin-'+side);
    input.addEventListener('input',()=>setProductListPrintMargin(side,input.value));
    input.addEventListener('change',()=>setProductListPrintMargin(side,input.value||10));
  });
  document.querySelectorAll('[data-print-settings]').forEach(button=>button.addEventListener('click',()=>openPrintSettings(button.dataset.printSettings)));
  $('product-list-print-scale').addEventListener('input',()=>applyProductListPrintSettings());
}
function closeMovement() { if (!busy) {lotsGeneration++; $('movement-dialog').close();} }
async function saveMovement(event) {
  event.preventDefault(); if (busy || !currentUser) return;
  if(mode!=='issue'&&!activeProduct()){
    window.alert('품목정보를 입력해 주세요!');
    $('form-message').textContent='품목정보를 먼저 등록하고 해당 품번을 선택하세요.';
    return;
  }
  const quantity=Number($('movement_quantity').value), unitCost=mode==='issue' ? 0 : Number($('movement_cost').value), date=$('movement_date').value;
  if (!Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000 || !validDate(date) || !Number.isFinite(unitCost) || unitCost<0 || unitCost>1000000000 || Math.abs(unitCost*100-Math.round(unitCost*100))>0.0001) {
    $('form-message').textContent='날짜와 수량, 단가를 확인하세요. 수량은 양의 정수, 단가는 소수 둘째 자리까지 입력합니다.';return;
  }
  if (mode==='issue' && !activeProduct()) {$('form-message').textContent='출고할 기존 품번을 선택하세요.';return;}
  if (mode==='issue' && !validateIssueQuantity(true)) return;
  const details=Object.fromEntries(PRODUCT_FIELDS.map(key=>[key,$(key).value.trim()])); details.product_code=details.product_code.toUpperCase();
  const generation=authGeneration; busy=true; $('movement-editor').disabled=true; $('close-dialog').disabled=true; $('form-message').textContent='저장 중…';
  try {
    const {data,error}=await client.rpc('post_stock_movement',{p_request_id:requestId,p_kind:mode,p_date:date,p_details:details,p_quantity:quantity,p_unit_cost:unitCost});
    if (error) throw error;
    if (generation!==authGeneration) return;
    $('movement-dialog').close(); requestId=null;
    const hasSerial=data?.sequence_id!=null;
    const text=MODE_LABELS[mode][0]+' 저장 완료 · 일련번호 '+(hasSerial?number(data.sequence_id):'확인 필요')+' · '+number(data.quantity)+' '+details.unit+' / '+money(data.amount)+'원';
    try {await loadStock();notify(text,!hasSerial);} catch {notify(text+' · 목록 새로고침은 다시 시도해 주세요.',true);}
  } catch (error) {if (generation===authGeneration) {if(error?.message?.includes('PRODUCT_INFO_REQUIRED'))window.alert('품목정보를 입력해 주세요!');if(error?.message?.includes('INSUFFICIENT_STOCK'))window.alert(errorText(error));$('form-message').textContent=errorText(error);}}
  finally {busy=false;$('movement-editor').disabled=false;$('close-dialog').disabled=false;}
}
async function showLots(item) {
  $('detail-title').textContent=item.product_code+' · 입고 건별 잔량'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const lots=await readAll('stock_lots','id',item.id);
    if (generation!==authGeneration || !$('detail-dialog').open) return;
    const unit=item.unit||'EA(개)';
    renderDetailTable(['기초·입고일자',`입고수량 (${unit})`,`잔량 (${unit})`,'단가','잔여금액'],lots.sort((a,b)=>a.received_date.localeCompare(b.received_date)||Number(a.id)-Number(b.id)).map(lot=>[lot.received_date,number(lot.quantity),number(lot.remaining_quantity),money(lot.unit_cost),money(lot.remaining_quantity*lot.unit_cost)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
}
async function showAllocations(movement) {
  $('detail-title').textContent='선입선출 차감 내역'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const {data,error}=await client.from('stock_allocations').select('quantity,unit_cost,amount,stock_lots(received_date)').eq('issue_id',movement.id).order('id');
    if(error) throw error;
    if(generation!==authGeneration || !$('detail-dialog').open) return;
    const unit=items.find(item=>item.id===movement.product_id)?.unit||'EA(개)';
    renderDetailTable(['기초·입고일자',`차감수량 (${unit})`,'단가','금액'],data.map(row=>[row.stock_lots?.received_date || '',number(row.quantity),money(row.unit_cost),money(row.amount)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
}
async function downloadDataWorkbook(buttonId,sheetName,filePrefix,headers,rows,numericColumns,emptyMessage) {
  if(exporting||!currentUser)return;
  if(!rows.length){notify(emptyMessage);return;}
  if(!window.ExcelJS){notify('Excel 도구를 불러오지 못했습니다. 새로고침해 주세요.',true);return;}
  exporting=true;$(buttonId).disabled=true;const generation=authGeneration;
  try {
    const workbook=createDataWorkbook(window.ExcelJS,{sheetName,headers,rows,numericColumns});
    const buffer=await workbook.xlsx.writeBuffer();
    if(generation!==authGeneration)return;
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=filePrefix+'-'+todayDate()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify(sheetName+' '+rows.length.toLocaleString('ko-KR')+'건을 Excel로 내보냈습니다.');
  }catch(error){notify('Excel 파일을 만들지 못했습니다. '+errorText(error),true);}
  finally{exporting=false;$(buttonId).disabled=false;}
}
function exportCurrentStockExcel(){
  const fields=CURRENT_STOCK_FIELDS,rows=currentStockRows(items);
  return downloadDataWorkbook('export-current-stock','현재재고','현재재고',
    ['일련번호',...fields.map(field=>field.label)],
    rows.map((item,index)=>[index+1,...fields.map(field=>field.numeric?Number(item[field.key]||0):item[field.key]||'')]),
    [0,...fields.flatMap((field,index)=>field.numeric?[index+1]:[])],'내보낼 현재 재고가 없습니다.');
}
function exportProductListExcel(){
  const fields=productListFields(),rows=filterInventoryItems(items,{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds});
  return downloadDataWorkbook('export-product-list','품목 목록','품목 목록',
    ['일련번호',...fields.map(field=>field.label)],
    rows.map((item,index)=>[index+1,...fields.map(field=>field.numeric?Number(item[field.key]||0):item[field.key]||'')]),
    [0,...fields.flatMap((field,index)=>field.numeric?[index+1]:[])],'내보낼 품목이 없습니다.');
}
function exportMovementListExcel(){
  const fields=[
    {key:'sequence_id',label:'일련번호',numeric:true},{key:'movement_date',label:'일자'},
    {key:'kind',label:'구분'},{key:'product_code',label:'품번'},{key:'product_name',label:'품명'},
    {key:'specification',label:'규격'},{key:'color',label:'색상'},{key:'storage_location',label:'저장위치'},
    {key:'supplier',label:'업체'},{key:'unit',label:'단위'},{key:'quantity',label:'수량',numeric:true},
    {key:'unit_cost',label:'단가',numeric:true},{key:'amount',label:'금액',numeric:true}
  ];
  const rows=filteredMovementListRows(),itemsById=new Map(items.map(item=>[item.id,item]));
  return downloadDataWorkbook('export-movement-list','입출고내역','입출고내역',
    fields.map(field=>field.label),rows.map(movement=>{
      const item=itemsById.get(movement.product_id);
      return [movement.sequence_id,String(movement.movement_date||'').slice(0,10),MODE_LABELS[movement.kind]?.[1]||movement.kind,
        item?.product_code||'',item?.product_name||'',item?.specification||'',item?.color||'',item?.storage_location||'',
        item?.supplier||'',item?.unit||'EA(개)',Number(movement.quantity||0),Number(movement.unit_cost||0),Number(movement.amount||0)];
    }),fields.flatMap((field,index)=>field.numeric?[index]:[]),'내보낼 입출고 내역이 없습니다.');
}
function exportSalesStatusExcel(){
  const rows=filterSalesOrders(salesOrders,appliedSalesStatusFilters);
  const headers=['일련번호','수주일자','수주번호','매출 상태','수주형태','품명','규격','단위','수량','단가','수주금액','납기일자','배송방법','주소','기타사항'];
  return downloadDataWorkbook('export-sales-status','수주현황','수주현황',headers,rows.map(order=>[
    Number(order.sequence_id),String(order.order_date||'').slice(0,10),order.order_number,order.sales_status||'매출미완료',
    order.order_type,order.product_name,order.specification,order.unit,Number(order.quantity||0),Number(order.unit_price||0),
    Number(order.amount||0),String(order.due_date||'').slice(0,10),order.delivery_method,order.address,order.notes
  ]),[0,8,9,10],'내보낼 수주 내역이 없습니다.');
}
async function exportExcel() {
  if(exporting || !currentUser) return;
  if(!items.length){notify('내보낼 품목이 없습니다.');return;}
  if(!window.ExcelJS){notify('Excel 도구를 불러오지 못했습니다. 새로고침해 주세요.',true);return;}
  exporting=true;$('export').disabled=true;const generation=authGeneration;
  try {
    const workbook=createInventoryWorkbook(window.ExcelJS,items.map(item=>({...item})));
    const buffer=await workbook.xlsx.writeBuffer();
    if(generation!==authGeneration)return;
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download='재고현황-'+todayDate()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('19개 필드의 재고현황을 Excel로 내보냈습니다.');
  }catch{notify('Excel 파일을 만들지 못했습니다.',true);}finally{exporting=false;$('export').disabled=false;}
}
async function startApp(){
  $('today').textContent=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'});renderHeaders();render();
  if(!window.supabase){notify('로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true);return;}
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:'inventory-note-stock-session',autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session)=>{if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))setTimeout(()=>updateSession(session),0);});
  $('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-button').disabled=true;try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)notify('아이디, 비밀번호와 계정 상태를 확인하세요.',true);}catch{notify('로그인 서버에 연결하지 못했습니다.',true);}finally{$('password').value='';$('login-button').disabled=false;}});
  $('logout').addEventListener('click',async()=>{if(busy)return;const {error}=await client.auth.signOut({scope:'local'});if(error)notify('로그아웃에 실패했습니다.',true);});
  $('product-info-button').addEventListener('click',showProductInfo);
  $('sales-order-button').addEventListener('click',showSalesOrder);
  $('sales-status-button').addEventListener('click',showSalesStatus);
  $('close-sales-order').addEventListener('click',()=>$('sales-order-dialog').close());
  $('cancel-sales-order').addEventListener('click',()=>$('sales-order-dialog').close());
  $('sales-order-form').addEventListener('submit',saveSalesOrder);
  $('close-sales-status').addEventListener('click',()=>$('sales-status-dialog').close());
  $('apply-sales-status-search').addEventListener('click',()=>applySalesStatusSearch());
  $('clear-sales-status-search').addEventListener('click',()=>applySalesStatusSearch(true));
  $('sales-status-items').addEventListener('change',changeSalesOrderStatus);
  $('export-sales-status').addEventListener('click',exportSalesStatusExcel);
  $('apply-sales-balance-search').addEventListener('click',()=>applySalesBalanceSearch());
  $('clear-sales-balance-search').addEventListener('click',()=>applySalesBalanceSearch(true));
  ['sales_quantity','sales_unit_price'].forEach(id=>$(id).addEventListener('input',updateSalesAmount));
  $('close-product-info').addEventListener('click',()=>$('product-info-dialog').close());
  $('cancel-product-info').addEventListener('click',()=>$('product-info-dialog').close());
  $('product-info-form').addEventListener('submit',saveProductInfo);
  $('info_product_code').addEventListener('input',()=>populateProductInfo('info_product_code'));
  $('info_specification').addEventListener('input',()=>populateProductInfo('info_specification'));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>openMovement(button.dataset.mode)));
  $('close-dialog').addEventListener('click',closeMovement);$('cancel-dialog').addEventListener('click',closeMovement);$('movement-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('movement-form').addEventListener('submit',saveMovement);
  $('movement-form').addEventListener('input',()=>{requestId=crypto.randomUUID();if(mode!=='issue')$('form-message').textContent='';});
  $('product_code').addEventListener('input',()=>populateProduct('product_code'));
  $('specification').addEventListener('input',()=>populateProduct('specification'));
  ['movement_quantity','movement_cost','movement_date'].forEach(id=>$(id).addEventListener('input',updateAmounts));
  ['movement_quantity','movement_date'].forEach(id=>$(id).addEventListener('change',()=>validateIssueQuantity(true)));
  $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('current-stock-button').addEventListener('click',showCurrentStock);
  $('export-current-stock').addEventListener('click',exportCurrentStockExcel);
  $('close-current-stock').addEventListener('click',()=>$('current-stock-dialog').close());
  $('stock-risk-button').addEventListener('click',showStockRisk);
  $('close-stock-risk').addEventListener('click',()=>$('stock-risk-dialog').close());
  $('long-stock-button').addEventListener('click',showLongStock);
  $('close-long-stock').addEventListener('click',()=>$('long-stock-dialog').close());
  $('product-list-button').addEventListener('click',showProductList);
  $('export-product-list').addEventListener('click',exportProductListExcel);
  $('close-product-list').addEventListener('click',()=>$('product-list-dialog').close());
  $('search-product-list').addEventListener('click',searchProductList);
  $('clear-product-list-search').addEventListener('click',clearProductListSearch);
  $('movement-list-button').addEventListener('click',showMovementList);
  $('export-movement-list').addEventListener('click',exportMovementListExcel);
  $('close-movement-list').addEventListener('click',()=>$('movement-list-dialog').close());
  $('search-movement-list').addEventListener('click',searchMovementList);
  $('clear-movement-list-search').addEventListener('click',clearMovementListSearch);
  startColumnResizing('current-stock-table','current-stock-columns','inventory-current-stock-column-widths',columnWidthDefaults['current-stock']);
  startColumnResizing('movement-list-table','movement-list-columns','inventory-movement-list-column-widths',columnWidthDefaults['movement-list']);
  document.querySelectorAll('[data-print]').forEach(button=>button.addEventListener('click',()=>printInventoryList(button.dataset.print)));
  $('close-print-settings').addEventListener('click',()=>$('print-settings-dialog').close());
  startProductListPrintSettings();
  $('search').addEventListener('input',render);$('filter').addEventListener('change',render);$('export').addEventListener('click',exportExcel);
  $('movement-kind-filter').addEventListener('change',()=>{$('supplier-filter-wrap').hidden=$('movement-kind-filter').value!=='supplier';});
  $('apply-search').addEventListener('click',applyInventorySearch);$('clear-search').addEventListener('click',clearInventorySearch);
  const timer=setInterval(scheduleSync,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync();});window.addEventListener('online',scheduleSync);
  window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(timer);clearTimeout(syncTimer);clearTimeout(salesSyncTimer);client.removeAllChannels();}});
}
