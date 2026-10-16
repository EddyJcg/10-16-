'use strict';
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('ko-KR');
let items = [], editing = null, client, busy = false, currentUser = null;
const categories = ['사무용품','전자기기','생활용품','식품','기타'];
function notify(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function validItem(item) {
  return item.name && item.name.length <= 80 && categories.includes(item.category) &&
    ['quantity','minimum','price'].every(key => Number.isSafeInteger(item[key]) && item[key] >= 0 && item[key] <= (key === 'price' ? 1000000000 : 1000000));
}
function resetForm() {
  editing = null; $('item-form').reset(); $('form-title').textContent = '새 품목 등록';
  $('save-button').textContent = '＋ 품목 등록'; $('cancel-edit').classList.add('hidden');
}
function explain(error) {
  if (['PGRST205','42P01','PGRST202'].includes(error.code)) return '데이터베이스 설정이 필요합니다. Supabase SQL Editor에서 supabase/schema.sql을 실행해 주세요.';
  if (error.code === '23514') return '수량 범위를 벗어났습니다. 최신 재고를 새로고침해 주세요.';
  return '요청을 완료하지 못했습니다. 로그인 상태, 네트워크 또는 데이터 접근 권한을 확인해 주세요.';
}
async function loadItems() {
  // Supabase의 기본 행 제한에 잘리지 않도록 페이지별로 조회합니다.
  const result = [];
  for (let offset = 0;; offset += 500) {
    const {data,error} = await client.from('inventory_items').select('*').order('created_at').order('id').range(offset,offset + 499);
    if (error) throw error;
    result.push(...data); if (data.length < 500) break;
  }
  if (!currentUser) return;
  items = result; render();
}
async function operation(action, message) {
  if (busy || !currentUser) return;
  busy = true; $('inventory-panel').disabled = true;
  try {
    const {error} = await action(); if (error) throw error;
    resetForm();
    try { await loadItems(); notify(message); }
    catch (error) { notify('변경은 저장되었지만 목록을 다시 읽지 못했습니다. 새로고침해 주세요.',true); }
  } catch (error) { notify(explain(error),true); }
  finally { busy = false; $('inventory-panel').disabled = !currentUser; }
}
function changeQuantity(id,delta) {
  return operation(() => client.rpc('adjust_inventory_quantity',{item_id:id,delta}),delta > 0 ? '1개를 입고했습니다.' : '1개를 출고했습니다.');
}
function removeItem(id) {
  return operation(() => client.from('inventory_items').delete().eq('id',id).select().then(result => {
    if (!result.error && !result.data.length) return {error:{code:'MISSING'}};
    return result;
  }),'품목을 삭제했습니다.');
}
function editItem(id) {
  const item = items.find(entry => entry.id === id); if (!item) return;
  editing = id; ['name','category','quantity','minimum','price'].forEach(key => $(key).value = item[key]);
  $('form-title').textContent = '품목 수정'; $('save-button').textContent = '변경 사항 저장'; $('cancel-edit').classList.remove('hidden'); $('name').focus();
}
async function updateSession(session) {
  currentUser = session?.user || null;
  $('login-panel').classList.toggle('hidden',!!currentUser);
  $('session-panel').classList.toggle('hidden',!currentUser);
  $('inventory-panel').classList.toggle('hidden',!currentUser);
  $('inventory-panel').disabled = busy || !currentUser;
  $('user-email').textContent = currentUser?.email || '';
  items = []; resetForm(); render();
  if (currentUser) {
    try { await loadItems(); notify('공유 재고를 불러왔습니다.'); }
    catch (error) { notify(explain(error),true); }
  } else notify('로그인하면 공유 재고를 확인할 수 있습니다.');
}
async function startApp() {
  $('today').textContent = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  render();
  if (!window.supabase) { notify('Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.',true); return; }
  client = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session) => {
    if (['SIGNED_IN','SIGNED_OUT','INITIAL_SESSION'].includes(event)) setTimeout(() => updateSession(session),0);
  });
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); $('login-button').disabled = true;
    try {
      const {error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      $('password').value = '';
      if (error) notify('로그인하지 못했습니다. 이메일, 비밀번호와 계정 활성화 상태를 확인해 주세요.',true);
    } catch { notify('로그인 서버에 연결하지 못했습니다.',true); }
    finally { $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click',async () => {
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) notify('로그아웃하지 못했습니다. 다시 시도해 주세요.',true);
  });
  $('refresh').addEventListener('click',async () => {
    if (busy) return;
    try { await loadItems(); notify('최신 재고를 불러왔습니다.'); } catch (error) { notify(explain(error),true); }
  });
  $('item-form').addEventListener('submit',event => {
    event.preventDefault();
    const item = {name:$('name').value.trim(),category:$('category').value,quantity:Number($('quantity').value),minimum:Number($('minimum').value),price:Number($('price').value)};
    if (!validItem(item)) { notify('품목명, 수량과 단가를 확인해 주세요.',true); return; }
    const id = editing;
    operation(async () => {
      const query = id ? client.from('inventory_items').update(item).eq('id',id) : client.from('inventory_items').insert(item);
      const result = await query.select();
      return !result.error && !result.data.length ? {error:{code:'MISSING'}} : result;
    },id ? '품목을 수정했습니다.' : '품목을 등록했습니다.');
  });
  $('cancel-edit').addEventListener('click',resetForm);
  $('search').addEventListener('input',render); $('filter').addEventListener('change',render);
  $('export').addEventListener('click',() => {
    if (!items.length) { notify('내보낼 재고가 없습니다.'); return; }
    const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""') + '"';
    const rows = [['품목명','분류','현재 수량','최소 수량','단가(원)'],...items.map(item => [item.name,item.category,item.quantity,item.minimum,item.price])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = '공유재고.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
}
