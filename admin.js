'use strict';
const $ = id => document.getElementById(id);
let client, users = [], page = 1, hasMore = false, adminCount = 0, maxAdmins = 3, adminUserId = '', activityRows = [], activityPage = 1, activityHasMore = false, activitySearch = '', editing = null, busy = false, sessionGeneration = 0, activityLoadGeneration = 0;
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
  $('admin-count').textContent = '관리자 ' + adminCount + '/' + maxAdmins;
  $('users').querySelectorAll('button').forEach(button => button.disabled = busy || button.dataset.protected === 'true');
  $('users').querySelectorAll('button[data-locked]').forEach(button => button.disabled = busy || button.dataset.locked === 'true');
  $('activity-search-button').disabled = busy;
  $('activity-search-reset').disabled = busy;
  $('activity-previous').disabled = busy || activityPage <= 1;
  $('activity-next').disabled = busy || !activityHasMore;
  $('activity-page-label').textContent = activityPage + ' 페이지';
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
  if (!response.ok) { const error = new Error(result.error || '요청을 처리하지 못했습니다.'); error.status = response.status; throw error; }
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
    const role = document.createElement('button');
    role.textContent = user.is_admin ? '관리자 해제' : '관리자 지정';
    role.className = user.is_admin ? 'danger' : '';
    const locked = (!user.is_admin && user.disabled) || (user.is_admin && (adminCount <= 1 || user.id === adminUserId))
      || (!user.is_admin && adminCount >= maxAdmins);
    role.dataset.locked = String(locked);
    role.title = user.disabled ? '사용 중인 계정에만 관리자 권한을 부여할 수 있습니다.'
      : user.is_admin && user.id === adminUserId ? '현재 로그인한 관리자의 권한은 다른 관리자가 변경해야 합니다.'
      : user.is_admin && adminCount <= 1 ? '관리자는 최소 한 명을 유지해야 합니다.'
      : !user.is_admin && adminCount >= maxAdmins ? '관리자는 최대 3명까지 지정할 수 있습니다.' : '';
    role.setAttribute('aria-label',user.email + ' ' + role.textContent);
    role.addEventListener('click',() => {
      if (locked || !confirm(user.email + (user.is_admin ? '의 관리자 권한을 해제할까요?' : '에 관리자 권한을 부여할까요?'))) return;
      runMutation(() => api('PATCH',{id:user.id,is_admin:!user.is_admin}),user.is_admin ? '관리자 권한을 해제했습니다.' : '관리자 권한을 부여했습니다.');
    });
    actions.append(edit,toggle,role); row.append(email,state,actions); $('users').append(row);
  });
  updateControls();
}
async function activityRequest(method = 'GET',body) {
  const {data,error} = await client.auth.getSession();
  if (error || !data.session) throw new Error('관리자 계정으로 로그인해 주세요.');
  const params = new URLSearchParams({page:String(activityPage)});
  if (activitySearch) params.set('user',activitySearch);
  const response = await fetch('/api/user-activity' + (method === 'GET' ? '?' + params : ''),{
    method,headers:{Authorization:'Bearer ' + data.session.access_token,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined,cache:'no-store'
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('로그인 이력 API에 연결하지 못했습니다.'); }
  if (!response.ok) throw new Error(result.error || '로그인 이력을 처리하지 못했습니다.');
  return result;
}
function renderActivity() {
  $('activity-rows').replaceChildren();
  if (!activityRows.length) {
    const row = document.createElement('tr'),cell = document.createElement('td');
    cell.colSpan = 3; cell.textContent = activitySearch ? '검색 조건에 해당하는 로그인 이력이 없습니다.' : '로그인 이력이 없습니다.';
    row.append(cell); $('activity-rows').append(row);
  }
  activityRows.forEach(entry => {
    const row = document.createElement('tr'),email = document.createElement('td'),event = document.createElement('td'),time = document.createElement('td');
    email.textContent = entry.email;
    event.textContent = entry.event_type === 'login' ? '로그인' : '로그아웃';
    const date = new Date(entry.occurred_at);
    time.textContent = Number.isNaN(date.getTime()) ? entry.occurred_at
      : new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
    row.append(email,event,time); $('activity-rows').append(row);
  });
  updateControls();
}
async function loadUsers() {
  const generation = sessionGeneration, result = await api();
  if (generation !== sessionGeneration) return false;
  users = result.users; hasMore = result.hasMore; adminCount = result.adminCount; maxAdmins = result.maxAdmins; renderUsers(); return true;
}
async function loadActivity() {
  const generation = sessionGeneration, request = ++activityLoadGeneration, result = await activityRequest();
  if (generation !== sessionGeneration || request !== activityLoadGeneration) return false;
  activityRows = result.events; activityHasMore = result.hasMore; renderActivity(); return true;
}
async function recordActivity(eventType) {
  await activityRequest('POST',{event_type:eventType});
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
  sessionGeneration++; users = []; activityRows = []; activityPage = 1; activityHasMore = false; activitySearch = ''; adminUserId = session?.user?.id || ''; $('activity-user-search').value = ''; $('users').replaceChildren(); $('activity-rows').replaceChildren(); resetEditor();
  const generation = sessionGeneration;
  $('admin-panel').hidden = true; $('login-panel').hidden = !!session;
  if (!session) return;
  $('admin-email').textContent = session.user.email;
  try {
    page = 1;
    if (await loadUsers()) {
      $('admin-panel').hidden = false; $('login-panel').hidden = true;
      try { await loadActivity(); notify('관리자 권한을 확인했습니다.'); }
      catch (error) { notify('사용자 목록은 불러왔지만 로그인 이력 조회에 실패했습니다: ' + error.message,true); }
    }
  } catch (error) {
    if (generation !== sessionGeneration) return;
    if (error.status === 403) { window.location.replace('/'); return; }
    if (error.status === 401) { await client.auth.signOut({scope:'local'}); }
    notify(error.message,true);
  }
}
async function startAdmin() {
  if (!window.supabase) { notify('로그인 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true); return; }
  client = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:'inventory-note-stock-session',autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session) => {
    if (['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event)) setTimeout(() => onSession(session),0);
  });
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); $('login-button').disabled = true;
    try {
      const {error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if (error) notify('아이디, 비밀번호 또는 계정 상태를 확인하세요.',true);
      else {
        try { await recordActivity('login'); await loadActivity(); }
        catch (activityError) { notify('로그인은 완료했지만 로그인 이력을 저장하지 못했습니다: ' + activityError.message,true); }
      }
    } catch { notify('로그인 서버에 연결하지 못했습니다.',true); }
    finally { $('password').value = ''; $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click',async () => {
    if (busy) return;
    let activityError;
    try { await recordActivity('logout'); } catch (error) { activityError = error; }
    const {error} = await client.auth.signOut({scope:'local'});
    notify(error ? '로그아웃하지 못했습니다.' : activityError ? '로그아웃했지만 이력을 저장하지 못했습니다: ' + activityError.message : '로그아웃했습니다.',!!error || !!activityError);
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
    try { await loadUsers(); await loadActivity(); notify('사용자 목록과 로그인 이력을 불러왔습니다.'); } catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  }
  $('refresh').addEventListener('click',refresh);
  $('previous').addEventListener('click',() => { if (page > 1 && !busy) { page--; refresh(); } });
  $('next').addEventListener('click',() => { if (hasMore && !busy) { page++; refresh(); } });
  $('activity-search-form').addEventListener('submit',async event => {
    event.preventDefault(); if (busy) return;
    activitySearch = $('activity-user-search').value.trim(); activityPage = 1; busy = true; updateControls();
    try { await loadActivity(); notify('로그인 이력을 불러왔습니다.'); }
    catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  });
  $('activity-search-reset').addEventListener('click',async () => {
    if (busy) return;
    $('activity-user-search').value = ''; activitySearch = ''; activityPage = 1; busy = true; updateControls();
    try { await loadActivity(); notify('로그인 이력을 불러왔습니다.'); }
    catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  });
  $('activity-previous').addEventListener('click',async () => {
    if (activityPage <= 1 || busy) return;
    activityPage--; busy = true; updateControls();
    try { await loadActivity(); }
    catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  });
  $('activity-next').addEventListener('click',async () => {
    if (!activityHasMore || busy) return;
    activityPage++; busy = true; updateControls();
    try { await loadActivity(); }
    catch (error) { notify(error.message,true); }
    finally { busy = false; updateControls(); }
  });
}
startAdmin();
