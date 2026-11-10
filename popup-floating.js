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
  }
  // 팝업마다 별도 창(window.open)에 띄워 브라우저 탭·주소창 위쪽까지 옮길 수 있게 합니다.
  // 창을 열 수 없으면(팝업 차단 등) 기존처럼 메인 화면에 띄웁니다.
  const popupWindows=new Map();
  const closeLinked=new WeakSet();
  const mirrored=[];
  // 페이지 종료 계열 이벤트는 자식 창이 닫힐 때 메인 앱 정리 로직을 실행시키므로 복제하지 않습니다.
  const noMirror=new Set(['pagehide','unload','beforeunload','beforeprint']);
  const childWindows=()=>[...popupWindows.values()].filter(w=>!w.closed);
  const scopeTarget=(scope,win)=>scope==='document'?win.document:win;
  function attachEntry(entry,win){scopeTarget(entry.scope,win).addEventListener(entry.type,entry.fn,entry.opts);}
  function mirrorListeners(scope,target){
    const add=target.addEventListener,remove=target.removeEventListener;
    if(typeof add!=='function')return;
    target.addEventListener=function(type,fn,opts){
      add.call(target,type,fn,opts);
      if(noMirror.has(type))return;
      const entry={scope,type,fn,opts};
      mirrored.push(entry);
      childWindows().forEach(w=>attachEntry(entry,w));
    };
    if(typeof remove!=='function')return;
    target.removeEventListener=function(type,fn,opts){
      remove.call(target,type,fn,opts);
      for(let i=mirrored.length-1;i>=0;i--){
        const entry=mirored[i];
        if(entry.scope!==scope||entry.type!==type||entry.fn!==fn)continue;
        mirored.splice(i,1);
        childWindows().forEach(w=>scopeTarget(scope,w).removeEventListener(type,fn,opts));
      }
    };
  }
  // 팝업 안 요소는 자식 창 문서로 옮겨지므로 메인 문서의 조회가 자식 창까지 찾도록 합니다.
  function extendLookups(){
    const getById=document.getElementById,query=document.querySelector,queryAll=document.querySelectorAll;
    if(typeof getById==='function')document.getElementById=function(id){let el=getById.call(document,id);for(const w of childWindows()){if(el)break;el=w.document.getElementById(id);}return el;};
    if(typeof query==='function')document.querySelector=function(sel){let el=query.call(document,sel);for(const w of childWindows()){if(el)break;el=w.document.querySelector(sel);}return el;};
    if(typeof queryAll==='function')document.querySelectorAll=function(sel){const all=[...queryAll.call(document,sel)];childWindows().forEach(w=>all.push(...w.document.querySelectorAll(sel)));return all;};
  }
  function popupSize(dialog){
    const css=typeof getComputedStyle==='function'?getComputedStyle(dialog):null;
    const width=parseFloat(css&&css.width),height=parseFloat(css&&css.height);
    return {width:width>0?width:900,height:height>0?height:640};
  }
  function openChildWindow(dialog){
    if(typeof window==='undefined'||typeof window.open!=='function')return null;
    const size=popupSize(dialog),offset=popupWindows.size%10;
    const left=Math.round((window.screenX||0)+40+offset*36),top=Math.round((window.screenY||0)+80+offset*36);
    return window.open('about:blank','_blank',`popup=yes,width=${Math.round(size.width+16)},height=${Math.round(size.height+40)},left=${left},top=${top},resizable=yes,scrollbars=yes`);
  }
  function prepareChild(win,dialog){
    const doc=win.document;
    const heading=dialog.querySelector?dialog.querySelector('h1,h2,h3'):null;
    doc.title=(heading&&heading.textContent.trim())||document.title;
    doc.documentElement.lang=document.documentElement.lang||'ko';
    for(const node of document.head.querySelectorAll('link[rel="stylesheet"],style')){
      const copy=node.cloneNode(true);
      if(copy.tagName==='LINK')copy.href=node.href;
      doc.head.append(copy);
    }
    const neutral=doc.createElement('style');
    neutral.textContent='html,body{margin:0;height:100%;overflow:hidden}dialog.popup-floating{position:fixed!important;inset:0!important;margin:0!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important}';
    doc.head.append(neutral);
    for(const entry of mirrored)attachEntry(entry,win);
  }
  function returnDialogs(win){
    for(const [dialog,w] of [...popupWindows])if(w===win)popupWindows.delete(dialog);
    for(const el of [...win.document.querySelectorAll('dialog')]){
      const wasOpen=el.open;
      document.body.append(el);
      if(wasOpen&&!el.open)el.show();
      if(el.classList.contains('popup-floating'))cascade(el);
    }
  }
  function linkClose(dialog){
    if(closeLinked.has(dialog))return;
    closeLinked.add(dialog);
    dialog.addEventListener('close',()=>{const w=popupWindows.get(dialog);if(w&&!w.closed)w.close();});
  }
  function openFloating(dialog){
    const win=openChildWindow(dialog);
    if(!win){dialog.show();cascade(dialog);return;}
    linkClose(dialog);
    prepareChild(win,dialog);
    popupWindows.set(dialog,win);
    win.addEventListener('pagehide',()=>returnDialogs(win));
    win.document.body.append(dialog);
    dialog.show();
    win.focus();
  }
  // 지금 포커스가 있는 팝업 창의 문서를 돌려줍니다. 확인창 같은 모달도 그 창 안에 뜨도록 합니다.
  function focusedChildDocument(){
    const win=childWindows().find(w=>{try{return w.document.hasFocus();}catch{return false;}});
    return win?win.document:null;
  }
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    if(modalIds.has(this.id)||this.classList.contains('search-calendar')){
      const target=focusedChildDocument()||document;
      if(this.ownerDocument&&this.ownerDocument!==target)target.body.append(this);
      return nativeShowModal.call(this);
    }
    if(this.open){this.classList.remove('popup-flash');void this.offsetWidth;this.classList.add('popup-flash');return;}
    this.classList.remove('popup-flash');
    this.classList.add('popup-floating');
    openFloating(this);
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
    drag={dialog,pointerId:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
    // 포인터 캡처를 걸어야 브라우저 콘텐츠 영역 밖(위쪽 메뉴 쪽)으로 나가도 이동이 이어집니다.
    try{event.target.setPointerCapture?.(event.pointerId);}catch{}
    event.preventDefault();
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.dialog.style.left=(event.clientX-drag.dx)+'px';
    drag.dialog.style.top=(event.clientY-drag.dy)+'px';
  },true);
  const endDrag=event=>{if(drag&&event.pointerId===drag.pointerId)drag=null;};
  document.addEventListener('pointerup',endDrag,true);
  document.addEventListener('pointercancel',endDrag,true);
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
  if(typeof addEventListener==='function')addEventListener('resize',publishArea);
  if(typeof MutationObserver==='function'&&typeof document.getElementById==='function'){
    const watchLayout=()=>{const layout=document.querySelector('.app-layout');if(layout)new MutationObserver(publishArea).observe(layout,{attributes:true,attributeFilter:['class','style']});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchLayout);else watchLayout();
  }
  // 이 파일 뒤에 로드되는 앱 스크립트의 리스너와 조회는 팝업 창에서도 동작하도록 복제·대체합니다.
  mirrorListeners('document',document);
  if(typeof window!=='undefined')mirrorListeners('window',window);
  extendLookups();
})();