'use strict';
function startSidebar() {
  const layout=document.getElementById('app-layout'),sidebar=document.getElementById('sidebar');
  const handle=document.getElementById('sidebar-resizer'),toggle=document.getElementById('sidebar-toggle');
  const read=key=>{try{return window.localStorage.getItem(key);}catch{return null;}};
  const save=(key,value)=>{try{window.localStorage.setItem(key,value);}catch{/* 설정 저장이 제한되어도 메뉴를 사용할 수 있습니다. */}};
  let width=250,dragging=null;
  function setWidth(value,persist=false){
    const max=Math.max(200,Math.min(420,window.innerWidth-360));
    width=Math.round(Math.max(200,Math.min(max,Number.isFinite(value)?value:250)));
    layout.style.setProperty('--sidebar-width',width+'px');
    handle.setAttribute('aria-valuemin',200);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',width);
    if(persist)save('inventory-sidebar-width',String(width));
  }
  function setOpen(open){
    layout.classList.toggle('sidebar-open',open);toggle.setAttribute('aria-expanded',open);
    toggle.textContent=open?'☰ 메뉴 숨기기':'☰ 메뉴 열기';
  }
  const savedWidth=read('inventory-sidebar-width');setWidth(savedWidth===null?250:Number(savedWidth));
  setOpen(window.innerWidth>700);
  toggle.addEventListener('click',()=>setOpen(!layout.classList.contains('sidebar-open')));
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();dragging=event.pointerId;handle.setPointerCapture(event.pointerId);layout.classList.toggle('sidebar-dragging',true);
  });
  handle.addEventListener('pointermove',event=>{if(event.pointerId===dragging)setWidth(event.clientX-sidebar.getBoundingClientRect().left);});
  function finish(event){
    if(event.pointerId!==dragging)return;
    dragging=null;layout.classList.toggle('sidebar-dragging',false);save('inventory-sidebar-width',String(width));
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
  }
  ['pointerup','pointercancel','lostpointercapture'].forEach(event=>handle.addEventListener(event,finish));
  handle.addEventListener('keydown',event=>{
    const next={ArrowLeft:width-20,ArrowRight:width+20,Home:200,End:420}[event.key];
    if(next===undefined)return;
    event.preventDefault();setWidth(next,true);
  });
  document.querySelectorAll('[data-sidebar-folder]').forEach(folder=>{
    const key='inventory-sidebar-folder-'+folder.id,saved=read(key);
    if(saved!==null)folder.open=saved==='true';
    folder.addEventListener('toggle',()=>save(key,String(folder.open)));
  });
  document.querySelectorAll('.sidebar-action').forEach(action=>action.addEventListener('click',()=>{if(window.innerWidth<=700)setOpen(false);}));
  window.addEventListener('resize',()=>{setWidth(width);if(window.innerWidth<=700)setOpen(false);});
}
