'use strict';
const $ = id => document.getElementById(id);
let client, users = [], page = 1, hasMore = false, editing = null, busy = false, sessionGeneration = 0;
function notify(text,error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function resetEditor() {
  editing = null; $('user-form').reset(); $('user-password').required = true;
  $('form-title').textContent = '사용자 등록'; $('save-user').textContent = '계정 만들기';
  $('password-help').textContent = '12~128자로 입력하세요. 기존 비밀번호는 조회할 수 없습니다.';
  $('cancel-edit').hidden = true;
}
function updateControls() {
  $('editor').disabled = busy; $('refresh').disabled = busy;
  $('previous').disabled = busy || page <= 1; $('next').disabled = busy || !hasMore;
  $('page-label').textContent = page + ' 페이지';
  $('users').querySelectorAll('button').forEach(button => button.disabled = busy || button.dataset.protected === 'true');
}
async function api(method = 'GET',body) {
  const {data,error} = await client.auth.getSession();
  if (error || !data.session) throw new Error('관리자 계정으로 로그인해 주세요.');
  const response = await fetch('/api/admin-users' + (method === 'GET' ? '?page=' + page : ''),{
    method,headers:{Authorization:'Bearer ' + data.session.access_token,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined,cache:'no-store'
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('관리자 API에 연결하지 못했습니다. Vercel 배포 상태를 확인하세요.'); }
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}
function renderUsers() {
  $('users').replaceChildren();
  if (!users.length) {
    const row = document.createElement('tr'),cell = document.createElement('td');
    cell.colSpan = 3; cell.textContent = '등록된 사용자가 없습니다.'; row.append(cell); $('users').append(row);
  }
  users.forEach(user => {
    const row = document.createElement('tr'),email = document.createElement('td'),state = document.createElement('td'),actions = document.createElement('td');
    email.textContent = user.email;
    const badge = document.createElement('span'); badge.className = 'badge' + (user.disabled ? ' disabled' : '');
    badge.textContent = user.is_admin ? '관리자' : user.disabled ? '사용 중지' : '사용 중'; state.append(badge);
    const edit = document.createElement('button'); edit.textContent = '정보 수정'; edit.setAttribute('aria-label',user.email + ' 정보 수정');
    edit.addEventListener('click',() => {
      editing = user.id; $('user-email').value = user.email; $('user-password').value = ''; $('user-password').required = false;
      $('form-title').textContent = '사용자 수정'; $('save-user').textContent = '변경 사항 저장';
      $('password-help').textContent = '비밀번호를 바꾸려면 새 값을 입력하세요. 비워두면 기존 비밀번호를 유지합니다.';
      $('cancel-edit').hidden = false; $('user-email').focus();
    });
    const toggle = document.createElement('button'); toggle.textContent = user.disabled ? '재활성화' : '사용 중지';
    toggle.className = user.disabled ? '' : 'danger'; toggle.dataset.protected = String(user.is_admin);
    toggle.setAttribute('aria-label',user.email + ' ' + toggle.textContent);
    toggle.addEventListener('click',() => {
      if (!confirm(user.email + (user.disabled ? ' 계정을 다시 활성화할까요?' : ' 계정의 사용을 중지할까요?'))) return;
      runMutation(() => api('PATCH',{id:user.id,disabled:!user.disabled}),user.disabled ? '계정을 재활성화했습니다.' : '계정 사용을 중지했습니다.');
    });
    actions.append(edit,toggle); row.append(email,state,actions); $('users').append(row);
  });
  updateControls();
}
async function loadUsers() {
  const generation = sessionGeneration, result = await api();
  if (generation !== sessionGeneration) return false;
  users = result.users; hasMore = result.hasMore; renderUsers(); return true;
}
async function runMutation(action,message) {
  if (busy) return; busy = true; updateControls();
  try {
    await action(); resetEditor();
    try { await loadUsers(); notify(message); }
    catch { notify(message + ' 목록 새로고침은 실패했습니다. 다시 새로고침해 주세요.',true); }
  } catch (error) { notify(error.message,true); }
  finally { $('user-password').value = ''; busy = false; updateControls(); }
}
async function onSession(session) {
  sessionGeneration++; users = []; $('users').replaceChildren(); resetEditor();
  $('admin-panel').hidden = true; $('login-panel').hidden = false;
  if (!session) return;
  $('admin-email').textContent = session.user.email;
  try {
    page = 1;
    if (await loadUsers()) { $('admin-panel').hidden = false; $('login-panel').hidden = true; notify('관리자 권한을 확인했습니다.'); }
  } catch (error) {
    notify(error.message,true);
  }
}
async function startAdmin() {
  if (!window.supabase) { notify('로그인 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true); return; }
  client = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:'inventory-note-admin-session',autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session) => {
    if (['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event)) setTimeout(() => onSession(session),0);
  });
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); $('login-button').disabled = true;
    try {
      const {error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if (error) notify('아이디, 비밀번호 또는 계정 상태를 확인하세요.',true);
    } catch { notify('로그인 서버에 연결하지 못했습니다.',true); }
    finally { $('password').value = ''; $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click',async () => {
    if (busy) return;
    const {error} = await client.auth.signOut({scope:'local'});
    notify(error ? '로그아웃하지 못했습니다.' : '로그아웃했습니다.',!!error);
  });
  $('user-form').addEventListener('submit',event => {
    event.preventDefault(); const body = {email:$('user-email').value.trim()};
    if ($('user-password').value) body.password = $('user-password').value;
    if (editing) body.id = editing;
    runMutation(() => api(editing ? 'PATCH' : 'POST',body),editing ? '계정 정보를 수정했습니다.' : '계정을 생성했습니다.');
  });
  $('cancel-edit').addEventListener('click',resetEditor);
  async function refresh() {
    if (busy) return; busy = true; updateControls();
    try { await loadUsers(); notify('사용자 목록을 불러왔습니다.'); } catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  }
  $('refresh').addEventListener('click',refresh);
  $('previous').addEventListener('click',() => { if (page > 1 && !busy) { page--; refresh(); } });
  $('next').addEventListener('click',() => { if (hasMore && !busy) { page++; refresh(); } });
}
startAdmin();
