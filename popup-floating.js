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
})();
