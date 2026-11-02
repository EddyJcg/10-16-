'use strict';
const vendor$=id=>document.getElementById(id);
const VENDOR_OPTION_TITLES={
  name_alias:'거래처명 생략 등록',
  vendor_type:'거래처 종류 등록',
  vendor_category:'거래처 분류 등록',
  payment_account:'거래처별 지불계정 등록(일괄)'
};
const VENDOR_PROFILE_FIELDS=[
  ['vendor-business-number','business_registration_number'],['vendor-entity-type','entity_type'],
  ['vendor-representative','representative'],['vendor-phone','phone'],['vendor-resident-number','resident_registration_number'],
  ['vendor-industry','industry'],['vendor-business-type','business_type'],['vendor-business-address','business_address'],
  ['vendor-electronic-tax-exception','electronic_tax_exception'],['vendor-contact-person','contact_person'],
  ['vendor-sales-manager','sales_manager'],['vendor-manager-phone','manager_phone'],
  ['vendor-credit-limit','credit_limit'],['vendor-collection-place','collection_place'],
  ['vendor-main-partner','main_partner'],['vendor-sales-terms','sales_collection_terms'],
  ['vendor-payment-account','payment_account_id'],['vendor-payment-relationship','payment_relationship'],
  ['vendor-product-name','product_name'],['vendor-website','website'],['vendor-opening-date','opening_date'],
  ['vendor-classification','classification_id'],['vendor-email','email'],['vendor-extra-info','extra_info'],
  ['vendor-has-image','has_image'],['vendor-has-attachment','has_attachment']
];
let vendorRecords=[],vendorOptions=[],currentVendorId='',vendorOptionsCategory='',editingVendorOptionId='';

function vendorProfileFromForm(){
  return Object.fromEntries(VENDOR_PROFILE_FIELDS.map(([id,key])=>{
    const field=vendor$(id);
    return [key,field.type==='checkbox'?field.checked:field.value.trim()];
  }));
}
function setVendorForm(record){
  const profile=record?.profile||{};
  currentVendorId=record?.id||'';
  vendor$('vendor-id').value=currentVendorId;
  vendor$('vendor-legal-name').value=record?.legal_name||'';
  vendor$('vendor-name').value=record?.vendor_name||'';
  vendor$('vendor-status').value=record?.status||'정상';
  vendor$('vendor-number').value=record?.partner_number||'';
  vendor$('vendor-country-scope').value=record?.country_scope||'국내';
  vendor$('vendor-credit-grade').value=record?.credit_grade||'A';
  vendor$('vendor-country').value=record?.country||'대한민국';
  vendor$('vendor-currency').value=record?.currency||'KRW';
  VENDOR_PROFILE_FIELDS.forEach(([id,key])=>{
    const field=vendor$(id),value=profile[key];
    if(field.type==='checkbox')field.checked=value===true;
    else field.value=value??'';
  });
  const selected=new Set(record?.selected_type_ids||[]);
  vendor$('vendor-type-items').querySelectorAll('[data-vendor-type-id]').forEach(input=>{input.checked=selected.has(input.dataset.vendorTypeId);});
  updateVendorTypeCount();
}
function resetVendorForm(message='신규 거래처 정보를 입력하세요.'){
  currentVendorId='';
  vendor$('vendor-form').reset();
  vendor$('vendor-id').value='';
  vendor$('vendor-status').value='정상';
  vendor$('vendor-country-scope').value='국내';
  vendor$('vendor-credit-grade').value='A';
  vendor$('vendor-country').value='대한민국';
  vendor$('vendor-currency').value='KRW';
  vendor$('vendor-type-items').querySelectorAll('[data-vendor-type-id]').forEach(input=>{input.checked=false;});
  updateVendorTypeCount();
  vendor$('vendor-status-message').textContent=message;
  vendor$('vendor-title').textContent='거래처 등록';
}
function selectedVendorTypeIds(){
  return [...vendor$('vendor-type-items').querySelectorAll('[data-vendor-type-id]:checked')].map(input=>input.dataset.vendorTypeId);
}
function updateVendorTypeCount(){
  const count=selectedVendorTypeIds().length;
  vendor$('vendor-type-count').textContent=count?`${count}개 선택`:'';
}
function renderVendorTypeOptions(){
  const body=vendor$('vendor-type-items'),selected=new Set(selectedVendorTypeIds());
  body.replaceChildren();
  const options=vendorOptions.filter(option=>option.category==='vendor_type'&&option.is_active).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'ko'));
  if(!options.length){
    const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.className='empty';cell.textContent='등록된 거래처 종류가 없습니다.';row.append(cell);body.append(row);return;
  }
  options.forEach(option=>{
    const row=document.createElement('tr'),selectCell=document.createElement('td'),checkbox=document.createElement('input');
    checkbox.type='checkbox';checkbox.dataset.vendorTypeId=option.id;checkbox.checked=selected.has(option.id);
    checkbox.setAttribute('aria-label',`${option.name} 선택`);checkbox.addEventListener('change',updateVendorTypeCount);
    selectCell.append(checkbox);row.append(selectCell);
    [option.name,option.details?.transaction||'일반',option.details?.businessNumberRequired?'필수':'',option.details?.residentNumberRequired?'필수':'']
      .forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});
    body.append(row);
  });
  updateVendorTypeCount();
}
function refreshVendorDropdowns(){
  const categories=vendor$('vendor-classification'),selectedCategory=categories.value;
  categories.replaceChildren(new Option('선택',''));
  vendorOptions.filter(option=>option.category==='vendor_category'&&option.is_active).forEach(option=>categories.add(new Option(option.name,option.id)));
  if([...categories.options].some(option=>option.value===selectedCategory))categories.value=selectedCategory;
  const accounts=vendor$('vendor-payment-account'),selectedAccount=accounts.value;
  accounts.replaceChildren(new Option('선택',''));
  vendorOptions.filter(option=>option.category==='payment_account'&&option.is_active).forEach(option=>accounts.add(new Option(option.name,option.id)));
  if([...accounts.options].some(option=>option.value===selectedAccount))accounts.value=selectedAccount;
  const aliases=vendor$('vendor-name-aliases');aliases.replaceChildren();
  vendorOptions.filter(option=>option.category==='name_alias'&&option.is_active).forEach(option=>{
    const item=document.createElement('option');item.value=option.code;item.label=option.name;aliases.append(item);
  });
}
async function loadVendorData(){
  const [vendorsResult,optionsResult]=await Promise.all([
    client.from('business_partners').select('*').order('legal_name'),
    client.from('vendor_master_options').select('*').order('sort_order').order('name')
  ]);
  if(vendorsResult.error)throw vendorsResult.error;
  if(optionsResult.error)throw optionsResult.error;
  vendorRecords=vendorsResult.data||[];vendorOptions=optionsResult.data||[];
  refreshVendorDropdowns();renderVendorTypeOptions();renderVendorList();renderVendorOptionsList();
}
function vendorErrorText(error){
  const message=String(error?.message||error||'');
  if(['PGRST205','42P01','42703'].some(code=>message.includes(code))||message.toLowerCase().includes('business_partners')||message.toLowerCase().includes('vendor_master_options'))
    return '거래처 DB 설정이 필요합니다. Supabase SQL Editor에서 supabase/vendor-management.sql을 실행하세요.';
  if(message.includes('business_partners_number_unique')||message.includes('duplicate key'))
    return '이미 사용 중인 거래처번호입니다. 다른 번호를 입력하세요.';
  if(message.includes('row-level security')||message.includes('ACCESS_DENIED'))
    return '거래처 정보를 사용할 권한이 없습니다. 로그인 및 계정 권한을 확인하세요.';
  return '요청을 완료하지 못했습니다. '+message;
}
async function openVendorDialog(){
  if(!currentUser)return;
  resetVendorForm();
  vendor$('vendor-status-message').textContent='거래처 정보를 불러오는 중…';
  vendor$('vendor-dialog').showModal();
  try{await loadVendorData();resetVendorForm();}
  catch(error){vendor$('vendor-status-message').textContent=vendorErrorText(error);}
}
async function openVendorList(){
  if(!currentUser)return;
  vendor$('vendor-list-query').value='';
  vendor$('vendor-list-message').textContent='거래처 목록을 불러오는 중…';
  vendor$('vendor-list-dialog').showModal();
  try{await loadVendorData();vendor$('vendor-list-message').textContent='';renderVendorList();}
  catch(error){vendor$('vendor-list-message').textContent=vendorErrorText(error);}
}
function renderVendorList(){
  const body=vendor$('vendor-list-items');if(!body)return;
  const query=(vendor$('vendor-list-query')?.value||'').trim().toLocaleLowerCase('ko');
  const rows=vendorRecords.filter(record=>{
    const profile=record.profile||'';
    const text=[record.partner_number,record.legal_name,record.vendor_name,profile.business_registration_number].join(' ').toLocaleLowerCase('ko');
    return text.includes(query);
  });
  body.replaceChildren();
  if(!rows.length){
    const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=7;cell.className='empty';
    cell.textContent=vendorRecords.length?'검색 조건에 맞는 거래처가 없습니다.':'등록된 거래처가 없습니다.';row.append(cell);body.append(row);return;
  }
  rows.forEach(record=>{
    const row=document.createElement('tr');
    const types=(record.selected_type_ids||[]).map(id=>vendorOptions.find(option=>option.id===id)?.name).filter(Boolean).join(', ');
    [record.partner_number||'',record.legal_name,record.vendor_name,types,record.status,record.profile?.business_registration_number||''].forEach(value=>{
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    });
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent='선택';button.dataset.vendorRecordId=record.id;action.append(button);row.append(action);body.append(row);
  });
}
async function saveVendor(event,copy=false){
  event?.preventDefault();
  if(!currentUser)return;
  const legalName=vendor$('vendor-legal-name').value.trim(),vendorName=vendor$('vendor-name').value.trim();
  if(!legalName||!vendorName){vendor$('vendor-status-message').textContent='상호와 거래처명을 입력하세요.';return;}
  const selectedTypes=selectedVendorTypeIds();
  const requiredTypes=vendorOptions.filter(option=>option.category==='vendor_type'&&selectedTypes.includes(option.id));
  if(requiredTypes.some(option=>option.details?.businessNumberRequired)&&!vendor$('vendor-business-number').value.trim()){
    vendor$('vendor-status-message').textContent='선택한 거래처 종류에는 사업자번호가 필요합니다.';return;
  }
  if(requiredTypes.some(option=>option.details?.residentNumberRequired)&&!vendor$('vendor-resident-number').value.trim()){
    vendor$('vendor-status-message').textContent='선택한 거래처 종류에는 주민등록번호가 필요합니다.';return;
  }
  const status=vendor$('vendor-status-message'),generation=authGeneration;
  status.textContent='거래처 정보를 저장하는 중…';
  vendor$('vendor-form').querySelectorAll('button,input,select,textarea').forEach(field=>field.disabled=true);
  const payload={
    ...(currentVendorId&&!copy?{id:currentVendorId}:{}),
    partner_number:vendor$('vendor-number').value.trim()||null,legal_name:legalName,vendor_name:vendorName,
    status:vendor$('vendor-status').value,country_scope:vendor$('vendor-country-scope').value,
    credit_grade:vendor$('vendor-credit-grade').value.trim(),country:vendor$('vendor-country').value.trim(),
    currency:vendor$('vendor-currency').value.trim(),selected_type_ids:selectedTypes,profile:vendorProfileFromForm()
  };
  try{
    const {data,error}=await client.from('business_partners').upsert(payload).select('*').single();
    if(error)throw error;
    if(generation!==authGeneration)return;
    currentVendorId=data.id;vendorRecords=[...vendorRecords.filter(record=>record.id!==data.id),data].sort((a,b)=>a.legal_name.localeCompare(b.legal_name,'ko'));
    setVendorForm(data);vendor$('vendor-title').textContent='거래처 수정';
    status.textContent=copy?'거래처 정보를 복사해 새로 저장했습니다.':'거래처 정보를 저장했습니다.';
    renderVendorList();
  }catch(error){if(generation===authGeneration)status.textContent=vendorErrorText(error);}
  finally{vendor$('vendor-form').querySelectorAll('button,input,select,textarea').forEach(field=>field.disabled=false);}
}
async function deleteVendor(){
  if(!currentVendorId){vendor$('vendor-status-message').textContent='삭제할 거래처를 먼저 조회하세요.';return;}
  if(!window.confirm('선택한 거래처 정보를 삭제하시겠습니까?'))return;
  const id=currentVendorId,generation=authGeneration;
  vendor$('vendor-status-message').textContent='거래처 정보를 삭제하는 중…';
  try{
    const {error}=await client.from('business_partners').delete().eq('id',id);
    if(error)throw error;
    if(generation!==authGeneration)return;
    vendorRecords=vendorRecords.filter(record=>record.id!==id);resetVendorForm('거래처 정보를 삭제했습니다.');renderVendorList();
  }catch(error){if(generation===authGeneration)vendor$('vendor-status-message').textContent=vendorErrorText(error);}
}
async function copyVendor(){
  if(!currentVendorId){vendor$('vendor-status-message').textContent='복사할 거래처를 먼저 조회하세요.';return;}
  const record=vendorRecords.find(item=>item.id===currentVendorId);if(!record)return;
  setVendorForm({...record,id:'',partner_number:'',legal_name:record.legal_name+' (복사)'});
  vendor$('vendor-title').textContent='거래처 복사 등록';
  await saveVendor(null,true);
}
function clearSelectedVendorTypes(){
  const selected=vendor$('vendor-type-items').querySelectorAll('[data-vendor-type-id]:checked');
  if(!selected.length){vendor$('vendor-status-message').textContent='해제할 거래처 종류를 선택하세요.';return;}
  selected.forEach(input=>{input.checked=false;});
  updateVendorTypeCount();vendor$('vendor-status-message').textContent='선택한 거래처 종류 체크를 해제했습니다. 저장을 눌러 반영하세요.';
}
function optionFormField(id,label,type='text',extra=''){
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra}></div>`;
}
function renderVendorOptionForm(category){
  const form=vendor$('vendor-option-form');editingVendorOptionId='';
  if(category==='name_alias')form.innerHTML=optionFormField('vendor-option-code','생략명','text','maxlength="80" required')+optionFormField('vendor-option-name','정식 거래처명','text','maxlength="160" required')+'<div class="vendor-option-actions"><button type="submit" class="primary">생략명 저장</button><button type="button" class="secondary" data-vendor-option-reset>초기화</button></div>';
  else if(category==='vendor_type')form.innerHTML=optionFormField('vendor-option-name','거래처 종류','text','maxlength="160" required')+'<div class="field"><label for="vendor-option-transaction">거래구분</label><select id="vendor-option-transaction"><option>매출</option><option>매입</option><option>일반</option></select></div><div class="vendor-option-checks vendor-option-wide"><label><input id="vendor-option-business-required" type="checkbox"> 사업자번호 필수</label><label><input id="vendor-option-resident-required" type="checkbox"> 주민등록번호 필수</label></div><div class="vendor-option-actions"><button type="submit" class="primary">종류 저장</button><button type="button" class="secondary" data-vendor-option-reset>초기화</button></div>';
  else if(category==='vendor_category')form.innerHTML=optionFormField('vendor-option-name','거래처 분류','text','maxlength="160" required')+'<div class="field vendor-option-wide"><label for="vendor-option-description">설명</label><input id="vendor-option-description" maxlength="300"></div><div class="vendor-option-actions"><button type="submit" class="primary">분류 저장</button><button type="button" class="secondary" data-vendor-option-reset>초기화</button></div>';
  else form.innerHTML='<div class="field vendor-option-wide"><label for="vendor-option-bulk">지불계정 목록 (한 줄에 하나씩)</label><textarea id="vendor-option-bulk" rows="3" placeholder="예: 외상매입금&#10;현금"></textarea></div><div class="vendor-option-actions"><button type="submit" class="primary">목록 일괄 저장</button></div>';
}
function renderVendorOptionsList(){
  const head=vendor$('vendor-option-head'),body=vendor$('vendor-option-items');if(!head||!body||!vendorOptionsCategory)return;
  const headers=vendorOptionsCategory==='name_alias'?['생략명','정식 거래처명','관리']:
    vendorOptionsCategory==='vendor_type'?['거래처 종류','거래구분','사업자번호','주민등록번호','관리']:
    vendorOptionsCategory==='vendor_category'?['분류','설명','관리']:['지불계정','관리'];
  const headerRow=document.createElement('tr');headers.forEach(value=>{const cell=document.createElement('th');cell.textContent=value;headerRow.append(cell);});head.replaceChildren(headerRow);
  const rows=vendorOptions.filter(option=>option.category===vendorOptionsCategory&&option.is_active);
  body.replaceChildren();
  if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=headers.length;cell.className='empty';cell.textContent='등록된 항목이 없습니다.';row.append(cell);body.append(row);return;}
  rows.forEach(option=>{
    const row=document.createElement('tr');
    const values=vendorOptionsCategory==='name_alias'?[option.code,option.name]:
      vendorOptionsCategory==='vendor_type'?[option.name,option.details?.transaction||'일반',option.details?.businessNumberRequired?'필수':'',option.details?.residentNumberRequired?'필수':'']:
      vendorOptionsCategory==='vendor_category'?[option.name,option.details?.description||'']:[option.name];
    values.forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});
    const action=document.createElement('td');
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='수정';edit.dataset.vendorOptionEdit=option.id;action.append(edit);
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='삭제';remove.dataset.vendorOptionDelete=option.id;action.append(remove);
    row.append(action);body.append(row);
  });
}
async function openVendorOptions(category){
  if(!currentUser||!VENDOR_OPTION_TITLES[category])return;
  vendorOptionsCategory=category;vendor$('vendor-option-title').textContent=VENDOR_OPTION_TITLES[category];
  renderVendorOptionForm(category);vendor$('vendor-option-message').textContent='설정을 불러오는 중…';vendor$('vendor-option-dialog').showModal();
  try{await loadVendorData();vendor$('vendor-option-message').textContent='';renderVendorOptionsList();}
  catch(error){vendor$('vendor-option-message').textContent=vendorErrorText(error);}
}
function editVendorOption(id){
  const option=vendorOptions.find(item=>item.id===id);if(!option)return;editingVendorOptionId=id;
  if(vendorOptionsCategory==='name_alias'){vendor$('vendor-option-code').value=option.code;vendor$('vendor-option-name').value=option.name;}
  else{
    vendor$('vendor-option-name').value=option.name;
    if(vendorOptionsCategory==='vendor_type'){
      vendor$('vendor-option-transaction').value=option.details?.transaction||'일반';
      vendor$('vendor-option-business-required').checked=option.details?.businessNumberRequired===true;
      vendor$('vendor-option-resident-required').checked=option.details?.residentNumberRequired===true;
    }
    if(vendorOptionsCategory==='vendor_category')vendor$('vendor-option-description').value=option.details?.description||'';
  }
  vendor$('vendor-option-message').textContent='항목을 수정하고 저장하세요.';
}
async function saveVendorOption(event){
  event.preventDefault();if(!currentUser)return;
  const category=vendorOptionsCategory,form=vendor$('vendor-option-form');
  if(category==='payment_account'){
    const names=[...new Set(vendor$('vendor-option-bulk').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean))];
    if(!names.length){vendor$('vendor-option-message').textContent='저장할 지불계정을 입력하세요.';return;}
    const payload=names.map(name=>({category,code:crypto.randomUUID(),name,details:{},is_active:true,sort_order:vendorOptions.length}));
    try{
      const {error}=await client.from('vendor_master_options').insert(payload);if(error)throw error;
      await loadVendorData();renderVendorOptionsList();vendor$('vendor-option-form').reset();vendor$('vendor-option-message').textContent=`지불계정 ${names.length}개를 저장했습니다.`;
    }catch(error){vendor$('vendor-option-message').textContent=vendorErrorText(error);}
    return;
  }
  const name=vendor$('vendor-option-name').value.trim();
  if(!name){vendor$('vendor-option-message').textContent='항목명을 입력하세요.';return;}
  let code=editingVendorOptionId?vendorOptions.find(option=>option.id===editingVendorOptionId)?.code:'';
  let details={};
  if(category==='name_alias')code=vendor$('vendor-option-code').value.trim();
  if(category==='vendor_type'){
    details={transaction:vendor$('vendor-option-transaction').value,businessNumberRequired:vendor$('vendor-option-business-required').checked,residentNumberRequired:vendor$('vendor-option-resident-required').checked};
  }
  if(category==='vendor_category')details={description:vendor$('vendor-option-description').value.trim()};
  if(!code)code=crypto.randomUUID();
  const payload={...(editingVendorOptionId?{id:editingVendorOptionId}:{}),category,code,name,details,is_active:true,sort_order:vendorOptions.filter(option=>option.category===category).length};
  const message=vendor$('vendor-option-message');message.textContent='설정을 저장하는 중…';
  try{
    const {error}=await client.from('vendor_master_options').upsert(payload);if(error)throw error;
    await loadVendorData();renderVendorOptionsList();renderVendorOptionForm(category);message.textContent='설정을 저장했습니다.';
  }catch(error){message.textContent=vendorErrorText(error);}
}
async function deleteVendorOption(id){
  const option=vendorOptions.find(item=>item.id===id);if(!option)return;
  if(option.category==='vendor_type'&&vendorRecords.some(record=>(record.selected_type_ids||[]).includes(id))){
    vendor$('vendor-option-message').textContent='등록된 거래처에서 사용 중인 종류는 삭제할 수 없습니다.';return;
  }
  if((option.category==='vendor_category'&&vendorRecords.some(record=>record.profile?.classification_id===id))||
     (option.category==='payment_account'&&vendorRecords.some(record=>record.profile?.payment_account_id===id))){
    vendor$('vendor-option-message').textContent='등록된 거래처에서 사용 중인 항목은 삭제할 수 없습니다.';return;
  }
  if(!window.confirm(`'${option.name}' 항목을 삭제하시겠습니까?`))return;
  try{
    const {error}=await client.from('vendor_master_options').delete().eq('id',id);if(error)throw error;
    await loadVendorData();renderVendorOptionsList();vendor$('vendor-option-message').textContent='항목을 삭제했습니다.';
  }catch(error){vendor$('vendor-option-message').textContent=vendorErrorText(error);}
}
function resetVendorSession(){
  vendorRecords=[];vendorOptions=[];currentVendorId='';vendorOptionsCategory='';editingVendorOptionId='';
  ['vendor-dialog','vendor-list-dialog','vendor-option-dialog'].forEach(id=>{const dialog=vendor$(id);if(dialog?.open)dialog.close();});
}
function startVendorManagement(){
  vendor$('vendor-entry-button').addEventListener('click',openVendorDialog);
  vendor$('vendor-status-button').addEventListener('click',openVendorList);
  vendor$('close-vendor-dialog').addEventListener('click',()=>vendor$('vendor-dialog').close());
  vendor$('vendor-cancel').addEventListener('click',()=>vendor$('vendor-dialog').close());
  vendor$('vendor-form').addEventListener('submit',saveVendor);
  vendor$('vendor-toolbar').addEventListener('click',event=>{
    const action=event.target.closest('[data-vendor-action]')?.dataset.vendorAction;
    if(action==='new')resetVendorForm();
    else if(action==='query')openVendorList();
    else if(action==='copy')copyVendor();
    else if(action==='remove-types')clearSelectedVendorTypes();
    else if(action==='delete')deleteVendor();
    const option=event.target.closest('[data-vendor-option]')?.dataset.vendorOption;
    if(option)openVendorOptions(option);
  });
  vendor$('vendor-form').querySelectorAll('[data-vendor-section]').forEach(button=>button.addEventListener('click',()=>{
    vendor$(button.dataset.vendorSection).scrollIntoView({behavior:'smooth',block:'start'});
  }));
  vendor$('vendor-list-query').addEventListener('input',renderVendorList);
  vendor$('vendor-list-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-vendor-record-id]');if(!button)return;
    const record=vendorRecords.find(item=>item.id===button.dataset.vendorRecordId);if(!record)return;
    setVendorForm(record);vendor$('vendor-title').textContent='거래처 수정';vendor$('vendor-status-message').textContent='거래처 정보를 불러왔습니다.';
    vendor$('vendor-list-dialog').close();vendor$('vendor-dialog').showModal();
  });
  vendor$('close-vendor-list').addEventListener('click',()=>vendor$('vendor-list-dialog').close());
  vendor$('close-vendor-option').addEventListener('click',()=>vendor$('vendor-option-dialog').close());
  vendor$('vendor-option-form').addEventListener('submit',saveVendorOption);
  vendor$('vendor-option-form').addEventListener('click',event=>{
    if(event.target.closest('[data-vendor-option-reset]')){renderVendorOptionForm(vendorOptionsCategory);vendor$('vendor-option-message').textContent='';}
  });
  vendor$('vendor-option-items').addEventListener('click',event=>{
    const edit=event.target.closest('[data-vendor-option-edit]'),remove=event.target.closest('[data-vendor-option-delete]');
    if(edit)editVendorOption(edit.dataset.vendorOptionEdit);
    else if(remove)deleteVendorOption(remove.dataset.vendorOptionDelete);
  });
}
