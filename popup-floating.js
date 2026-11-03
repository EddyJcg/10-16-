'use strict';
(function(){
  // 확인·상세·달력처럼 상위 팝업 위에 겹쳐 뜨는 창은 기존처럼 모달로 유지합니다.
  const modalIds=new Set(['sales-register-confirm-dialog','receipt-import-missing-dialog','receipt-details-dialog','detail-dialog','vendor-option-dialog','print-settings-dialog']);
  let stack=4;
  // 나중에 연 팝업일수록 좌상단에서 우하단으로 어긋나게 배치하고 위에 쌓습니다.
  function cascade(dialog){
    const index=[...document.querySelectorAll('dialog.popup-floating[open]')].filter(d=>d!==dialog).length%10;
    const offset=24+index*36;
    dialog.style.position='fixed';
    dialog.style.margin='0';
    dialog.style.inset='auto';
    dialog.style.left=offset+'px';
    dialog.style.top=offset+'px';
    dialog.style.zIndex=String(++stack);
    keepInViewport(dialog);
  }
  // 팝업이 화면 밖으로 나가지 않도록 위치를 보정합니다.
  function keepInViewport(dialog){
    if(typeof dialog.getBoundingClientRect!=='function'||typeof innerWidth!=='number')return;
    const rect=dialog.getBoundingClientRect();
    const left=Math.max(0,Math.min(rect.left,innerWidth-rect.width));
    const top=Math.max(0,Math.min(rect.top,innerHeight-rect.height));
    dialog.style.left=left+'px';
    dialog.style.top=top+'px';
  }
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    if(modalIds.has(this.id)||this.classList.contains('search-calendar'))return nativeShowModal.call(this);
    if(this.open){this.classList.remove('popup-flash');void this.offsetWidth;this.classList.add('popup-flash');return;}
    this.classList.add('popup-floating');
    this.show();
    cascade(this);
  };
  document.addEventListener('animationend',event=>{if(event.target.classList)event.target.classList.remove('popup-flash');},true);
  // 제목줄을 잡고 끌면 팝업이 따라 움직입니다.
  let drag=null;
  document.addEventListener('pointerdown',event=>{
    if(event.button>0||!event.target.closest)return;
    const handle=event.target.closest('.dialog-header,.vendor-list-title');
    const dialog=handle&&handle.closest('dialog.popup-floating[open]');
    if(!dialog||event.target.closest('button,input,select,textarea,a,label'))return;
    const rect=dialog.getBoundingClientRect();
    stack+=1;dialog.style.zIndex=String(stack);
    drag={dialog,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
    event.preventDefault();
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag)return;
    const rect=drag.dialog.getBoundingClientRect();
    drag.dialog.style.left=Math.max(0,Math.min(event.clientX-drag.dx,innerWidth-rect.width))+'px';
    drag.dialog.style.top=Math.max(0,Math.min(event.clientY-drag.dy,innerHeight-rect.height))+'px';
  },true);
  document.addEventListener('pointerup',()=>{drag=null;},true);
  if(typeof addEventListener==='function')addEventListener('resize',()=>document.querySelectorAll('dialog.popup-floating[open]').forEach(keepInViewport));
})();
