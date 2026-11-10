'use strict';
(function(){
  // 확인·상세·달력처럼 상위 팝업 위에 겹쳐 뜨는 창은 기존처럼 모달로 유지합니다.
  const modalIds=new Set(['sales-register-confirm-dialog','receipt-import-missing-dialog','receipt-details-dialog','detail-dialog','vendor-option-dialog','print-settings-dialog']);
  let stack=4;
  const viewW=()=>typeof innerWidth==='number'?innerWidth:Infinity;
  const viewH=()=>typeof innerHeight==='number'?innerHeight:Infinity;
  // 사이드 메뉴를 제외한 대시보드 영역입니다. 팝업은 이 영역 안에서만 배치됩니다.
  function area(){
    let left=0;
    const sidebar=typeof document.getElementById==='function'?document.getElementById('sidebar'):null;
    const resizer=typeof document.getElementById==='function'?document.getElementById('sidebar-resizer'):null;
    if(sidebar&&typeof sidebar.getBoundingClientRect==='function'){
      const rect=sidebar.getBoundingClientRect();
      if(rect.width>0)left=rect.right;
      const grip=resizer&&resizer.getBoundingClientRect();
      if(rect.width>0&&grip&&grip.width>0)left=grip.right;
    }
    const width=Math.max(0,viewW()-left);
    return {left,top:0,width,height:viewH()};
  }
  if(typeof window!=='undefined')window.popupArea=area;
  function publishArea(){
    const root=document.documentElement;
    if(!root||!root.style||typeof root.style.setProperty!=='function')return;
    const a=area();
    root.style.setProperty('--popup-area-left',a.left+'px');
    root.style.setProperty('--popup-area-width',a.width+'px');
    root.style.setProperty('--popup-area-height',a.height+'px');
  }
  // 나중에 연 팝업일수록 좌상단에서 우하단으로 어긋나게 배치하고 위에 쌓습니다.
  function cascade(dialog){
    publishArea();
    const a=area();
    const index=[...document.querySelectorAll('dialog.popup-floating[open]')].filter(d=>d!==dialog).length%10;
    const step=24+index*36;
    dialog.style.position='fixed';
    dialog.style.margin='0';
    dialog.style.inset='auto';
    dialog.style.left=(a.left+step)+'px';
    dialog.style.top=(a.top+step)+'px';
    dialog.style.zIndex=String(++stack);
    if(typeof dialog.getBoundingClientRect==='function'){
      const rect=dialog.getBoundingClientRect();
      if(step+rect.width>a.width||step+rect.height>a.height){dialog.style.left=(a.left+24)+'px';dialog.style.top=(a.top+24)+'px';}
    }
    keepInViewport(dialog);
    watchSize(dialog);
  }
  // 팝업이 대시보드 영역 밖으로 나가지 않도록 위치를 보정합니다.
  function keepInViewport(dialog){
    if(typeof dialog.getBoundingClientRect!=='function'||typeof innerWidth!=='number')return;
    if(dialog.classList.contains('dialog-expanded'))return;
    const a=area();
    const rect=dialog.getBoundingClientRect();
    dialog.style.left=Math.max(a.left,Math.min(rect.left,a.left+a.width-rect.width))+'px';
    dialog.style.top=Math.max(a.top,Math.min(rect.top,a.top+a.height-rect.height))+'px';
  }
  // 내용이 늦게 채워지거나 크기가 바뀌어도 네 면이 영역 안에 있도록 다시 보정합니다.
  const watched=new WeakSet();
  function watchSize(dialog){
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>keepInViewport(dialog));
    if(typeof ResizeObserver!=='function'||watched.has(dialog))return;
    watched.add(dialog);
    new ResizeObserver(()=>{if(dialog.open&&!drag)keepInViewport(dialog);}).observe(dialog);
  }
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    if(modalIds.has(this.id)||this.classList.contains('search-calendar'))return nativeShowModal.call(this);
    if(this.open){this.classList.remove('popup-flash');void this.offsetWidth;this.classList.add('popup-flash');return;}
    this.classList.remove('popup-flash');
    this.classList.add('popup-floating');
    this.show();
    cascade(this);
  };
  document.addEventListener('animationend',event=>{if(event.target.classList)event.target.classList.remove('popup-flash');},true);
  document.addEventListener('close',event=>{if(event.target.classList)event.target.classList.remove('popup-flash');},true);
  // 표 안에서는 창 이동 대신 브라우저의 텍스트 선택을 허용합니다.
  const interactive='table,button,input,select,textarea,a,label,summary,[contenteditable=true]';
  function onScrollbarOrResizeGrip(event,dialog){
    const el=event.target;
    if(el.clientWidth&&el.offsetWidth>el.clientWidth&&event.offsetX>=el.clientWidth)return true;
    if(el.clientHeight&&el.offsetHeight>el.clientHeight&&event.offsetY>=el.clientHeight)return true;
    const rect=dialog.getBoundingClientRect();
    return event.clientX>rect.right-20&&event.clientY>rect.bottom-20;
  }
  let drag=null;
  document.addEventListener('pointerdown',event=>{
    if(event.button>0||!event.target.closest)return;
    const dialog=event.target.closest('dialog.popup-floating[open]');
    if(!dialog||event.target.closest(interactive)||onScrollbarOrResizeGrip(event,dialog))return;
    stack+=1;dialog.style.zIndex=String(stack);
    if(dialog.classList.contains('dialog-expanded'))return;
    const rect=dialog.getBoundingClientRect();
    drag={dialog,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
    event.preventDefault();
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag)return;
    const a=area();
    const rect=drag.dialog.getBoundingClientRect();
    drag.dialog.style.left=Math.max(a.left,Math.min(event.clientX-drag.dx,a.left+a.width-rect.width))+'px';
    drag.dialog.style.top=Math.max(a.top,Math.min(event.clientY-drag.dy,a.top+a.height-rect.height))+'px';
  },true);
  document.addEventListener('pointerup',()=>{drag=null;},true);
  // 팝업을 더블클릭하면 대시보드 영역 중앙으로 이동합니다.
  document.addEventListener('dblclick',event=>{
    if(!event.target.closest)return;
    const dialog=event.target.closest('dialog.popup-floating[open]');
    if(!dialog||dialog.classList.contains('dialog-expanded')||event.target.closest(interactive)||onScrollbarOrResizeGrip(event,dialog))return;
    const a=area();
    const rect=dialog.getBoundingClientRect();
    dialog.style.left=Math.max(a.left,a.left+(a.width-rect.width)/2)+'px';
    dialog.style.top=Math.max(a.top,a.top+(a.height-rect.height)/2)+'px';
    stack+=1;dialog.style.zIndex=String(stack);
  },true);
  if(typeof addEventListener==='function')addEventListener('resize',()=>{publishArea();document.querySelectorAll('dialog.popup-floating[open]').forEach(keepInViewport);});
  if(typeof MutationObserver==='function'&&typeof document.getElementById==='function'){
    const watchLayout=()=>{const layout=document.querySelector('.app-layout');if(layout)new MutationObserver(publishArea).observe(layout,{attributes:true,attributeFilter:['class','style']});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchLayout);else watchLayout();
  }
})();