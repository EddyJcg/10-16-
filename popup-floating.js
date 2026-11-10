'use strict';
(function(){
  // 확인·상세·달력처럼 상위 팝업 위에 겹쳐 뜨는 창은 기존처럼 모달로 유지합니다.
  const modalIds=new Set(['sales-register-confirm-dialog','receipt-import-missing-dialog','receipt-details-dialog','detail-dialog','vendor-option-dialog','print-settings-dialog']);
  let stack=4;
  const viewW=()=>typeof innerWidth==='number'?innerWidth:Infinity;
  const viewH=()=>typeof innerHeight==='number'?innerHeight:Infinity;
  // 사이드 메뉴를 제외한 대시보드 영역입니다. 팝업은 이 영역 안에서만 배치됩니다.
  function area(dialog){
    const doc=dialog&&dialog.ownerDocument;
    if(doc&&doc!==document){const w=doc.defaultView;return {left:0,top:0,width:w.innerWidth,height:w.innerHeight};}
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
    const doc=dialog.ownerDocument||document;
    if(doc===document)publishArea();
    const a=area(dialog);
    const index=[...doc.querySelectorAll('dialog.popup-floating[open]')].filter(d=>d!==dialog).length%10;
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
  }
  // 브라우저 밖까지 떠 있을 수 있도록 Document Picture-in-Picture 창 하나에 팝업들을 모아 띄웁니다.
  // 지원하지 않거나 창 열기가 거절되면 기존처럼 메인 화면에 띄웁니다.
  const pipApi=typeof window!=='undefined'?window.documentPictureInPicture:undefined;
  const pipSize={width:900,height:640};
  let pipWin=null,pipRequest=null;
  const pipQueue=[];
  function showInMain(dialog){dialog.show();cascade(dialog);}
  // 열린 상태의 dialog를 다른 문서로 옮기면 열림 상태가 달라질 수 있으므로 닫았다가 다시 엽니다.
  function moveDialog(dialog,container){
    const wasOpen=dialog.open;
    container.append(dialog);
    if(wasOpen)dialog.close();
    dialog.show();
  }
  function showInPip(dialog){
    moveDialog(dialog,pipWin.document.body);
    cascade(dialog);
  }
  function attachPip(win){
    pipWin=win;
    const doc=win.document;
    doc.documentElement.className=document.documentElement.className;
    for(const node of document.querySelectorAll('link[rel="stylesheet"],style')){
      const copy=node.cloneNode(true);
      if(copy.tagName==='LINK')copy.href=node.href;
      doc.head.append(copy);
    }
    bindInteractions(doc);
    // 창이 닫히면 열려 있던 팝업을 메인 화면으로 되돌려 계속 열어 둡니다.
    win.addEventListener('pagehide',()=>{
      pipWin=null;
      for(const el of [...doc.querySelectorAll('dialog.popup-floating[open]')]){
        moveDialog(el,document.body);
        cascade(el);
      }
    });
    for(const el of [...document.querySelectorAll('dialog.popup-floating[open]')])showInPip(el);
    win.focus?.();
  }
  function openFloating(dialog){
    if(pipWin){showInPip(dialog);return;}
    if(!pipApi||typeof pipApi.requestWindow!=='function'){showInMain(dialog);return;}
    pipQueue.push(dialog);
    if(pipRequest)return;
    pipRequest=pipApi.requestWindow(pipSize).then(win=>{
      pipRequest=null;
      attachPip(win);
      pipQueue.splice(0).forEach(showInPip);
    },()=>{
      pipRequest=null;
      pipQueue.splice(0).forEach(showInMain);
    });
  }
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    if(modalIds.has(this.id)||this.classList.contains('search-calendar'))return nativeShowModal.call(this);
    if(this.open){this.classList.remove('popup-flash');void this.offsetWidth;this.classList.add('popup-flash');return;}
    this.classList.remove('popup-flash');
    this.classList.add('popup-floating');
    openFloating(this);
  };
  function bindInteractions(doc){
  doc.addEventListener('animationend',event=>{if(event.target.classList)event.target.classList.remove('popup-flash');},true);
  doc.addEventListener('close',event=>{if(event.target.classList)event.target.classList.remove('popup-flash');},true);
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
  doc.addEventListener('pointerdown',event=>{
    if(event.button>0||!event.target.closest)return;
    const dialog=event.target.closest('dialog.popup-floating[open]');
    if(!dialog||event.target.closest(interactive)||onScrollbarOrResizeGrip(event,dialog))return;
    stack+=1;dialog.style.zIndex=String(stack);
    if(dialog.classList.contains('dialog-expanded'))return;
    const rect=dialog.getBoundingClientRect();
    drag={dialog,pointerId:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
    // 포인터 캡처를 걸어야 브라우저 콘텐츠 영역 밖(위쪽 메뉴 쪽)으로 나가도 이동이 이어집니다.
    try{event.target.setPointerCapture?.(event.pointerId);}catch{}
    event.preventDefault();
  },true);
  doc.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.dialog.style.left=(event.clientX-drag.dx)+'px';
    drag.dialog.style.top=(event.clientY-drag.dy)+'px';
  },true);
  const endDrag=event=>{if(drag&&event.pointerId===drag.pointerId)drag=null;};
  doc.addEventListener('pointerup',endDrag,true);
  doc.addEventListener('pointercancel',endDrag,true);
  // 팝업을 더블클릭하면 대시보드 영역 중앙으로 이동합니다.
  doc.addEventListener('dblclick',event=>{
    if(!event.target.closest)return;
    const dialog=event.target.closest('dialog.popup-floating[open]');
    if(!dialog||dialog.classList.contains('dialog-expanded')||event.target.closest(interactive)||onScrollbarOrResizeGrip(event,dialog))return;
    const a=area(dialog);
    const rect=dialog.getBoundingClientRect();
    dialog.style.left=Math.max(a.left,a.left+(a.width-rect.width)/2)+'px';
    dialog.style.top=Math.max(a.top,a.top+(a.height-rect.height)/2)+'px';
    stack+=1;dialog.style.zIndex=String(stack);
  },true);
  }
  bindInteractions(document);
  if(typeof addEventListener==='function')addEventListener('resize',publishArea);
  if(typeof MutationObserver==='function'&&typeof document.getElementById==='function'){
    const watchLayout=()=>{const layout=document.querySelector('.app-layout');if(layout)new MutationObserver(publishArea).observe(layout,{attributes:true,attributeFilter:['class','style']});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchLayout);else watchLayout();
  }
})();