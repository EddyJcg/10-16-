'use strict';
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('ko-KR');
let items = [], editing = null, editingVersion = null, client, busy = false;
let loadPromise = null, reloadQueued = false, syncTimer = null;
let currentUser = null, authGeneration = 0;
const categories = ['사무용품','전자기기','생활용품','식품','기타'];
function notify(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function todayDate() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = type => parts.find(entry => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function validItem(item) {
  return item.name && item.name.length <= 80 && categories.includes(item.category) && validDate(item.received_date) &&
    ['quantity','minimum','price'].every(key => Number.isSafeInteger(item[key]) && item[key] >= 0 && item[key] <= (key === 'price' ? 1000000000 : 1000000));
}
function resetForm() {
  editing = null; editingVersion = null; $('item-form').reset(); $('form-title').textContent = '새 품목 등록';
  $('received_date').value = todayDate();
  $('save-button').textContent = '＋ 품목 등록'; $('cancel-edit').classList.add('hidden');
}
function explain(error) {
  if (['PGRST204','42703'].includes(error.code) && /received_date/.test(error.message || '')) return '입고일자 DB 설정이 필요합니다. Supabase SQL Editor에서 supabase/received-date.sql을 실행해 주세요.';
  if (['PGRST205','42P01','42703','PGRST204','PGRST202','42501'].includes(error.code)) return '로그인 권한 설정이 필요합니다. Supabase SQL Editor에서 최신 supabase/schema.sql을 실행해 주세요.';
  if (error.code === 'ACCOUNT_DISABLED') return '사용이 중지되었거나 만료된 계정입니다. 관리자에게 문의하세요.';
  if (error.code === 'CONFLICT') return '다른 사용자가 이 품목을 변경하거나 삭제했습니다. 입력 내용은 유지했습니다. 최신 목록을 확인하고 수정 취소 후 다시 수정해 주세요.';
  if (error.code === '23514') return '수량 범위를 벗어났습니다. 최신 재고를 새로고침해 주세요.';
  return '요청을 완료하지 못했습니다. 네트워크 또는 Supabase 설정을 확인해 주세요.';
}
function loadItems() {
  if (loadPromise) { reloadQueued = true; return loadPromise; }
  loadPromise = (async () => {
    do { reloadQueued = false; await fetchItems(); } while (reloadQueued);
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}
async function fetchItems() {
  if (!currentUser) return;
  const generation = authGeneration;
  const access = await client.rpc('inventory_access_allowed');
  if (access.error) throw access.error;
  if (!access.data) {
    await updateSession(null);
    client.auth.signOut({scope:'local'}).catch(() => {});
    throw {code:'ACCOUNT_DISABLED'};
  }
  // Supabase의 기본 행 제한에 잘리지 않도록 페이지별로 조회합니다.
  const result = [];
  for (let offset = 0;; offset += 500) {
    const {data,error} = await client.from('inventory_items').select('*').order('created_at').order('id').range(offset,offset + 499);
    if (error) throw error;
    result.push(...data); if (data.length < 500) break;
  }
  if (generation !== authGeneration || !currentUser) return;
  items = result; render();
}
async function operation(action, message, clearForm = false) {
  if (busy || !client || !currentUser) return;
  busy = true; $('inventory-panel').disabled = true;
  try {
    const {error} = await action(); if (error) throw error;
    if (clearForm) resetForm();
    try { await loadItems(); notify(message); }
    catch (error) { notify('변경은 저장되었지만 목록을 다시 읽지 못했습니다. 새로고침해 주세요.',true); }
  } catch (error) {
    if (error.code === 'CONFLICT') { try { await loadItems(); } catch {} }
    notify(explain(error),true);
  }
  finally { busy = false; $('inventory-panel').disabled = !currentUser; }
}
function changeQuantity(id,delta) {
  return operation(() => client.rpc('adjust_inventory_quantity',{item_id:id,delta}),delta > 0 ? '1개를 입고했습니다.' : '1개를 출고했습니다.');
}
function removeItem(id) {
  const item = items.find(entry => entry.id === id); if (!item) return;
  return operation(() => client.from('inventory_items').delete().eq('id',id).eq('version',item.version).select().then(result => {
    if (!result.error && !result.data.length) return {error:{code:'CONFLICT'}};
    if (!result.error && editing === id) resetForm();
    return result;
  }),'품목을 삭제했습니다.');
}
function editItem(id) {
  const item = items.find(entry => entry.id === id); if (!item) return;
  editing = id; editingVersion = item.version; ['name','category','quantity','minimum','price','received_date'].forEach(key => $(key).value = item[key] ?? '');
  $('form-title').textContent = '품목 수정'; $('save-button').textContent = '변경 사항 저장'; $('cancel-edit').classList.remove('hidden'); $('name').focus();
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (busy || !currentUser) return;
    try { await loadItems(); } catch (error) { notify(explain(error),true); }
  },200);
}
function subscribeToChanges() {
  return client.channel('public-inventory')
    .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items'},scheduleSync)
    .subscribe(status => {
      $('sync-status').textContent = status === 'SUBSCRIBED' ? '● 실시간 연결됨' : '○ 자동 동기화 · 5초 간격';
      if (status === 'SUBSCRIBED') scheduleSync();
    });
}
async function updateSession(session) {
  const nextUser = session?.user || null;
  if (currentUser && nextUser?.id === currentUser.id) return;
  if (!currentUser && !nextUser && authGeneration > 0) return;
  authGeneration++; currentUser = nextUser;
  clearTimeout(syncTimer); client.removeAllChannels();
  items = []; resetForm(); render();
  $('login-panel').classList.toggle('hidden',!!currentUser);
  $('session-panel').classList.toggle('hidden',!currentUser);
  $('inventory-panel').classList.toggle('hidden',!currentUser);
  $('inventory-panel').disabled = busy || !currentUser;
  $('refresh').disabled = !currentUser;
  $('user-email').textContent = currentUser?.email || '';
  $('sync-status').textContent = currentUser ? '○ 연결 중' : '로그인 대기';
  if (!currentUser) { notify('등록된 계정으로 로그인해 주세요.'); return; }
  try { await loadItems(); if (currentUser) { subscribeToChanges(); notify('공유 재고를 불러왔습니다.'); } }
  catch (error) { notify(explain(error),true); }
}
async function saveItem(item,id,version) {
  const query = id ? client.from('inventory_items').update(item).eq('id',id).eq('version',version) : client.from('inventory_items').insert(item);
  const result = await query.select();
  return !result.error && !result.data.length ? {error:{code:'CONFLICT'}} : result;
}
async function startApp() {
  $('today').textContent = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  render();
  if (!window.supabase) { notify('Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.',true); return; }
  client = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session) => {
    if (['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event)) setTimeout(() => updateSession(session),0);
  });
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); $('login-button').disabled = true;
    try {
      const {error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if (error) notify('로그인하지 못했습니다. 아이디, 비밀번호와 계정 상태를 확인하세요.',true);
    } catch { notify('로그인 서버에 연결하지 못했습니다.',true); }
    finally { $('password').value = ''; $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click',async () => {
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) notify('로그아웃하지 못했습니다. 다시 시도해 주세요.',true);
  });
  $('refresh').addEventListener('click',async () => {
    if (busy || !currentUser) return;
    try { await loadItems(); notify('최신 재고를 불러왔습니다.'); } catch (error) { notify(explain(error),true); }
  });
  $('item-form').addEventListener('submit',event => {
    event.preventDefault();
    const item = {name:$('name').value.trim(),category:$('category').value,quantity:Number($('quantity').value),minimum:Number($('minimum').value),price:Number($('price').value),received_date:$('received_date').value};
    if (!validItem(item)) { notify('품목명, 입고일자, 수량과 단가를 확인해 주세요.',true); return; }
    const id = editing, version = editingVersion;
    operation(() => saveItem(item,id,version),id ? '품목을 수정했습니다.' : '품목을 등록했습니다.',true);
  });
  $('cancel-edit').addEventListener('click',resetForm);
  $('search').addEventListener('input',render); $('filter').addEventListener('change',render);
  $('export').addEventListener('click',() => {
    if (!items.length) { notify('내보낼 재고가 없습니다.'); return; }
    const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""') + '"';
    const rows = [['품목명','분류','입고일자','현재 수량','최소 수량','단가(원)'],...items.map(item => [item.name,item.category,item.received_date || '',item.quantity,item.minimum,item.price])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = '공유재고.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  // 연결이 끊기거나 Realtime이 지연되어도 다른 사용자의 변경을 반영합니다.
  const pollTimer = setInterval(scheduleSync,5000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) scheduleSync(); });
  window.addEventListener('online',scheduleSync);
  window.addEventListener('pagehide',event => {
    if (event.persisted) return;
    clearInterval(pollTimer); clearTimeout(syncTimer); client.removeAllChannels();
  });
}
