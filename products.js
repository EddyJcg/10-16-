'use strict';
const $=id=>document.getElementById(id);
const number=value=>Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:2});
const money=number;
let client,items=[],movementProductIds=null,appliedSupplier='',appliedQuery='',busy=false,authGeneration=0;

function notify(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function emptyRow(text){
  const row=document.createElement('tr'),cell=document.createElement('td');
  cell.colSpan=STOCK_FIELDS.length+1;cell.className='empty';cell.textContent=text;row.append(cell);$('products').append(row);
}
function renderProducts(){
  const shown=filterInventoryItems(items,{query:appliedQuery,supplier:appliedSupplier,dateProductIds:movementProductIds});
  $('product-count').textContent=shown.length.toLocaleString('ko-KR')+'개';
  $('products').replaceChildren();
  if(!shown.length){emptyRow(items.length?'검색 조건에 맞는 품목이 없습니다.':'등록된 품목이 없습니다.');return;}
  shown.forEach((item,index)=>{
    const row=document.createElement('tr'),serial=document.createElement('td');
    serial.className='numeric';serial.textContent=number(index+1);row.append(serial);
    STOCK_FIELDS.forEach(field=>{
      const cell=document.createElement('td');cell.className=field.numeric?'numeric':'';
      cell.textContent=field.numeric?number(item[field.key]):item[field.key]||'';row.append(cell);
    });
    $('products').append(row);
  });
}
function renderHeaders(){
  $('product-head').replaceChildren();
  const serial=document.createElement('th');serial.scope='col';serial.className='numeric';serial.textContent='일련번호';$('product-head').append(serial);
  STOCK_FIELDS.forEach(field=>{
    const header=document.createElement('th');header.scope='col';header.textContent=field.label;
    header.className=field.numeric?'numeric':'';$('product-head').append(header);
  });
}
async function readAll(table,order='id'){
  const rows=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from(table).select('*').order(order).range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)return rows;
  }
}
async function findMovementProducts(startDate,endDate){
  if(!startDate&&!endDate)return null;
  const ids=new Set();
  for(let offset=0;;offset+=500){
    let query=client.from('stock_movements').select('product_id').order('id');
    if(startDate)query=query.gte('movement_date',startDate);
    if(endDate)query=query.lte('movement_date',endDate);
    const {data,error}=await query.range(offset,offset+499);
    if(error)throw error;
    data.forEach(row=>ids.add(String(row.product_id)));
    if(data.length<500)return ids;
  }
}
function updateSuppliers(){
  const select=$('supplier-filter'),selected=select.value;
  select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='전체 거래처';select.append(all);
  [...new Set(items.map(item=>String(item.supplier||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
async function loadProducts(){
  const generation=authGeneration;
  $('reload-products').disabled=true;
  try{
    const access=await client.rpc('inventory_access_allowed');
    if(access.error)throw access.error;
    if(!access.data){await client.auth.signOut({scope:'local'});return;}
    const rows=await readAll('stock_summary');
    if(generation!==authGeneration)return;
    items=rows;updateSuppliers();renderProducts();notify('전체 품목목록을 불러왔습니다.');
  }catch(error){if(generation===authGeneration)notify(error?.message||'품목목록을 불러오지 못했습니다. 네트워크 상태를 확인하세요.',true);}
  finally{$('reload-products').disabled=false;}
}
async function applySearch(){
  if(busy)return;
  const startDate=$('start-date').value,endDate=$('end-date').value;
  if(startDate&&endDate&&startDate>endDate){notify('시작일은 종료일보다 늦을 수 없습니다.',true);return;}
  busy=true;$('apply-search').disabled=true;
  try{
    const ids=await findMovementProducts(startDate,endDate);
    movementProductIds=ids;appliedSupplier=$('supplier-filter').value.trim().toLowerCase();appliedQuery=$('product-query').value.trim();
    renderProducts();notify('검색이 완료되었습니다.');
  }catch(error){notify(error?.message||'검색하지 못했습니다. 네트워크 상태를 확인하세요.',true);}
  finally{busy=false;$('apply-search').disabled=false;}
}
function clearSearch(){
  $('start-date').value='';$('end-date').value='';$('supplier-filter').value='';$('product-query').value='';
  movementProductIds=null;appliedSupplier='';appliedQuery='';renderProducts();notify('검색 조건을 초기화했습니다.');
}
function setSession(session){
  authGeneration++;
  const signedIn=!!session?.user;
  $('login-panel').hidden=signedIn;$('product-panel').hidden=!signedIn;
  if(signedIn)loadProducts();
  else{items=[];$('products').replaceChildren();notify('등록된 계정으로 로그인해 주세요.');}
}
function startProducts(){
  renderHeaders();
  if(!window.supabase){notify('로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true);return;}
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:'inventory-note-stock-session',autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session)=>{if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))setTimeout(()=>setSession(session),0);});
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('login-button').disabled=true;
    try{
      const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)notify('아이디, 비밀번호 또는 계정 상태를 확인하세요.',true);
    }catch{notify('로그인 서버에 연결하지 못했습니다.',true);}
    finally{$('password').value='';$('login-button').disabled=false;}
  });
  $('apply-search').addEventListener('click',applySearch);$('clear-search').addEventListener('click',clearSearch);
  $('reload-products').addEventListener('click',loadProducts);
}
startProducts();
