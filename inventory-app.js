'use strict';
const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('ko-KR',{maximumFractionDigits:2});
const money = number;
const MODE_LABELS = {opening:['기초재고','기초','기초일자'],receipt:['입고관리','입고','입고일자'],issue:['출고관리','출고','출고일자']};
let client,currentUser = null,items = [],movements = [],totalMovements = 0,authGeneration = 0;
let loadPromise = null,reloadQueued = false,syncTimer = null,busy = false,exporting = false;
let appliedDateProductIds = null,appliedSupplier = '',searching = false;
let mode = 'opening',requestId = null,selectedCode = '',productLots = [],lotsGeneration = 0;
function notify(text,error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function errorText(error) {
  const message = error?.message || '';
  const errors = {
    ACCOUNT_DISABLED:'사용이 중지되었거나 만료된 계정입니다. 관리자에게 문의하세요.',
    INSUFFICIENT_STOCK:'출고일자 기준으로 재고가 부족합니다. 최신 잔량과 출고수량을 확인하세요.',
    BACKDATE_CONFLICT:'이미 확정된 거래보다 앞선 날짜입니다. 과거 출고 원가를 바꾸지 않도록 거래를 날짜 순서대로 입력하세요.',
    OPENING_ALREADY_STARTED:'이 품목은 이미 거래가 시작되었습니다. 기초재고는 처음 한 번만 등록할 수 있습니다.',
    PRODUCT_DETAILS_CONFLICT:'같은 품번의 품목 정보가 다릅니다. 기존 품목을 선택하거나 다른 품번을 사용하세요.',
    PRODUCT_NOT_FOUND:'출고할 품번을 목록에서 선택하세요.',
    REQUEST_CONFLICT:'같은 요청번호에 다른 내용이 들어 있습니다. 창을 다시 열어 확인하세요.',
    INVALID_INPUT:'날짜, 수량과 단가를 확인하세요. 미래 일자와 소수 수량은 사용할 수 없습니다.',
    INVALID_PRODUCT_DETAILS:'품목분류·품명 등 품목 정보를 확인하세요.',
    INVALID_PRODUCT_CODE:'품번을 입력하세요.'
  };
  for (const [key,text] of Object.entries(errors)) if (message.includes(key)) return text;
  if (['PGRST205','PGRST202','42P01','42703','42501'].includes(error?.code)) return '재고 DB 설정이 필요합니다. Supabase SQL Editor에서 supabase/fifo.sql을 실행하세요. 로그인·권한 설정은 기존 schema.sql을 사용합니다.';
  return '요청을 완료하지 못했습니다. 네트워크와 로그인 상태를 확인하세요. 저장 응답이 끊겼다면 내역을 확인하거나 같은 내용으로 다시 저장하세요.';
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
async function findMovementProductIds(date,month) {
  if (!date && !month) return null;
  let start,end;
  if (month) {
    start=month+'-01';
    const [year,monthNumber]=month.split('-').map(Number);
    end=new Date(Date.UTC(year,monthNumber,1)).toISOString().slice(0,10);
  }
  const productIds=new Set();
  for (let offset=0;;offset+=500) {
    let query=client.from('stock_movements').select('product_id').order('id');
    if (date) query=query.eq('movement_date',date);
    if (month) query=query.gte('movement_date',start).lt('movement_date',end);
    const {data,error}=await query.range(offset,offset+499);
    if (error) throw error;
    data.forEach(row=>productIds.add(String(row.product_id)));
    if (data.length<500) return productIds;
  }
}
async function applyInventorySearch() {
  if (searching) return;
  const generation=authGeneration;
  const date=$('movement-date-filter').value,month=$('movement-month-filter').value,supplier=$('supplier-filter').value.trim().toLowerCase();
  searching=true;$('apply-search').disabled=true;$('clear-search').disabled=true;
  $('movement-date-filter').disabled=true;$('movement-month-filter').disabled=true;$('supplier-filter').disabled=true;
  try {
    const dateProductIds=await findMovementProductIds(date,month);
    if (generation!==authGeneration) return;
    appliedDateProductIds=dateProductIds;
    appliedSupplier=supplier;
    render();
  } catch (error) {
    notify(errorText(error),true);
  } finally {
    searching=false;$('apply-search').disabled=false;$('clear-search').disabled=false;
    $('movement-date-filter').disabled=false;$('movement-month-filter').disabled=false;$('supplier-filter').disabled=false;
  }
}
function clearInventorySearch() {
  $('movement-date-filter').value='';$('movement-month-filter').value='';$('supplier-filter').value='';
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
      const [summary,history] = await Promise.all([
        readAll('stock_summary'),
        client.from('stock_movements').select('*',{count:'exact'}).order('sequence_id',{ascending:false}).limit(100)
      ]);
      if (history.error) throw history.error;
      if (generation!==authGeneration || !currentUser) return;
      items = summary; movements = history.data.map(row=>({...row,movement_date:String(row.movement_date).slice(0,10)})); totalMovements = history.count || 0; render();
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
function subscribeToChanges() {
  client.channel('stock-ledger').on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_lots'},scheduleSync)
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
  authGeneration++; currentUser = next; client.removeAllChannels(); clearTimeout(syncTimer); lotsGeneration++;
  appliedDateProductIds=null;appliedSupplier='';$('movement-date-filter').value='';$('movement-month-filter').value='';$('supplier-filter').value='';
  $('admin-link').hidden = true;
  $('admin-folder').hidden = true;
  $('sidebar-toggle').hidden = !currentUser;
  $('app-layout').classList.toggle('signed-in',!!currentUser);
  items = []; movements = []; totalMovements = 0; render();
  $('login-panel').hidden = !!currentUser; $('workspace').hidden = !currentUser;
  $('user-email').textContent = currentUser?.email || '';
  if (!currentUser) {
    $('movement-dialog').close(); $('detail-dialog').close(); $('current-stock-dialog').close(); notify('등록된 계정으로 로그인해 주세요.'); return;
  }
  try { await loadStock(); if (currentUser) {subscribeToChanges();notify('재고 현황을 불러왔습니다.');await refreshAdminAccess();} }
  catch (error) { notify(errorText(error),true); }
}
function activeProduct() {
  const code = $('product_code').value.trim().toUpperCase();
  return items.find(item=>item.product_code===code);
}
function populateProduct() {
  const item = activeProduct();
  const previous = selectedCode; selectedCode = item?.product_code || '';
  PRODUCT_FIELDS.filter(key=>key!=='product_code').forEach(key=>{
    $(key).readOnly = !!item || mode==='issue';
    if (item) $(key).value = item[key] || '';
    else if (previous) $(key).value = '';
  });
  if (mode==='issue') { productLots=[]; updateAmounts(); loadSelectedLots(); }
}
async function loadSelectedLots() {
  const item = activeProduct(), generation = ++lotsGeneration;
  if (!item) { productLots=[]; updateAmounts(); return; }
  try {
    const lots = await readAll('stock_lots','id',item.id);
    if (generation!==lotsGeneration || !$('movement-dialog').open || mode!=='issue') return;
    productLots = lots; updateAmounts();
  } catch (error) { if (generation===lotsGeneration) $('form-message').textContent=errorText(error); }
}
function updateAmounts() {
  const quantity = Number($('movement_quantity').value), cost = Number($('movement_cost').value);
  if (mode!=='issue') { $('movement_amount').value=money(quantity*cost); return; }
  const plan = planFifo(productLots,Number.isSafeInteger(quantity) && quantity>0 ? quantity : 0,$('movement_date').value);
  $('movement_cost').value = plan.shortage>0 ? '' : plan.unitCost.toFixed(2); $('movement_amount').value = plan.shortage>0 ? '재고 부족' : money(plan.amount);
  renderFifoPreview(plan.allocations);
  $('form-message').textContent = !activeProduct() ? '출고할 기존 품번을 선택하세요.' : plan.shortage>0 ? `선택한 날짜 기준 재고가 ${number(plan.shortage)}개 부족합니다.` : '';
}
function openMovement(kind) {
  if (!currentUser || busy) return;
  mode = kind; const [title,prefix,dateLabel] = MODE_LABELS[mode];
  $('movement-form').reset(); selectedCode=''; productLots=[]; lotsGeneration++; requestId=crypto.randomUUID();
  $('dialog-title').textContent = title;
  $('dialog-description').textContent = mode==='issue' ? '먼저 들어온 입고 건부터 자동 차감합니다.' : '기존 품번을 선택하거나 새 품목을 입력하세요.';
  $('date-label').textContent=dateLabel; $('quantity-label').textContent=prefix+'수량'; $('cost-label').textContent=prefix+'단가'; $('amount-label').textContent=prefix+'금액';
  $('movement_date').value=todayDate(); $('movement_date').max=todayDate();
  $('movement_cost').readOnly=mode==='issue'; $('movement_cost').required=mode!=='issue'; $('movement_cost').value='0';
  $('fifo-section').hidden=mode!=='issue'; $('form-message').textContent=''; $('movement-editor').disabled=false;
  PRODUCT_FIELDS.forEach(key=>{$(key).readOnly=mode==='issue' && key!=='product_code';});
  $('product-codes').replaceChildren();
  items.forEach(item=>{const option=document.createElement('option');option.value=item.product_code;option.label=item.product_name;$('product-codes').append(option);});
  updateAmounts(); $('movement-dialog').showModal();
}
async function showCurrentStock() {
  if (!currentUser || busy) return;
  const generation=authGeneration;
  renderCurrentStock();$('current-stock-status').textContent='최신 재고를 불러오는 중…';$('current-stock-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('current-stock-status').textContent='';}
  catch(error){if(generation===authGeneration)$('current-stock-status').textContent='최신 조회에 실패했습니다. 표시된 재고는 마지막 조회 결과입니다. '+errorText(error);}
}
function closeMovement() { if (!busy) {lotsGeneration++; $('movement-dialog').close();} }
async function saveMovement(event) {
  event.preventDefault(); if (busy || !currentUser) return;
  const quantity=Number($('movement_quantity').value), unitCost=mode==='issue' ? 0 : Number($('movement_cost').value), date=$('movement_date').value;
  if (!Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000 || !validDate(date) || !Number.isFinite(unitCost) || unitCost<0 || unitCost>1000000000 || Math.abs(unitCost*100-Math.round(unitCost*100))>0.0001) {
    $('form-message').textContent='날짜와 수량, 단가를 확인하세요. 수량은 양의 정수, 단가는 소수 둘째 자리까지 입력합니다.';return;
  }
  if (mode==='issue' && !activeProduct()) {$('form-message').textContent='출고할 기존 품번을 선택하세요.';return;}
  const details=Object.fromEntries(PRODUCT_FIELDS.map(key=>[key,$(key).value.trim()])); details.product_code=details.product_code.toUpperCase();
  const generation=authGeneration; busy=true; $('movement-editor').disabled=true; $('close-dialog').disabled=true; $('form-message').textContent='저장 중…';
  try {
    const {data,error}=await client.rpc('post_stock_movement',{p_request_id:requestId,p_kind:mode,p_date:date,p_details:details,p_quantity:quantity,p_unit_cost:unitCost});
    if (error) throw error;
    if (generation!==authGeneration) return;
    $('movement-dialog').close(); requestId=null;
    const text=MODE_LABELS[mode][0]+' 저장 완료 · '+number(data.quantity)+'개 / '+money(data.amount)+'원';
    try {await loadStock();notify(text);} catch {notify(text+' · 목록 새로고침은 다시 시도해 주세요.',true);}
  } catch (error) {if (generation===authGeneration) $('form-message').textContent=errorText(error);}
  finally {busy=false;$('movement-editor').disabled=false;$('close-dialog').disabled=false;}
}
async function showLots(item) {
  $('detail-title').textContent=item.product_code+' · 입고 건별 잔량'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const lots=await readAll('stock_lots','id',item.id);
    if (generation!==authGeneration || !$('detail-dialog').open) return;
    renderDetailTable(['기초·입고일자','입고수량','잔량','단가','잔여금액'],lots.sort((a,b)=>a.received_date.localeCompare(b.received_date)||Number(a.id)-Number(b.id)).map(lot=>[lot.received_date,number(lot.quantity),number(lot.remaining_quantity),money(lot.unit_cost),money(lot.remaining_quantity*lot.unit_cost)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
}
async function showAllocations(movement) {
  $('detail-title').textContent='선입선출 차감 내역'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const {data,error}=await client.from('stock_allocations').select('quantity,unit_cost,amount,stock_lots(received_date)').eq('issue_id',movement.id).order('id');
    if(error) throw error;
    if(generation!==authGeneration || !$('detail-dialog').open) return;
    renderDetailTable(['기초·입고일자','차감수량','단가','금액'],data.map(row=>[row.stock_lots?.received_date || '',number(row.quantity),money(row.unit_cost),money(row.amount)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
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
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>openMovement(button.dataset.mode)));
  $('close-dialog').addEventListener('click',closeMovement);$('cancel-dialog').addEventListener('click',closeMovement);$('movement-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('movement-form').addEventListener('submit',saveMovement);
  $('movement-form').addEventListener('input',()=>{requestId=crypto.randomUUID();if(mode!=='issue')$('form-message').textContent='';});
  $('product_code').addEventListener('input',populateProduct);
  ['movement_quantity','movement_cost','movement_date'].forEach(id=>$(id).addEventListener('input',updateAmounts));
  $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('current-stock-button').addEventListener('click',showCurrentStock);
  $('close-current-stock').addEventListener('click',()=>$('current-stock-dialog').close());
  $('search').addEventListener('input',render);$('filter').addEventListener('change',render);$('export').addEventListener('click',exportExcel);
  $('apply-search').addEventListener('click',applyInventorySearch);$('clear-search').addEventListener('click',clearInventorySearch);
  const timer=setInterval(scheduleSync,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync();});window.addEventListener('online',scheduleSync);
  window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(timer);clearTimeout(syncTimer);client.removeAllChannels();}});
}
