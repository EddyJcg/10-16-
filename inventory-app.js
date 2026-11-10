'use strict';
const $ = id => document.getElementById(id);
function stockLedgerManaged(item) {
  return item.quantity_management_disabled!==true&&item.value_management_disabled!==true;
}
let minimizedDialogs=new Map(),dialogInteractionsInstalled=false;
function removeMinimizedDialog(dialog){
  const restoreButton=minimizedDialogs.get(dialog);
  if(restoreButton){
    restoreButton.remove();
    minimizedDialogs.delete(dialog);
  }
  const tray=document.getElementById('minimized-dialogs');
  if(tray)tray.hidden=minimizedDialogs.size===0;
}
function clearMinimizedDialogs(){
  minimizedDialogs.forEach((button,dialog)=>{
    clearTimeout(dialog.__minimizeTimeout);
    dialog.__minimized=false;
    dialog.classList.remove('dialog-minimizing');
    dialog.classList.remove('dialog-expanded');
    button.remove();
  });
  minimizedDialogs.clear();
  const tray=document.getElementById('minimized-dialogs');
  if(tray)tray.hidden=true;
}
function installDialogInteractions(){
  if(dialogInteractionsInstalled)return;
  dialogInteractionsInstalled=true;
  const initializedDialogs=new WeakSet();
  const installWindowControls=dialog=>{
    if(initializedDialogs.has(dialog))return;
    initializedDialogs.add(dialog);
    const closeButton=dialog.querySelector('.close');
    const host=dialog.querySelector('.dialog-header,.calendar-title,[role="toolbar"]')||closeButton?.parentElement||dialog;
    const controls=document.createElement('span');
    controls.className='dialog-window-controls';
    const minimizeButton=document.createElement('button');
    minimizeButton.type='button';minimizeButton.className='dialog-window-button dialog-minimize-button';
    minimizeButton.setAttribute('aria-label','팝업 축소');minimizeButton.title='축소';
    const minimizeIcon=document.createElement('span');
    minimizeIcon.className='dialog-minimize-icon';minimizeIcon.setAttribute('aria-hidden','true');
    minimizeButton.appendChild(minimizeIcon);
    const expandButton=document.createElement('button');
    expandButton.type='button';expandButton.className='dialog-window-button dialog-expand-button';
    expandButton.setAttribute('aria-label','전체화면 확대');expandButton.title='전체화면 확대';
    const expandIcon=document.createElement('span');
    expandIcon.className='dialog-expand-icon';expandIcon.setAttribute('aria-hidden','true');
    expandButton.appendChild(expandIcon);
    const resetButton=document.createElement('button');
    resetButton.type='button';resetButton.className='dialog-window-button dialog-reset-button';
    resetButton.setAttribute('aria-label','팝업 크기와 위치 초기화');resetButton.title='크기와 위치 초기화';
    const resetIcon=document.createElement('span');
    resetIcon.className='dialog-reset-icon';resetIcon.setAttribute('aria-hidden','true');
    resetButton.appendChild(resetIcon);
    controls.appendChild(minimizeButton);controls.appendChild(expandButton);controls.appendChild(resetButton);
    if(closeButton?.parentNode)closeButton.parentNode.insertBefore(controls,closeButton);
    else host.appendChild(controls);
    const title=dialog.querySelector('h1,h2,h3')?.textContent.trim()
      ||(dialog.getAttribute('aria-label')||'').trim()||'팝업창';
    minimizeButton.addEventListener('click',()=>{
      if(!dialog.open||dialog.__minimized)return;
      dialog.__minimized=true;
      const tray=document.getElementById('minimized-dialogs')||document.createElement('div');
      if(!tray.id){
        tray.id='minimized-dialogs';tray.className='minimized-dialogs';tray.hidden=true;
        tray.setAttribute('role','region');tray.setAttribute('aria-label','축소된 팝업');
        document.body.appendChild(tray);
      }
      const restoreButton=document.createElement('button');
      restoreButton.type='button';restoreButton.className='minimized-dialog-button';
      restoreButton.textContent=title+' 복원';restoreButton.setAttribute('aria-label',title+' 팝업 복원');
      restoreButton.addEventListener('click',()=>{
        removeMinimizedDialog(dialog);dialog.__minimized=false;
        dialog.classList.remove('dialog-minimizing');
        if(!dialog.open)dialog.showModal();
      });
      minimizedDialogs.set(dialog,restoreButton);tray.appendChild(restoreButton);tray.hidden=false;
      dialog.classList.add('dialog-minimizing');
      dialog.__minimizeTimeout=setTimeout(()=>{
        dialog.__minimizeTimeout=null;
        if(dialog.open&&dialog.__minimized)dialog.close('minimized');
        dialog.classList.remove('dialog-minimizing');
      },180);
    });
    expandButton.addEventListener('click',()=>{
      if(dialog.classList.contains('dialog-expanded')){
        dialog.classList.remove('dialog-expanded');
        const previous=dialog.__expandedStyle||{};
        Object.entries(previous).forEach(([property,[value,priority]])=>{
          if(value)dialog.style.setProperty(property,value,priority);
          else dialog.style.removeProperty(property);
        });
        dialog.__expandedStyle=null;
        expandButton.setAttribute('aria-label','전체화면 확대');
        expandButton.title='전체화면 확대';expandButton.setAttribute('aria-pressed','false');
        return;
      }
      const properties=['width','height','max-width','max-height','left','top','transform','margin','border-radius'];
      dialog.__expandedStyle=Object.fromEntries(properties.map(property=>[
        property,[dialog.style.getPropertyValue(property),dialog.style.getPropertyPriority(property)]
      ]));
      properties.forEach(property=>dialog.style.removeProperty(property));
      dialog.classList.add('dialog-expanded');
      expandButton.setAttribute('aria-label','팝업 크기 복원');
      expandButton.title='원래 크기로 복원';expandButton.setAttribute('aria-pressed','true');
    });
    resetButton.addEventListener('click',()=>{
      if(dialog.classList.contains('dialog-expanded'))expandButton.click();
      if(dialog.id){
        try{window.localStorage.removeItem('inventory-dialog-size-'+dialog.id);}
        catch{notify('팝업 설정을 초기화하지 못했습니다.',true);return;}
      }
      ['width','height','max-width','max-height','left','top','transform','margin','border-radius'].forEach(property=>dialog.style.removeProperty(property));
      dialog.__expandedStyle=null;
    });
    dialog.addEventListener('close',()=>{
      clearTimeout(dialog.__minimizeTimeout);dialog.__minimizeTimeout=null;
      dialog.classList.remove('dialog-minimizing');
      if(!dialog.__minimized){
        removeMinimizedDialog(dialog);
        if(dialog.classList.contains('dialog-expanded'))expandButton.click();
      }
    });
  };
  const installDialog=dialog=>{
    installWindowControls(dialog);
    const header=dialog.querySelector('.dialog-header,.calendar-title');
    const sizeStorageKey=dialog.id?'inventory-dialog-size-'+dialog.id:null;
    if(sizeStorageKey){
      try{
        const saved=JSON.parse(window.localStorage.getItem(sizeStorageKey)||'null');
        if(Number.isFinite(saved?.width)&&saved.width>0&&Number.isFinite(saved?.height)&&saved.height>0){
          const area=window.popupArea?window.popupArea():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
          const width=Math.min(saved.width,Math.max(100,Math.min(window.innerWidth-32,area.width*.95)));
          const height=Math.min(saved.height,Math.max(100,Math.min(window.innerHeight-32,area.height*.95)));
          dialog.style.setProperty('width',width+'px','important');
          dialog.style.setProperty('height',height+'px','important');
        }
      }catch{}
    }
    const saveSize=()=>{
      if(!sizeStorageKey)return;
      const rect=dialog.getBoundingClientRect();
      try{window.localStorage.setItem(sizeStorageKey,JSON.stringify({width:rect.width,height:rect.height}));}catch{}
    };
    let activePointerId=null,interaction=null;
    const pinToRect=rect=>{
      dialog.style.left=rect.left+'px';dialog.style.top=rect.top+'px';dialog.style.transform='none';
    };
    const finish=event=>{
      if(event.pointerId!==activePointerId)return;
      const completed=interaction;
      activePointerId=null;interaction=null;
      if(completed&&completed.type!=='drag')saveSize();
    };
    const move=event=>{
      if(event.pointerId!==activePointerId||!interaction)return;
      if(interaction.type==='drag'){
        const dragArea=window.popupArea?window.popupArea():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
        const left=Math.max(dragArea.left,Math.min(dragArea.left+dragArea.width-interaction.width,event.clientX-interaction.offsetX));
        const top=Math.max(dragArea.top,Math.min(dragArea.top+dragArea.height-interaction.height,event.clientY-interaction.offsetY));
        dialog.style.left=left+'px';dialog.style.top=top+'px';
        return;
      }
      const dx=event.clientX-interaction.x,dy=event.clientY-interaction.y;
      const area=window.popupArea?window.popupArea():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
      const maxWidth=Math.max(100,Math.min(area.width*.95,interaction.type==='left'?interaction.right-area.left:area.left+area.width-interaction.left));
      const maxHeight=Math.max(100,Math.min(area.height*.95,interaction.type==='top'?interaction.bottom-area.top:area.top+area.height-interaction.top));
      const width=Math.max(Math.min(280,maxWidth),Math.min(maxWidth,interaction.width+(interaction.type==='left'?-dx:interaction.type==='right'||interaction.type==='bottom-right'?dx:0)));
      const height=Math.max(Math.min(180,maxHeight),Math.min(maxHeight,interaction.height+(interaction.type==='top'?-dy:interaction.type==='bottom'||interaction.type==='bottom-right'?dy:0)));
      if(interaction.type==='left')dialog.style.left=(interaction.right-width)+'px';
      if(interaction.type==='top')dialog.style.top=(interaction.bottom-height)+'px';
      dialog.style.setProperty('width',width+'px','important');
      dialog.style.setProperty('height',height+'px','important');
    };
    const begin=(event,type)=>{
      if(!dialog.open||event.button!==0)return;
      event.preventDefault();
      activePointerId=event.pointerId;const rect=dialog.getBoundingClientRect();
      pinToRect(rect);
      if(type==='drag')interaction={type,width:rect.width||0,height:rect.height||0,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top};
      else{
        dialog.style.setProperty('width',rect.width+'px','important');
        dialog.style.setProperty('height',rect.height+'px','important');
        interaction={type,width:rect.width,height:rect.height,left:rect.left,top:rect.top,
          right:rect.right??rect.left+rect.width,bottom:rect.bottom??rect.top+rect.height,x:event.clientX,y:event.clientY};
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    if(header){
      header.addEventListener('pointerdown',event=>{
        if(event.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
        begin(event,'drag');
      });
      header.addEventListener('pointermove',move);
      header.addEventListener('pointerup',finish);
      header.addEventListener('pointercancel',finish);
    }
    const resizeHandle=document.createElement('button');
    resizeHandle.type='button';resizeHandle.className='dialog-resize-handle';
    resizeHandle.setAttribute('aria-label','창 크기 조절');
    resizeHandle.addEventListener('pointerdown',event=>begin(event,'bottom-right'));
    resizeHandle.addEventListener('pointermove',move);
    resizeHandle.addEventListener('pointerup',finish);
    resizeHandle.addEventListener('pointercancel',finish);
    dialog.append(resizeHandle);
    [['top','위쪽'],['right','오른쪽'],['bottom','아래쪽'],['left','왼쪽']].forEach(([side,label])=>{
      const edge=document.createElement('button');
      edge.type='button';edge.className='dialog-resize-edge dialog-resize-'+side;
      edge.setAttribute('aria-label','창 '+label+' 가장자리 크기 조절');
      edge.addEventListener('pointerdown',event=>begin(event,side));
      edge.addEventListener('pointermove',move);
      edge.addEventListener('pointerup',finish);
      edge.addEventListener('pointercancel',finish);
      dialog.append(edge);
    });
  };
  document.querySelectorAll('dialog').forEach(installDialog);
  if(typeof MutationObserver!=='undefined'&&document.body){
    const observer=new MutationObserver(records=>records.forEach(record=>{
      if(record.type==='childList')record.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(node.matches?.('dialog'))installDialog(node);
        node.querySelectorAll?.('dialog').forEach(installDialog);
      });
      if(record.type==='attributes'&&record.target.open&&record.target.__minimized){
        record.target.__minimized=false;
        record.target.classList.remove('dialog-minimizing');
        removeMinimizedDialog(record.target);
      }
    }));
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  }
}
function installPopupTableTools(){
  const tableStates=new WeakMap();
  function columnKey(header,index,duplicates){
    const clone=header.cloneNode(true);
    clone.querySelectorAll('button').forEach(button=>button.remove());
    const label=clone.textContent.trim().replace(/\s+/g,' ').toLocaleLowerCase('ko');
    const base=label||'column-'+index,occurrence=duplicates.get(base)||0;
    duplicates.set(base,occurrence+1);
    return base+'#'+occurrence;
  }
  function moveCells(row,keys){
    const cells=[...(row.cells||row.children)],byKey=new Map(cells.map((cell,index)=>[cell.dataset.popupColumnKey||keys[index],cell]));
    const order=keys.filter(key=>byKey.has(key));
    if(order.length!==cells.length)return;
    const current=cells.map((cell,index)=>cell.dataset.popupColumnKey||keys[index]);
    if(current.every((key,index)=>key===order[index]))return;
    order.forEach(key=>row.appendChild(byKey.get(key)));
  }
  function prepareTable(dialog,table,index){
    const header=table.tHead?.rows[0];
    if(!header)return;
    let state=tableStates.get(table);
    if(!state){
      const duplicates=new Map(),defaultKeys=[...header.cells].map((cell,column)=>columnKey(cell,column,duplicates));
      const storageKey='inventory-popup-column-order-'+(dialog.id||'dialog')+'-'+(table.id||index);
      let order=[];
      try{
        const saved=JSON.parse(window.localStorage.getItem(storageKey)||'null');
        if(Array.isArray(saved)&&saved.every(key=>typeof key==='string'))order=saved;
      }catch{}
      state={defaultKeys,order,storageKey};
      tableStates.set(table,state);
      table.addEventListener('dragstart',event=>{
        const cell=event.target.closest('th');
        if(!cell||!table.tHead?.contains(cell)||event.target.closest('button,input,select')){event.preventDefault();return;}
        state.draggedKey=cell.dataset.popupColumnKey;
        if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',state.draggedKey);}
      });
      table.addEventListener('dragover',event=>{if(state.draggedKey)event.preventDefault();});
      table.addEventListener('drop',event=>{
        if(!state.draggedKey)return;
        const currentHeader=table.tHead?.rows[0],target=event.target.closest('th');
        if(!target||!currentHeader?.contains(target)){state.draggedKey='';return;}
        event.preventDefault();
        const from=state.order.indexOf(state.draggedKey),to=state.order.indexOf(target.dataset.popupColumnKey);
        if(from>=0&&to>=0&&from!==to){
          const [key]=state.order.splice(from,1);state.order.splice(to,0,key);
          applyOrder(table,state);
          try{window.localStorage.setItem(state.storageKey,JSON.stringify(state.order));}catch{}
          table.dispatchEvent(new CustomEvent('columnorderchange',{detail:{from,to}}));
        }
        state.draggedKey='';
      });
      table.addEventListener('dragend',()=>{state.draggedKey='';});
    }
    [...header.cells].forEach((cell,column)=>{
      if(!cell.dataset.popupColumnKey)cell.dataset.popupColumnKey=state.defaultKeys[column]||'column-'+column+'#0';
      cell.draggable=true;
    });
    const keys=[...header.cells].map(cell=>cell.dataset.popupColumnKey);
    [...table.tBodies].flatMap(body=>[...body.rows]).forEach(row=>{
      if(row.cells.length===1&&row.cells[0].colSpan>1)return;
      [...row.cells].forEach((cell,column)=>{if(!cell.dataset.popupColumnKey)cell.dataset.popupColumnKey=state.defaultKeys[column]||'column-'+column+'#0';});
      moveCells(row,keys);
    });
    const colgroup=table.querySelector('colgroup');
    if(colgroup){
      [...colgroup.children].forEach((column,columnIndex)=>{if(!column.dataset.popupColumnKey)column.dataset.popupColumnKey=state.defaultKeys[columnIndex]||'column-'+columnIndex+'#0';});
      moveCells(colgroup,keys);
    }
    const savedOrder=state.order.filter(key=>keys.includes(key));
    keys.forEach(key=>{if(!savedOrder.includes(key))savedOrder.push(key);});
    const orderChanged=savedOrder.some((key,column)=>key!==keys[column]);
    state.order=savedOrder;
    if(orderChanged)applyOrder(table,state);
  }
  function applyOrder(table,state){
    const header=table.tHead?.rows[0];
    if(!header)return;
    moveCells(header,state.order);
    const keys=[...header.cells].map(cell=>cell.dataset.popupColumnKey);
    [...table.tBodies].flatMap(body=>[...body.rows]).forEach(row=>{
      if(row.cells.length===1&&row.cells[0].colSpan>1)return;
      moveCells(row,keys);
    });
    const colgroup=table.querySelector('colgroup');
    if(colgroup)moveCells(colgroup,keys);
    [...table.querySelectorAll('.column-resizer')].forEach((handle,column)=>{handle.dataset.column=String(column);});
  }
  function prepareDialog(dialog){
    const tables=[...dialog.querySelectorAll('table')];
    tables.forEach((table,index)=>prepareTable(dialog,table,index));
  }
  function initialize(){document.querySelectorAll('dialog').forEach(prepareDialog);}
  initialize();
  if(typeof MutationObserver!=='undefined'&&document.body){
    const observer=new MutationObserver(initialize);
    observer.observe(document.body,{childList:true,subtree:true});
  }
}
const number = value => Number(value || 0).toLocaleString('ko-KR',{maximumFractionDigits:2});
const money = number;
const MODE_LABELS = {opening:['기초재고','기초','기초일자'],receipt:['입고등록','입고','입고일자'],issue:['출고등록','출고','출고일자']};
let client,currentUser = null,items = [],agedStock = [],assetClassifications=[],authGeneration = 0;
let loadPromise = null,reloadQueued = false,syncTimer = null,salesSyncTimer=null,busy = false,exporting = false;
let appliedDateProductIds = null,appliedSupplier = '',searching = false;
let productListDateIds = null,productListSupplier = '',productListQuery = '',productListSearching = false;
let movementListRows = [],movementListLoading = false;
let movementListKind='';
function movementListLabel(){return movementListKind==='opening'?'기초재고 내역':movementListKind==='receipt'?'입고 현황':movementListKind==='issue'?'출고 내역':'입출고 내역';}
let salesOrders = [],salesDraftLines=[],salesOrdersLoading = false,salesOrderSaving = false;
let salesDraftSequence=0,salesDraftGroupId='';
let salesRegisterQuery='',salesRegisterSearched=false,salesRegisterVisibleOrders=[],salesRegisterTargetOrderIds=[];
let purchaseOrders=[],purchaseOrderLines=[],purchaseReceipts=[],purchaseDraftLines=[],purchaseOrderVendors=[],purchaseOrderVendorsLoaded=false,purchaseLoading=false,purchaseSaving=false,purchaseSyncTimer=null,purchaseOrderSaved=false;
let receivingPurchaseLineId='',receivingPurchaseRequestId='';
let appliedSalesStatusFilters={startDate:'',endDate:'',orderType:'',salesStatus:'',query:''},appliedSalesQueryFilters={startDate:'',endDate:'',orderType:'',salesStatus:'',query:'',orderNumber:'',vendorName:''},salesStatusUpdating=false;
let appliedSalesBalanceFilters={startDate:'',endDate:'',orderType:''};
const printMargins = {top:10,right:10,bottom:10,left:10};
let printMarginDrag = null,activePrintTarget='product-list';
const columnWidthDefaults={
  'current-stock':[120,140,160,150,120,120,110,110,90,120,140,150,150],
  'movement-list':[100,115,90,140,160,150,120,130,150,90,100,110,120,140,140,140,140,140,86]
};
let mode = 'opening',requestId = null,selectedCode = '',productLots = [],lotsGeneration = 0,productLotsReady = false;
let selectedProductInfoCode = '',productInfoDrafts=[],productInfoDraftSequence=0;
let editingProductInfoId='',editingAssetClassificationId='',editingSalesOrderId='',editingMovementId='';
let productInfoNewMode=false;
let ignoreMissingReceiptDetailsOnce=false;
function notify(text,error = false) { $('message').textContent = text; $('message').classList.toggle('error',error); }
function errorText(error) {
  const message = error?.message || '';
  const errors = {
    ACCOUNT_DISABLED:'사용이 중지되었거나 만료된 계정입니다. 관리자에게 문의하세요.',
    INSUFFICIENT_STOCK:'출고일자 기준으로 재고가 부족합니다. 최신 잔량과 출고수량을 확인하세요.',
    BACKDATE_CONFLICT:'이미 확정된 거래보다 앞선 날짜입니다. 과거 출고 원가를 바꾸지 않도록 거래를 날짜 순서대로 입력하세요.',
    OPENING_ALREADY_STARTED:'이 품목은 이미 거래가 시작되었습니다. 기초재고는 처음 한 번만 등록할 수 있습니다.',
    PRODUCT_DETAILS_CONFLICT:'같은 품번의 품목 정보가 다릅니다. 기존 품목을 선택하거나 다른 품번을 사용하세요.',
    PRODUCT_CODE_ALREADY_EXISTS:'이미 등록된 품번입니다. 다른 품번을 입력하세요.',
    PRODUCT_SPECIFICATION_ALREADY_EXISTS:'이미 등록된 규격입니다. 다른 규격을 입력하세요.',
    PRODUCT_INFO_ALREADY_ASSIGNED:'이미 지정된 품목정보는 변경할 수 없습니다. 미지정 항목만 추가 입력할 수 있습니다.',
    PRODUCT_INFO_REQUIRED:'품목정보를 입력해 주세요!',
    PRODUCT_NOT_FOUND:'출고할 품번을 목록에서 선택하세요.',
    REQUEST_CONFLICT:'같은 요청번호에 다른 내용이 들어 있습니다. 창을 다시 열어 확인하세요.',
    INVALID_INPUT:'날짜, 수량과 단가를 확인하세요. 미래 일자와 소수 수량은 사용할 수 없습니다.',
    INVALID_PRODUCT_DETAILS:'품목분류·품명 등 품목 정보를 확인하세요.',
    PRODUCT_HAS_LEDGER_HISTORY:'거래 이력이 있는 품목의 단위는 변경할 수 없습니다.',
    PRODUCT_USED_IN_PURCHASE:'해당 품목은 삭제할 수 없으니 이후 단계에서 처리된 내용을 삭제 하여 주시기 바랍니다.',
    PRODUCT_HAS_LINKED_SHIPMENTS:'수주 출고가 연결된 품목의 품명·규격은 변경할 수 없습니다.',
    SALES_ORDER_HAS_SHIPMENTS:'출고가 연결된 수주의 품목 정보·수량 또는 매출 완료 상태를 변경할 수 없습니다.',
    SALES_ORDER_QUANTITY_EXCEEDED:'출고수량이 해당 수주의 잔여 수량을 초과했거나 이미 매출 완료된 수주입니다.',
    MOVEMENT_NOT_FOUND:'수정할 거래 내역을 찾을 수 없습니다. 목록을 새로고침하세요.',
    PRODUCT_CLASSIFICATION_TYPE_REQUIRED:'품목자산분류의 재고자산종류를 먼저 설정하세요.',
    INVALID_PRODUCT_CODE:'품번을 입력하세요.',
    INVALID_SALES_ORDER:'수주일자·수주번호·수주형태·거래처와 수주 품목을 확인하세요.',
    INVALID_SALES_ORDER_LINE:'수주 품목의 품명, 단위, 수량, 단가와 납기일자를 확인하세요.',
    SALES_ORDER_LINE_NOT_FOUND:'수정할 수주 품목을 찾을 수 없습니다. 수주 목록을 새로고침하세요.',
    DUPLICATE_SALES_ORDER_LINE:'같은 수주 품목이 중복으로 전달되었습니다. 창을 새로고침하세요.',
    SALES_ORDER_STOPPED:'중단된 수주는 출고할 수 없습니다. 매출 상태를 진행으로 바꾸세요.',
    INVALID_SALES_STATUS:'매출 상태는 진행·완료·중단 중에서 선택하세요.',
    INVALID_SALES_ORDER_LINK:'출고에 연결할 수주번호를 확인하세요.',
    SALES_ORDER_NOT_FOUND:'연결할 수주를 찾을 수 없습니다. 수주 목록을 새로 확인하세요.',
    SALES_ORDER_PRODUCT_MISMATCH:'선택한 수주의 품명·규격·단위가 출고 품목과 다릅니다.',
    SHIPMENT_STATUS_LOCKED:'연결된 출고가 있는 수주는 누적 출고 수량에 따라 매출 상태가 자동 결정됩니다.',
    PRODUCT_CLASSIFICATION_REQUIRED:'품목 자산 분류를 선택하세요.',
    PRODUCT_CLASSIFICATION_TYPE_REQUIRED:'품목 자산 분류의 재고자산종류를 먼저 설정하세요.',
    QUANTITY_MANAGEMENT_DISABLED:'이 분류는 재고수량을 관리하지 않아 원자재 수불부에 등록할 수 없습니다.',
    CLASSIFICATION_TYPE_REQUIRED:'재고자산종류를 선택하세요.',
    CLASSIFICATION_NAME_EXISTS:'같은 품목자산분류가 이미 등록되어 있습니다.',
    CLASSIFICATION_PARENTHESES_NOT_ALLOWED:'품목자산분류 이름에는 괄호로 묶은 항목을 사용할 수 없습니다.',
    CLASSIFICATION_HAS_LEDGER_HISTORY:'거래 이력이 있는 분류는 재고수량관리 안함 설정을 변경할 수 없습니다. 기존 거래의 단가·금액은 분류를 바꿔도 수정되지 않습니다.',
    STOCK_LEDGER_DISABLED:'수량 또는 금액 관리 안함 품목은 발주 등록에서 입고 처리하세요.',
    INVALID_PURCHASE_ORDER:'발주번호·업체·발주일자·비고와 발주 품목을 확인하세요.',
    PURCHASE_ORDER_DATE_IN_PAST:'발주일자는 오늘 날짜보다 이전으로 설정할 수 없습니다.',
    PURCHASE_ORDER_NUMBER_EXHAUSTED:'해당 날짜의 발주번호 일련번호가 모두 사용되었습니다.',
    INVALID_PURCHASE_ORDER_LINE:'발주 품목의 품번, 수량, 단가, 납기예정일과 비고를 확인하세요.',
    PURCHASE_ORDER_NUMBER_EXISTS:'이미 사용 중인 발주번호입니다. 다른 발주번호를 입력하세요.',
    PURCHASE_ORDER_LINE_NOT_FOUND:'입고 처리할 발주 품목을 찾을 수 없습니다. 목록을 새로고침하세요.',
    PURCHASE_ORDER_CANCELLED:'취소된 발주는 입고할 수 없습니다.',
    PURCHASE_RECEIPT_EXCEEDS_ORDER:'입고수량이 발주 잔량을 초과합니다. 발주 현황을 새로고침하세요.',
    INVALID_PURCHASE_RECEIPT:'입고일자·수량·단가를 확인하세요.',
    REQUEST_ID_REUSED:'같은 요청번호로 다른 입고 내용을 전송했습니다. 입고 창을 다시 열어 시도하세요.',
    ACCESS_DENIED:'발주·입고를 저장할 권한이 없습니다. 로그인 상태와 계정 권한을 확인하세요.'
  };
  for (const [key,text] of Object.entries(errors)) if (message.includes(key)) return text;
  if (['PGRST205','PGRST202','42P01','42703'].includes(error?.code)) return 'DB 설정이 필요합니다. Supabase SQL Editor에서 supabase/fifo.sql, supabase/item-asset-classification.sql, supabase/edit-records.sql, supabase/vendor-management.sql, supabase/sales-order-vendor.sql, supabase/sales-order-groups.sql, supabase/sales-status-workflow.sql, supabase/procurement-schema.sql, supabase/classification-procurement-workflow.sql을 README.md 안내 순서대로 실행하세요.';
  return '요청을 완료하지 못했습니다. 네트워크와 로그인 상태를 확인하세요. 저장 응답이 끊겼다면 내역을 확인하거나 같은 내용으로 다시 저장하세요.';
}
function ensureMovementEditColumn(){
  const table=$('movement-list-table'),head=table?.tHead?.rows?.[0],columns=$('movement-list-columns');
  if(!head||!columns)return;
  if(head.cells.length===13){const header=document.createElement('th');header.textContent='관리';head.append(header);}
  if(columns.children.length===13)columns.append(document.createElement('col'));
}
function installMovementHistoryButton(){
  const save=$('save-movement'),footer=save.parentElement;
  if(!footer||document.getElementById('edit-existing-movement'))return;
  const button=document.createElement('button');
  button.id='edit-existing-movement';button.type='button';button.className='secondary';
  button.textContent='저장된 내역 수정';
  button.addEventListener('click',openMovementHistoryForEdit);
  footer.insertBefore(button,save);
  const bulkDelete=document.createElement('button');
  bulkDelete.id='bulk-delete-movement';bulkDelete.type='button';bulkDelete.className='secondary danger';bulkDelete.hidden=true;
  bulkDelete.textContent='일괄삭제';
  bulkDelete.addEventListener('click',async()=>{
    if(editingMovementId&&await revertReceipt(editingMovementId))closeMovement();
  });
  footer.insertBefore(bulkDelete,save);
}
async function showLongStock() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  $('long-stock-status').textContent='최신 재고를 불러오는 중…';renderLongStock();$('long-stock-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('long-stock-status').textContent='';}
  catch(error){if(generation===authGeneration)$('long-stock-status').textContent='최신 조회에 실패했습니다. 표시된 내역은 마지막 조회 결과입니다. '+errorText(error);}
}
async function showStockRisk() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  $('stock-risk-status').textContent='최신 재고를 불러오는 중…';renderStockRisk();$('stock-risk-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('stock-risk-status').textContent='';}
  catch(error){if(generation===authGeneration)$('stock-risk-status').textContent='최신 조회에 실패했습니다. 표시된 목록은 마지막 조회 결과입니다. '+errorText(error);}
}
function renderSalesOrders(){
  const body=$('sales-order-items');body.replaceChildren();
  if(!salesOrders.length){emptyRow(body,17,'저장된 수주가 없습니다.');return;}
  salesOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number,order.order_type,order.vendor_name||'',order.vendor_contact||'',order.product_name,order.specification,order.unit,
      number(order.quantity),money(order.unit_price),money(order.amount),String(order.due_date).slice(0,10),
      order.delivery_method,order.address,order.notes].forEach((value,index)=>row.append(makeCell(value,index===0||index===9||index===10||index===11)));
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent='수정';button.dataset.salesOrderId=order.id;
    action.append(button);row.append(action);
    body.append(row);
  });
}
function renderSalesDraftLines(){
  const body=$('sales-order-draft-items');body.replaceChildren();
  if(!salesDraftLines.length){emptyRow(body,8,'수주 품목을 추가하세요.');updateSalesOrderSaveButton();return;}
  salesDraftLines.forEach((line,index)=>{
    const row=document.createElement('tr');
    [line.product_name,line.specification,line.unit,number(line.quantity),money(line.unit_price),
      money(Number(line.quantity)*Number(line.unit_price)),line.due_date].forEach((value,col)=>row.append(makeCell(value,col===3||col===4||col===5)));
    const action=document.createElement('td'),checkbox=document.createElement('input'),button=document.createElement('button');
    checkbox.type='checkbox';checkbox.checked=line.selected!==false;
    checkbox.dataset.salesDraftSelect=String(line.draftId);
    checkbox.setAttribute('aria-label',line.product_name+' 일괄저장 선택');
    checkbox.disabled=!!editingSalesOrderId||salesOrderSaving;
    if(editingSalesOrderId)checkbox.title='기존 수주 수정 중에는 품목 선택을 변경할 수 없습니다.';
    button.type='button';button.className='secondary';button.textContent='수주등록';
    button.dataset.registerSalesLine=String(line.draftId);button.disabled=!!editingSalesOrderId||salesOrderSaving;
    if(editingSalesOrderId)button.title='기존 수주 수정 중에는 개별 등록할 수 없습니다.';
    action.append(checkbox,button);row.append(action);body.append(row);
  });
  updateSalesOrderSaveButton();
}
function updateSalesOrderSaveButton(){
  const hasSelectedLines=salesDraftLines.some(line=>editingSalesOrderId||line.selected!==false);
  $('save-sales-order').disabled=salesOrderSaving||!hasSelectedLines;
}
function changeSalesDraftSelection(event){
  const checkbox=event.target.closest('[data-sales-draft-select]');
  if(!checkbox)return;
  const line=salesDraftLines.find(row=>String(row.draftId)===String(checkbox.dataset.salesDraftSelect));
  if(!line)return;
  line.selected=checkbox.checked;
  updateSalesOrderSaveButton();
}
function salesOrderStatusSelect(order){
  const select=document.createElement('select'),status=salesOrderStatus(order);
  select.dataset.orderId=order.id;select.setAttribute('aria-label',order.order_number+' 매출 상태');
  [['진행','진행'],['완료','완료'],['중단','중단']].forEach(([value,label])=>{
    const option=document.createElement('option');option.value=value;option.textContent=label;
    if(value==='완료'&&Number(order.shipped_quantity||0)>0&&Number(order.shipped_quantity)<Number(order.quantity))option.disabled=true;
    if(value!=='완료'&&Number(order.shipped_quantity||0)>=Number(order.quantity)&&Number(order.shipped_quantity||0)>0)option.disabled=true;
    select.append(option);
  });
  select.value=status;select.disabled=salesStatusUpdating;
  return select;
}
function salesOrderCompleteCheckbox(order){
  const checkbox=document.createElement('input');
  checkbox.type='checkbox';checkbox.checked=salesOrderStatus(order)==='완료';
  checkbox.dataset.orderId=order.id;checkbox.dataset.salesOrderComplete='true';
  checkbox.setAttribute('aria-label',order.order_number+' '+order.product_name+' 매출 완료 체크');
  checkbox.disabled=salesStatusUpdating||Number(order.shipped_quantity||0)>0;
  return checkbox;
}
function renderSalesBalance(){
  const body=$('sales-balance-items'),outstanding=salesOrders.filter(order=>salesOrderStatus(order)!=='완료');
  const visibleOrders=filterSalesOrders(outstanding,{...appliedSalesBalanceFilters,salesStatus:''});
  const totalCents=outstanding.reduce((sum,order)=>sum+Math.round(Number(order.amount||0)*100),0);
  const visibleCents=visibleOrders.reduce((sum,order)=>sum+Math.round(Number(order.amount||0)*100),0);
  body.replaceChildren();
  $('total-sales-backlog-count').textContent=outstanding.length.toLocaleString('ko-KR')+'건';
  $('total-sales-backlog-amount').textContent='합계 '+money(totalCents/100)+'원';
  $('sales-balance-summary').textContent=visibleOrders.length.toLocaleString('ko-KR')+'건 · 진행·중단 수주 잔고 '+money(visibleCents/100)+'원';
  if(!visibleOrders.length){emptyRow(body,20,outstanding.length?'검색 조건에 해당하는 수주잔고가 없습니다.':'현재 완료되지 않은 수주가 없습니다.');return;}
  visibleOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number,order.order_type,order.vendor_name||'',order.vendor_contact||'',String(order.shipped_date||'').slice(0,10)].forEach((value,index)=>row.append(makeCell(value,index===0)));
    const completeCell=document.createElement('td');completeCell.append(salesOrderCompleteCheckbox(order));row.append(completeCell);
    const statusCell=document.createElement('td');statusCell.append(salesOrderStatusSelect(order));row.append(statusCell);
    [order.product_name,order.specification,order.unit,number(order.quantity),money(order.unit_price),
      money(order.amount),String(order.due_date).slice(0,10),order.delivery_method,order.address,order.notes]
      .forEach((value,index)=>row.append(makeCell(value,index===3||index===4||index===5)));
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent='수정';button.dataset.salesOrderId=order.id;
    action.append(button);row.append(action);
    body.append(row);
  });
}
function applySalesBalanceSearch(clear=false){
  const startDate=clear?'':$('sales-balance-start-date').value,endDate=clear?'':$('sales-balance-end-date').value;
  const orderType=clear?'':$('sales-balance-type-filter').value;
  if((startDate&&!validOrderDueDate(startDate))||(endDate&&!validOrderDueDate(endDate))){
    $('sales-balance-status').textContent='올바른 시작일과 종료일을 입력하세요.';return;
  }
  if(startDate&&endDate&&startDate>endDate){$('sales-balance-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  if(clear){$('sales-balance-start-date').value='';$('sales-balance-end-date').value='';$('sales-balance-type-filter').value='';}
  appliedSalesBalanceFilters={startDate,endDate,orderType};
  $('sales-balance-status').textContent='';
  renderSalesBalance();
}
function salesStatusPrefix(view='status'){return view==='query'?'sales-query':'sales-status';}
function completedSalesOrders(rows){return rows.filter(order=>salesOrderStatus(order)==='완료');}
function renderSalesStatus(view='status'){
  const prefix=salesStatusPrefix(view),filters=view==='query'?appliedSalesQueryFilters:appliedSalesStatusFilters;
  const dateField=view==='query'?'shipped_date':'order_date',dateLabel=view==='query'?'매출일':'수주일';
  const sourceOrders=view==='query'?completedSalesOrders(salesOrders):salesOrders;
  const body=$(`${prefix}-items`);body.replaceChildren();
  const baseOrders=filterSalesOrders(sourceOrders,{...filters,salesStatus:'',dateField});
  const totals=summarizeSalesOrders(sourceOrders,{...filters,dateField});
  const visibleOrders=filterSalesOrders(baseOrders,{...filters,dateField});
  $(`${prefix}-period`).textContent=filters.startDate||filters.endDate
    ? `${filters.startDate||'처음부터'} ~ ${filters.endDate||'현재까지'} (${dateLabel})`:`전체 ${dateLabel} 기간`;
  $(`${prefix}-total`).textContent='총수주액 '+money(totals.total)+'원';
  $(`${prefix}-completed-total`).textContent=money(totals.completed)+'원';
  $(`${prefix}-outstanding-total`).textContent=money(totals.outstanding)+'원';
  if(!visibleOrders.length){emptyRow(body,20,'검색 조건에 해당하는 수주가 없습니다.');return;}
  visibleOrders.forEach(order=>{
    const row=document.createElement('tr');
    [number(order.sequence_id),String(order.order_date).slice(0,10),order.order_number,order.order_type,order.vendor_name||'',order.vendor_contact||'',String(order.shipped_date||'').slice(0,10)].forEach((value,index)=>row.append(makeCell(value,index===0)));
    const completeCell=document.createElement('td');completeCell.append(salesOrderCompleteCheckbox(order));row.append(completeCell);
    const statusCell=document.createElement('td');statusCell.append(salesOrderStatusSelect(order));row.append(statusCell);
    [order.product_name,order.specification,order.unit,number(order.quantity),money(order.unit_price),
      money(order.amount),String(order.due_date).slice(0,10),order.delivery_method,order.address,order.notes]
      .forEach((value,index)=>row.append(makeCell(value,index===3||index===4||index===5)));
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent='수정';button.dataset.salesOrderId=order.id;
    action.append(button);row.append(action);
    body.append(row);
  });
}
function renderSalesRegister(){
  const body=$('sales-register-items');body.replaceChildren();
  const visibleOrders=salesRegisterSearched?filterSalesOrders(salesOrders,{query:salesRegisterQuery}):[];
  salesRegisterVisibleOrders=visibleOrders;
  $('bulk-sales-register').disabled=salesStatusUpdating||!visibleOrders.some(salesRegistrationEligible);
  if(!salesRegisterSearched){emptyRow(body,17,'수주번호 또는 거래처(성명)를 검색하세요.');return;}
  if(!visibleOrders.length){emptyRow(body,17,'검색 결과가 없습니다.');return;}
  visibleOrders.forEach(order=>{
    const row=document.createElement('tr');
    row.append(makeCell(number(order.sequence_id),true));
    const action=document.createElement('td'),button=document.createElement('button');
    const shipped=Number(order.shipped_quantity||0),quantity=Number(order.quantity||0);
    const alreadyComplete=salesOrderStatus(order)==='완료',partialShipment=shipped>0&&shipped<quantity;
    const hasShippedDate=Boolean(String(order.shipped_date||'').trim());
    button.type='button';button.className='secondary sales-register-action';
    button.innerHTML='<span class="sales-register-icon" aria-hidden="true">₩</span><span>'+(alreadyComplete?'등록 완료':'매출등록')+'</span>';
    button.dataset.salesRegisterOrderId=order.id;
    button.setAttribute('aria-label',order.order_number+' '+order.product_name+' 매출 등록');
    button.disabled=salesStatusUpdating||alreadyComplete||!hasShippedDate||partialShipment;
    if(alreadyComplete)button.title='이미 매출 등록이 완료된 품목입니다.';
    else if(!hasShippedDate)button.title='출고등록을 완료하면 매출 등록이 가능합니다.';
    else if(partialShipment)button.title='잔여 수량이 있어 매출 완료할 수 없습니다.';
    action.append(button);row.append(action);
    [String(order.order_date||'').slice(0,10),order.order_number,order.order_type,
      order.vendor_name||'',String(order.shipped_date||'').slice(0,10)]
      .forEach(value=>row.append(makeCell(value)));
    const statusCell=document.createElement('td'),status=salesOrderStatusSelect(order);
    status.disabled=true;statusCell.append(status);row.append(statusCell);
    [order.product_name,order.specification,order.unit,number(order.quantity),money(order.unit_price),
      money(order.amount),String(order.due_date||'').slice(0,10),order.delivery_method,order.address]
      .forEach((value,index)=>row.append(makeCell(value,index===3||index===4||index===5)));
    body.append(row);
  });
}
function salesRegistrationEligible(order){
  const shipped=Number(order.shipped_quantity||0),quantity=Number(order.quantity||0);
  return Boolean(String(order.shipped_date||'').trim())&&salesOrderStatus(order)!=='완료'&&!(shipped>0&&shipped<quantity);
}
async function loadSalesOrders(){
  if(salesOrdersLoading)return;
  salesOrdersLoading=true;$('sales-order-status').textContent='저장된 수주를 불러오는 중…';$('sales-status-message').textContent='수주 정보를 불러오는 중…';$('sales-query-message').textContent='수주 정보를 불러오는 중…';
  try{
    const rows=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await client.from('sales_orders').select('*').order('sequence_id',{ascending:false}).range(offset,offset+499);
      if(error)throw error;
      rows.push(...data);
      if(data.length<500)break;
    }
    salesOrders=rows;renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesRegister();renderSalesBalance();updateIssueSalesOrders();$('sales-order-status').textContent='';$('sales-status-message').textContent='';$('sales-query-message').textContent='';$('sales-register-message').textContent='';$('sales-balance-status').textContent='';
  }catch(error){$('sales-order-status').textContent=errorText(error);$('sales-status-message').textContent=errorText(error);$('sales-query-message').textContent=errorText(error);$('sales-register-message').textContent=errorText(error);$('sales-balance-status').textContent=errorText(error);}
  finally{salesOrdersLoading=false;}
}
function resetPurchaseOrderForm(){
  purchaseOrderSaved=false;
  $('purchase-order-form').reset();
  $('purchase-order-date').value=todayDate();$('purchase-order-date').min=todayDate();$('purchase-order-date').max=todayDate();
  $('purchase-order-status').textContent='';
  populatePurchaseOrderVendorOptions();
  updatePurchaseOrderNumber();
  purchaseDraftLines=[];renderPurchaseDraftLines();populatePurchaseProductOptions();
}
function populatePurchaseOrderVendorOptions(){
  const select=$('purchase-order-supplier'),selected=select.value;
  select.replaceChildren(new Option('등록 거래처 선택',''));
  purchaseOrderVendors.forEach(vendor=>{
    const legalName=String(vendor.legal_name||vendor.vendor_name||'').trim();
    const vendorName=String(vendor.vendor_name||'').trim();
    const option=new Option(vendorName&&vendorName!==legalName?`${legalName} · ${vendorName}`:legalName,vendor.id);
    select.add(option);
  });
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
  select.disabled=!purchaseOrderVendorsLoaded;
}
async function loadRegisteredVendors(){
  const generation=authGeneration,vendors=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from('business_partners')
      .select('id,legal_name,vendor_name,status,profile').order('legal_name').range(offset,offset+499);
    if(error)throw error;
    vendors.push(...data);
    if(data.length<500)break;
  }
  if(generation!==authGeneration||!currentUser)return null;
  return vendors;
}
function registeredVendorDirectoryErrorText(error){
  const message=String(error?.message||error||'').toLowerCase();
  if(['pgrst204','pgrst205','42703','42p01'].some(code=>message.includes(code))||message.includes('business_partners'))
    return '거래처 목록을 불러오지 못했습니다. supabase/vendor-management.sql을 적용하고 거래처 정보를 등록하세요.';
  return '등록 거래처를 불러오지 못했습니다. '+errorText(error);
}
async function loadPurchaseOrderVendors(){
  purchaseOrderVendorsLoaded=false;populatePurchaseOrderVendorOptions();
  const vendors=await loadRegisteredVendors();
  if(!vendors)return;
  purchaseOrderVendors=vendors;purchaseOrderVendorsLoaded=true;
  populatePurchaseOrderVendorOptions();
}
function updatePurchaseOrderNumber(){
  if(purchaseOrderSaved)return;
  const orderNumber=nextPurchaseOrderNumber($('purchase-order-date').value,purchaseOrders);
  $('purchase-order-number').value=orderNumber;
  if(!orderNumber)$('purchase-order-status').textContent='해당 날짜의 발주번호를 생성할 수 없습니다. 일련번호 상태를 확인하세요.';
}
function populatePurchaseProductOptions(){
  const select=$('purchase-line-product'),selected=select.value;
  select.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='품목정보 등록에서 선택';select.append(placeholder);
  items.forEach(item=>{
    const option=document.createElement('option');option.value=item.id;
    option.textContent=`${item.product_code} · ${item.product_name} · ${item.product_category}${stockLedgerManaged(item)?' · 재고관리':' · 재고관리 안함'}`;
    select.append(option);
  });
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
  updatePurchaseProductDetails();
}
function updatePurchaseProductDetails(){
  const item=items.find(row=>row.id===$('purchase-line-product').value);
  $('purchase-product-category').value=item?.classification_name||item?.product_category||'';
  $('purchase-inventory-asset-type').value=item?.inventory_asset_type||'';
  $('purchase-product-unit').value=item?.unit||'';
  $('purchase-product-material').value=item?.material||'';
  $('purchase-product-color').value=item?.color||'';
}
function renderPurchaseDraftLines(){
  const body=$('purchase-draft-items');body.replaceChildren();
  if(!purchaseDraftLines.length){emptyRow(body,8,'가발주 품목을 추가하세요.');return;}
  purchaseDraftLines.forEach((line,index)=>{
    const item=items.find(row=>row.id===line.product_id),row=document.createElement('tr');
    [item?.product_code||'',item?.product_name||'',item?.specification||'',number(line.quantity),money(line.unit_cost),line.expected_date||'','가발주']
      .forEach((value,column)=>row.append(makeCell(value,column===3||column===4)));
    const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent='삭제';button.dataset.removePurchaseLine=String(index);action.append(button);row.append(action);body.append(row);
  });
}
function addPurchaseDraftLine(){
  if(purchaseOrderSaved){$('purchase-order-status').textContent='이미 저장된 발주입니다. 새 발주는 발주 추가작성을 눌러 작성하세요.';return;}
  const productId=$('purchase-line-product').value,quantity=Number($('purchase-line-quantity').value);
  const unitCost=Number($('purchase-line-unit-cost').value),expectedDate=$('purchase-line-expected-date').value;
  if(!items.some(item=>item.id===productId)){$('purchase-order-status').textContent='등록된 품목을 선택하세요.';return;}
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000){$('purchase-order-status').textContent='발주수량은 1~1,000,000 사이의 정수로 입력하세요.';return;}
  if(!Number.isFinite(unitCost)||unitCost<0||unitCost>1000000000||Math.abs(unitCost*100-Math.round(unitCost*100))>0.0001){$('purchase-order-status').textContent='발주단가는 0~1,000,000,000원, 소수 둘째 자리까지 입력하세요.';return;}
  if(expectedDate&&!validOrderDueDate(expectedDate)){$('purchase-order-status').textContent='품목 납기예정일을 확인하세요.';return;}
  if(purchaseDraftLines.some(line=>line.product_id===productId)){$('purchase-order-status').textContent='같은 품목은 발주 목록에 이미 있습니다.';return;}
  if(purchaseDraftLines.length>=100){$('purchase-order-status').textContent='한 번에 등록할 수 있는 발주 품목은 최대 100개입니다.';return;}
  purchaseDraftLines.push({product_id:productId,quantity,unit_cost:unitCost,expected_date:expectedDate||null});
  $('purchase-line-product').value='';$('purchase-line-quantity').value='';$('purchase-line-unit-cost').value='';$('purchase-line-expected-date').value='';
  updatePurchaseProductDetails();
  $('purchase-order-status').textContent='가발주 목록에 추가했습니다. 발주 저장을 누르면 정식 발주로 등록됩니다.';renderPurchaseDraftLines();
}
const PURCHASE_SEARCH_IDS=['purchase-search-start-date','purchase-search-end-date','purchase-search-number','purchase-search-supplier','purchase-search-code','purchase-search-name','purchase-search-specification','purchase-search-status'];
function purchaseOrderSearchValues(){
  const text=id=>($(id)?.value||'').trim().toLocaleLowerCase('ko-KR');
  return {start:$('purchase-search-start-date')?.value||'',end:$('purchase-search-end-date')?.value||'',
    number:text('purchase-search-number'),supplier:text('purchase-search-supplier'),
    code:text('purchase-search-code'),name:text('purchase-search-name'),specification:text('purchase-search-specification'),status:purchase-search-status?.value||''};
}
function purchaseLineMatches(filter,order,item){
  const has=(value,query)=>!query||String(value||'').toLocaleLowerCase('ko-KR').includes(query);
  const date=String(order?.order_date||'').slice(0,10);
  if(filter.start&&(!date||date<filter.start))return false;
  if(filter.end&&(!date||date>filter.end))return false;
  if(filter.status&&order?.status!==filter.status)return false;
  return has(order?.order_number,filter.number)&&has(order?.supplier,filter.supplier)
    &&has(item?.product_code,filter.code)&&has(item?.product_name,filter.name)&&has(item?.specification,filter.specification);
}
function searchPurchaseOrders(){
  const {start,end}=purchaseOrderSearchValues();
  if(start&&end&&start>end){$('purchase-order-status').textContent='발주일 시작일이 마지막일보다 늦습니다. 기간을 확인하세요.';return;}
  $('purchase-order-status').textContent='';renderPurchaseOrders();
}
function clearPurchaseOrderSearch(){
  PURCHASE_SEARCH_IDS.forEach(id=>{if($(id))$(id).value='';});
  $('purchase-order-status').textContent='';renderPurchaseOrders();
}
function renderPurchaseOrders(){
  const body=$('purchase-order-items'),ordersById=new Map(purchaseOrders.map(order=>[order.id,order]));
  const productsById=new Map(items.map(item=>[item.id,item]));
  body.replaceChildren();
  const filter=purchaseOrderSearchValues();
  const lines=[...purchaseOrderLines].filter(line=>purchaseLineMatches(filter,ordersById.get(line.purchase_order_id),productsById.get(line.product_id))).sort((a,b)=>{
    const orderDiff=Number(ordersById.get(b.purchase_order_id)?.sequence_id||0)-Number(ordersById.get(a.purchase_order_id)?.sequence_id||0);
    return orderDiff||Number(a.line_number)-Number(b.line_number);
  });
  if(!lines.length)emptyRow(body,14,purchaseOrderLines.length?'검색 결과가 없습니다.':'저장된 발주가 없습니다.');
  lines.forEach(line=>{
    const order=ordersById.get(line.purchase_order_id),item=productsById.get(line.product_id),remaining=Number(line.quantity)-Number(line.received_quantity);
    const row=document.createElement('tr');
    [number(order?.sequence_id),String(order?.order_date||'').slice(0,10),order?.order_number||'',order?.supplier||'',
      item?.product_code||'',item?.product_name||'',item?.specification||'',number(line.quantity),number(line.received_quantity),
      number(remaining),money(line.unit_cost),String(line.expected_date||'').slice(0,10),order?.status||'']
      .forEach((value,index)=>row.append(makeCell(value,index>=7&&index<=10)));
    const action=document.createElement('td');
    if(remaining>0&&order?.status!=='취소'){
      const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='입고';button.dataset.receivePurchaseLine=line.id;action.append(button);
    }else action.textContent='완료';
    row.append(action);body.append(row);
  });
}
async function loadPurchaseOrders(){
  if(purchaseLoading)return;
  const generation=authGeneration;
  purchaseLoading=true;$('purchase-order-status').textContent='발주·입고 내역을 불러오는 중…';
  try{
    const [orders,lines,receipts]=await Promise.all([
      readAll('purchase_orders','sequence_id'),readAll('purchase_order_lines','id'),readAll('purchase_order_receipts','sequence_id')
    ]);
    if(generation!==authGeneration||!currentUser)return;
    purchaseOrders=orders.sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    purchaseOrderLines=lines;purchaseReceipts=receipts;
    renderPurchaseOrders();$('purchase-order-status').textContent='';
  }catch(error){
    if(generation!==authGeneration)return;
    $('purchase-order-status').textContent='발주 내역을 불러오지 못했습니다. DB 마이그레이션과 권한을 확인하세요. '+errorText(error);
    throw error;
  }finally{purchaseLoading=false;}
}
async function showPurchaseOrders(mode='entry'){
  if(!currentUser||busy||purchaseSaving)return;
  const generation=authGeneration;
  const isQuery=mode==='query';
  $('purchase-order-title').textContent=isQuery?'구매발주 품목조회':'구매발주 품목입력';
  $('purchase-order-description').textContent=isQuery?'저장된 발주와 입고 내역을 조회하고, 미입고 발주 품목을 입고 처리합니다.':'발주 정보를 입력하고 품목을 추가한 뒤 발주를 저장합니다.';
  $('purchase-order-entry').hidden=isQuery;
  $('purchase-order-view').hidden=!isQuery;
  $('save-purchase-order').parentElement.hidden=isQuery;
  $('purchase-print-settings').hidden=isQuery;$('purchase-print').hidden=isQuery;
  resetPurchaseOrderForm();PURCHASE_SEARCH_IDS.forEach(id=>{if($(id))$(id).value='';});$('purchase-order-dialog').showModal();
  try{await loadPurchaseOrderVendors();}
  catch(error){if(generation===authGeneration)$('purchase-order-status').textContent=registeredVendorDirectoryErrorText(error);return;}
  try{await loadStock();populatePurchaseProductOptions();await loadPurchaseOrders();updatePurchaseOrderNumber();}
  catch(error){if(generation===authGeneration)$('purchase-order-status').textContent='발주 기능을 준비하지 못했습니다. '+errorText(error);}
}
function startNewPurchaseOrder(){
  if(purchaseSaving)return;
  resetPurchaseOrderForm();
  $('purchase-order-status').textContent='새 발주를 작성하세요. 발주번호 '+($('purchase-order-number').value||'')+' 가 생성되었습니다.';
}
async function savePurchaseOrder(event){
  event.preventDefault();
  if(!currentUser||purchaseSaving)return;
  if(purchaseOrderSaved){$('purchase-order-status').textContent='이미 저장된 발주입니다. 새 발주는 발주 추가작성을 눌러 작성하세요.';return;}
  const orderNumber=$('purchase-order-number').value.trim(),supplierId=$('purchase-order-supplier').value;
  const selectedVendor=purchaseOrderVendors.find(vendor=>vendor.id===supplierId);
  const supplier=String(selectedVendor?.legal_name||selectedVendor?.vendor_name||'').trim();
  const orderDate=$('purchase-order-date').value,notes=$('purchase-order-notes').value.trim();
  if(!orderNumber){$('purchase-order-status').textContent='발주번호를 확인하세요.';return;}
  if(!selectedVendor||!supplier){$('purchase-order-status').textContent='거래처 등록 화면에서 등록된 납품업체를 선택하세요.';$('purchase-order-supplier').focus();return;}
  if(orderDate<todayDate()){$('purchase-order-status').textContent='발주일자는 오늘 날짜보다 이전으로 설정할 수 없습니다.';return;}
  if(!validDate(orderDate)){$('purchase-order-status').textContent='발주일자를 확인하세요.';return;}
  if(!purchaseDraftLines.length){$('purchase-order-status').textContent='가발주 품목을 한 개 이상 추가한 뒤 발주 저장을 누르세요.';return;}
  purchaseSaving=true;$('purchase-order-editor').disabled=true;$('purchase-order-status').textContent='발주를 저장하는 중…';
  const generation=authGeneration;
  try{
    const {data,error}=await client.rpc('create_purchase_order',{
      p_order_number:orderNumber,p_supplier:supplier,p_order_date:orderDate,p_expected_date:null,p_notes:notes,
      p_lines:purchaseDraftLines.map(line=>({...line}))
    });
    if(error)throw error;
    if(generation!==authGeneration)return;
    $('purchase-order-number').value=data.order_number;
    purchaseOrderSaved=true;
    $('purchase-order-status').textContent='정식 발주로 등록했습니다. 일련번호 '+number(data.sequence_id)+' · '+data.order_number;
    try{await loadPurchaseOrders();}
    catch(refreshError){$('purchase-order-status').textContent+=' 목록 새로고침에 실패했습니다. '+errorText(refreshError);}
    window.alert('저장했습니다.');
  }catch(error){if(generation===authGeneration)$('purchase-order-status').textContent=errorText(error);}
  finally{purchaseSaving=false;$('purchase-order-editor').disabled=false;}
}
function openPurchaseReceipt(lineId){
  const line=purchaseOrderLines.find(row=>row.id===lineId);
  if(!line)return;
  const order=purchaseOrders.find(row=>row.id===line.purchase_order_id),item=items.find(row=>row.id===line.product_id);
  if(!order||!item)return;
  const remaining=Number(line.quantity)-Number(line.received_quantity);
  if(remaining<1)return;
  receivingPurchaseLineId=line.id;receivingPurchaseRequestId=crypto.randomUUID();
  $('purchase-receive-form').reset();$('purchase-received-date').value=todayDate();$('purchase-received-date').max=todayDate();
  $('purchase-received-quantity').max=String(remaining);$('purchase-received-quantity').value=String(remaining);
  $('purchase-received-unit-cost').value=String(line.unit_cost??0);
  $('purchase-receive-title').textContent=item.product_code+' 입고 처리';
  $('purchase-receive-description').textContent=`발주 ${order.order_number} · 잔여 ${number(remaining)} ${item.unit||'EA(개)'} · ${stockLedgerManaged(item)?'입고 시 재고수불부와 FIFO에 반영됩니다.':'재고 관리 안함 품목으로 분류되어 재고수불부/FIFO에는 반영하지 않고 별도 이력으로 저장합니다.'}`;
  $('purchase-receive-status').textContent='';$('purchase-receive-editor').disabled=false;$('purchase-receive-dialog').showModal();
}
async function savePurchaseReceipt(event){
  event.preventDefault();
  if(!currentUser||purchaseSaving)return;
  const line=purchaseOrderLines.find(row=>row.id===receivingPurchaseLineId);
  if(!line){$('purchase-receive-status').textContent='발주 품목을 다시 불러온 뒤 시도하세요.';return;}
  const date=$('purchase-received-date').value,quantity=Number($('purchase-received-quantity').value),unitCost=Number($('purchase-received-unit-cost').value);
  if(!validDate(date)||!Number.isSafeInteger(quantity)||quantity<1||quantity>Number(line.quantity)-Number(line.received_quantity)
    ||!Number.isFinite(unitCost)||unitCost<0||unitCost>1000000000||Math.abs(unitCost*100-Math.round(unitCost*100))>0.0001){
    $('purchase-receive-status').textContent='입고일자·수량·단가를 확인하세요. 입고수량은 발주 잔량을 초과할 수 없습니다.';return;
  }
  purchaseSaving=true;$('purchase-receive-editor').disabled=true;$('purchase-receive-status').textContent='입고를 저장하는 중…';
  const generation=authGeneration;
  try{
    const {data,error}=await client.rpc('receive_purchase_order_line',{
      p_request_id:receivingPurchaseRequestId,p_line_id:line.id,p_received_date:date,p_quantity:quantity,p_unit_cost:unitCost
    });
    if(error)throw error;
    if(generation!==authGeneration)return;
    await loadPurchaseOrders();
    if(data.stock_tracked)await loadStock();
    $('purchase-receive-dialog').close();
    $('purchase-order-status').textContent=data.stock_tracked
      ? '입고를 저장하고 재고수불부/FIFO에 반영했습니다.'
      : '입고를 별도 이력으로 저장했습니다. 재고수불부/FIFO에는 반영하지 않았습니다.';
  }catch(error){if(generation===authGeneration)$('purchase-receive-status').textContent=errorText(error);}
  finally{purchaseSaving=false;$('purchase-receive-editor').disabled=false;}
}
function schedulePurchaseOrderSync(){
  clearTimeout(purchaseSyncTimer);
  purchaseSyncTimer=setTimeout(()=>{
    if(currentUser&&!purchaseSaving&&$('purchase-order-dialog').open)loadPurchaseOrders().catch(error=>$('purchase-order-status').textContent=errorText(error));
  },250);
}
async function showSalesStatus(view='status'){
  if(!currentUser||busy||salesOrderSaving)return;
  const prefix=salesStatusPrefix(view),dialog=view==='query'?'sales-status-query-dialog':'sales-status-dialog';
  const emptyFilters={startDate:'',endDate:'',orderType:'',salesStatus:'',query:'',orderNumber:'',vendorName:''};
  if(view==='query')appliedSalesQueryFilters=emptyFilters;else appliedSalesStatusFilters=emptyFilters;
  $(`${prefix}-start-date`).value='';$(`${prefix}-end-date`).value='';
  $(`${prefix}-type-filter`).value='';
  if(view!=='query')$(`${prefix}-filter`).value='';
  if(view==='query'){$('sales-query-order-number').value='';$('sales-query-vendor').value='';}
  else $(`${prefix}-order-query`).value='';
  $(`${prefix}-message`).textContent='';renderSalesStatus(view);$(dialog).showModal();
  await loadSalesOrders();
}
async function showSalesRegister(){
  if(!currentUser||busy||salesOrderSaving)return;
  salesRegisterQuery='';salesRegisterSearched=false;salesRegisterVisibleOrders=[];salesRegisterTargetOrderIds=[];
  $('sales-register-query').value='';$('sales-register-message').textContent='';
  $('sales-register-confirm-status').textContent='';renderSalesRegister();
  $('sales-register-dialog').showModal();
  await loadSalesOrders();
}
function resetSalesRegisterSearch(){
  salesRegisterQuery='';salesRegisterSearched=false;salesRegisterVisibleOrders=[];$('sales-register-query').value='';
  $('sales-register-message').textContent='검색 조건을 입력하세요.';
  renderSalesRegister();$('sales-register-query').focus();
}
function applySalesRegisterSearch(){
  const query=$('sales-register-query').value.trim();
  if(!query){
    salesRegisterQuery='';salesRegisterSearched=false;
    $('sales-register-message').textContent='수주번호 또는 거래처(성명)를 입력하세요.';
    renderSalesRegister();return;
  }
  salesRegisterQuery=query;salesRegisterSearched=true;renderSalesRegister();
  $('sales-register-message').textContent=salesRegisterVisibleOrders.length
    ? '검색 결과 '+number(salesRegisterVisibleOrders.length)+'건'
    : '검색 결과가 없습니다.';
}
function openSalesRegisterConfirmation(id){
  if(!currentUser||salesStatusUpdating)return;
  const order=salesOrders.find(row=>row.id===id);
  if(!order)return;
  const shipped=Number(order.shipped_quantity||0),quantity=Number(order.quantity||0);
  const alreadyComplete=salesOrderStatus(order)==='완료',partialShipment=shipped>0&&shipped<quantity;
  const hasShippedDate=Boolean(String(order.shipped_date||'').trim());
  salesRegisterTargetOrderIds=alreadyComplete||!hasShippedDate||partialShipment?[]:[order.id];
  $('sales-register-confirm-message').textContent='매출등록을 하시겠습니까?';
  $('sales-register-confirm-status').textContent=alreadyComplete
    ? '이미 매출 등록이 완료된 품목입니다.'
    : !hasShippedDate?'출고등록을 완료한 품목만 매출 등록할 수 있습니다.'
    : partialShipment?'잔여 수량이 있어 매출 완료할 수 없습니다.':order.order_number+' · '+order.product_name;
  $('complete-sales-register-confirm').disabled=alreadyComplete||!hasShippedDate||partialShipment;
  $('cancel-sales-register-confirm').disabled=false;$('close-sales-register-confirm').disabled=false;
  $('sales-register-confirm-dialog').showModal();
}
function openBulkSalesRegisterConfirmation(){
  if(!currentUser||salesStatusUpdating)return;
  salesRegisterTargetOrderIds=salesRegisterVisibleOrders.filter(salesRegistrationEligible).map(order=>order.id);
  if(!salesRegisterTargetOrderIds.length){
    $('sales-register-message').textContent='출고등록이 완료된 매출 미등록 품목이 없습니다.';
    return;
  }
  $('sales-register-confirm-message').textContent=salesRegisterTargetOrderIds.length+'건의 매출등록을 진행하시겠습니까?';
  $('sales-register-confirm-status').textContent='현재 검색 결과의 미등록 품목만 순서대로 등록합니다.';
  $('complete-sales-register-confirm').disabled=false;
  $('cancel-sales-register-confirm').disabled=false;$('close-sales-register-confirm').disabled=false;
  $('sales-register-confirm-dialog').showModal();
}
function cancelSalesRegisterConfirmation(){
  if(salesStatusUpdating)return;
  salesRegisterTargetOrderIds=[];
  $('sales-register-confirm-dialog').close();
}
async function completeSalesRegistration(){
  if(!salesRegisterTargetOrderIds.length||!currentUser||salesStatusUpdating)return;
  const generation=authGeneration,targetIds=[...new Set(salesRegisterTargetOrderIds)];
  salesStatusUpdating=true;$('complete-sales-register-confirm').disabled=true;
  $('cancel-sales-register-confirm').disabled=true;$('close-sales-register-confirm').disabled=true;
  $('sales-register-confirm-status').textContent='매출 등록을 저장하는 중… (0/'+number(targetIds.length)+')';
  renderSalesRegister();
  const failed=[];
  let completed=0,skipped=0;
  try{
    for(let index=0;index<targetIds.length;index++){
      if(generation!==authGeneration)return;
      const order=salesOrders.find(row=>row.id===targetIds[index]);
      if(!order||!salesRegistrationEligible(order)){skipped++;continue;}
      $('sales-register-confirm-status').textContent='매출 등록을 저장하는 중… ('+number(index+1)+'/'+number(targetIds.length)+')';
      try{
        const {data,error}=await client.rpc('set_sales_order_status',{p_order_id:order.id,p_sales_status:'완료'});
        if(error)throw error;
        if(generation!==authGeneration)return;
        if(data.id!==order.id)throw new Error('매출 등록 결과의 수주 품목이 일치하지 않습니다.');
        salesOrders=salesOrders.map(row=>row.id===data.id?data:row);
        completed++;
      }catch(error){
        if(generation!==authGeneration)return;
        failed.push({order,message:errorText(error)});
      }
      renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesRegister();renderSalesBalance();updateIssueSalesOrders();
    }
    if(generation!==authGeneration)return;
    salesRegisterTargetOrderIds=failed.map(({order})=>order.id);
    if(failed.length){
      $('sales-register-confirm-message').textContent='매출 등록 결과: '+number(completed)+'건 완료, '+number(failed.length)+'건 실패';
      $('sales-register-confirm-status').textContent=failed.map(({order,message})=>order.order_number+' · '+order.product_name+': '+message).join('\n');
      $('sales-register-message').textContent='매출 등록 '+number(completed)+'건 완료, '+number(failed.length)+'건 실패했습니다. 실패 항목을 확인하세요.';
      $('complete-sales-register-confirm').disabled=false;$('cancel-sales-register-confirm').disabled=false;$('close-sales-register-confirm').disabled=false;
    }else{
      $('sales-register-confirm-dialog').close();salesRegisterTargetOrderIds=[];
      $('sales-register-message').textContent='매출 등록 '+number(completed)+'건 완료'+(skipped?' · 이미 등록되었거나 등록 조건에 맞지 않는 '+number(skipped)+'건은 제외했습니다.':'')+'.';
    }
  }finally{
    salesStatusUpdating=false;
    if(generation===authGeneration){
      renderSalesRegister();
      if(failed.length){
        $('complete-sales-register-confirm').disabled=false;$('cancel-sales-register-confirm').disabled=false;$('close-sales-register-confirm').disabled=false;
      }
    }
  }
}
async function editSalesOrderFromStatus(id){
  const blockedReason=salesOrderDownstreamReason(id);
  if(blockedReason){alertBlocked(blockedReason);return;}
  $('sales-status-dialog').close();$('sales-status-query-dialog').close();
  resetSalesOrderForm();$('sales-order-status').textContent='';
  $('sales-order-dialog').showModal();
  editSalesOrder(id);
}
async function openMovementHistoryForEdit(){
  if(busy)return;
  const kind=mode;
  $('movement-dialog').close();
  await showMovementList(kind);
}
function applySalesStatusSearch(clear=false,view='status'){
  const prefix=salesStatusPrefix(view);
  const startDate=clear?'':$(`${prefix}-start-date`).value,endDate=clear?'':$(`${prefix}-end-date`).value;
  const orderType=clear?'':$(`${prefix}-type-filter`).value,salesStatus=view==='query'||clear?'':$(`${prefix}-filter`).value;
  const query=clear?'':view==='query'?'':$(`${prefix}-order-query`).value.trim();
  if((startDate&&!validOrderDueDate(startDate))||(endDate&&!validOrderDueDate(endDate))){
    $(`${prefix}-message`).textContent='올바른 시작일과 종료일을 입력하세요.';return;
  }
  if(startDate&&endDate&&startDate>endDate){$(`${prefix}-message`).textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  if(clear){$(`${prefix}-start-date`).value='';$(`${prefix}-end-date`).value='';$(`${prefix}-type-filter`).value='';if(view!=='query')$(`${prefix}-filter`).value='';if(view==='query'){$('sales-query-order-number').value='';$('sales-query-vendor').value='';}else $(`${prefix}-order-query`).value='';}
  const filters={startDate,endDate,orderType,salesStatus,query,
    orderNumber:view==='query'&&!clear?$('sales-query-order-number').value.trim():'',
    vendorName:view==='query'&&!clear?$('sales-query-vendor').value.trim():''};
  if(view==='query')appliedSalesQueryFilters=filters;else appliedSalesStatusFilters=filters;
  $(`${prefix}-message`).textContent='';renderSalesStatus(view);
}
async function changeSalesOrderStatus(event){
  const select=event.target,order=salesOrders.find(row=>row.id===select.dataset.orderId);
  if(!order||!currentUser||salesStatusUpdating)return;
  const view=event.currentTarget?.id==='sales-query-items'?'query':'status',prefix=salesStatusPrefix(view);
  const nextStatus=select.dataset.salesOrderComplete
    ? select.checked?'완료':'진행'
    : select.value;
  const previousStatus=salesOrderStatus(order),generation=authGeneration;
  salesStatusUpdating=true;renderSalesStatus();renderSalesStatus('query');renderSalesBalance();$(`${prefix}-message`).textContent='매출 상태를 저장하는 중…';
  try{
    const {data,error}=await client.rpc('set_sales_order_status',{p_order_id:order.id,p_sales_status:nextStatus});
    if(error)throw error;
    if(generation!==authGeneration)return;
    salesOrders=salesOrders.map(row=>row.id===data.id?data:row);renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesBalance();updateIssueSalesOrders();
    $(`${prefix}-message`).textContent='수주 '+order.order_number+' 품목의 매출 상태를 '+nextStatus+'(으)로 변경했습니다.';
  }catch(error){
    if(generation===authGeneration){salesOrders=salesOrders.map(row=>row.id===order.id?{...row,sales_progress_status:previousStatus}:row);renderSalesStatus();renderSalesStatus('query');renderSalesBalance();updateIssueSalesOrders();$(`${prefix}-message`).textContent='매출 상태 저장에 실패했습니다. '+errorText(error);}
  }finally{salesStatusUpdating=false;renderSalesStatus();renderSalesStatus('query');renderSalesBalance();}
}
function updateSalesAmount(){
  const quantity=Number($('sales_quantity').value),price=Number($('sales_unit_price').value);
  $('sales_amount').value=$('sales_quantity').value&&$('sales_unit_price').value&&Number.isSafeInteger(quantity)&&quantity>0&&Number.isFinite(price)&&price>=0
    ? money(quantity*price)+'원':'';
}
function addSalesOrderLine(){
  const quantity=Number($('sales_quantity').value),unitPrice=Number($('sales_unit_price').value);
  const dueDate=$('sales_due_date').value;
  if(!$('sales_product_name').value.trim()||!$('sales_unit').value
    ||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000
    ||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000000
    ||Math.abs(unitPrice*100-Math.round(unitPrice*100))>0.0001||!validOrderDueDate(dueDate)){
    $('sales-order-status').textContent='품명·단위·수량·단가·납기일자를 올바르게 입력한 후 품목을 추가하세요.';
    return;
  }
  salesDraftLines.push({
    draftId:'sales-draft-'+(++salesDraftSequence),
    product_name:$('sales_product_name').value.trim(),specification:$('sales_specification').value.trim(),
    unit:$('sales_unit').value,quantity,unit_price:unitPrice,due_date:dueDate,selected:true
  });
  ['sales_product_name','sales_specification','sales_unit','sales_quantity','sales_unit_price','sales_amount','sales_due_date']
    .forEach(id=>$(id).value='');
  renderSalesDraftLines();$('sales-order-status').textContent='';
}
function showDuplicateSalesOrderNotice(){
  window.alert('이미 저장 작업이 진행 중이거나 등록 완료된 수주 품목입니다. 중복 등록되지 않았습니다.');
}
function salesOrderHeaderIsValid(){
  return validOrderDueDate($('sales_order_date').value)&&!!$('sales_order_number').value.trim()
    &&!!$('sales_order_type').value&&!!$('sales_vendor_name').value.trim();
}
function salesOrderLinePayload(line){
  const values={...line};
  delete values.draftId;delete values.line_id;delete values.selected;
  const line_id=line.line_id;
  return {...values,...(line_id?{line_id}:{})};
}
function salesOrderRecordPayload(order){
  return {
    line_id:order.id,product_name:order.product_name,specification:order.specification||'',unit:order.unit,
    quantity:Number(order.quantity),unit_price:Number(order.unit_price),due_date:String(order.due_date).slice(0,10)
  };
}
function resetSalesOrderForm(){
  editingSalesOrderId='';salesDraftGroupId='';$('sales-order-form').reset();$('sales_order_date').value=todayDate();
  salesDraftLines=[];renderSalesDraftLines();
  $('sales-order-title').textContent='수주 입력';$('save-sales-order').textContent='수주 일괄저장';
}
function startNewSalesOrder(){
  if(salesOrderSaving)return;
  resetSalesOrderForm();
  $('sales-order-status').textContent='새 수주 입력을 시작합니다. 저장된 수주 이력은 유지됩니다.';
}
function cancelSalesOrder(){
  if(salesOrderSaving)return;
  resetSalesOrderForm();$('sales-order-dialog').close();
}
function editSalesOrder(id){
  const order=salesOrders.find(row=>row.id===id);if(!order)return;
  const blockedReason=salesOrderDownstreamReason(id);
  if(blockedReason){alertBlocked(blockedReason);return;}
  const groupId=order.order_group_id||order.id;
  const group=salesOrders.filter(row=>(row.order_group_id||row.id)===groupId);
  editingSalesOrderId=groupId;
  [['sales_order_date','order_date'],['sales_order_number','order_number'],['sales_order_type','order_type'],
    ['sales_vendor_name','vendor_name'],['sales_vendor_contact','vendor_contact'],['sales_delivery_method','delivery_method']]
    .forEach(([field,key])=>$(field).value=order[key]??'');
  salesDraftLines=group.map(line=>({
    line_id:line.id,draftId:'sales-draft-'+(++salesDraftSequence),product_name:line.product_name,specification:line.specification||'',unit:line.unit,
    quantity:Number(line.quantity),unit_price:Number(line.unit_price),due_date:String(line.due_date).slice(0,10),selected:true
  }));
  renderSalesDraftLines();
  $('sales-order-title').textContent='수주 수정';$('save-sales-order').textContent='변경 사항 저장';$('save-sales-order').disabled=false;
  $('sales_order_number').focus();
}
async function showSalesOrder(){
  if(!currentUser||busy||salesOrderSaving)return;
  resetSalesOrderForm();$('sales-order-status').textContent='';renderSalesOrders();
  $('sales-order-dialog').showModal();
  await loadSalesOrders();
}
async function saveSalesOrder(event){
  event.preventDefault();
  if(!currentUser||busy)return;
  if(salesOrderSaving){showDuplicateSalesOrderNotice();return;}
  const orderDate=$('sales_order_date').value;
  const selectedDraftLines=editingSalesOrderId?salesDraftLines:salesDraftLines.filter(line=>line.selected!==false);
  if(!salesOrderHeaderIsValid()){
    $('sales-order-status').textContent='수주일자·수주번호·수주형태·거래처를 입력하고 수주 품목을 한 개 이상 추가하세요.';
    return;
  }
  if(!selectedDraftLines.length){
    $('sales-order-status').textContent=salesDraftLines.length
      ?'일괄저장할 품목을 관리 체크박스에서 선택하세요.'
      :'수주 품목을 한 개 이상 추가하세요.';
    return;
  }
  if(selectedDraftLines.length>100){
    $('sales-order-status').textContent='한 번에 저장할 수 있는 수주 품목은 최대 100개입니다.';
    return;
  }
  const generation=authGeneration;
  salesOrderSaving=true;$('sales-order-editor').disabled=true;$('sales-order-status').textContent='수주를 저장하는 중…';
  const updatingGroupId=editingSalesOrderId||salesDraftGroupId;
  const isEditing=!!editingSalesOrderId;
  try{
    const existingGroupLines=editingSalesOrderId?[]:updatingGroupId
      ? salesOrders.filter(order=>(order.order_group_id||order.id)===updatingGroupId).map(salesOrderRecordPayload)
      : [];
    const rpcArgs={
      p_order_date:orderDate,p_order_number:$('sales_order_number').value.trim(),
      p_order_type:$('sales_order_type').value,p_vendor_name:$('sales_vendor_name').value.trim(),
      p_vendor_contact:$('sales_vendor_contact').value.trim(),p_delivery_method:$('sales_delivery_method').value.trim(),
      p_lines:[...existingGroupLines,...selectedDraftLines.map(salesOrderLinePayload)]
    };
    const {data,error}=updatingGroupId
      ? await client.rpc('update_sales_order_group',{p_group_id:updatingGroupId,...rpcArgs})
      : await client.rpc('register_sales_order_group',rpcArgs);
    if(error)throw error;
    if(generation!==authGeneration)return;
    const updatedOrders=data.orders||[];
    salesOrders=[...updatedOrders,...salesOrders.filter(order=>(order.order_group_id||order.id)!==data.group_id)]
      .sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesBalance();
    const total=updatedOrders.reduce((sum,order)=>sum+Number(order.amount||0),0);
    const sequence=updatedOrders.map(order=>Number(order.sequence_id)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
    if(isEditing)resetSalesOrderForm();
    else{
      const savedDraftIds=new Set(selectedDraftLines.map(line=>String(line.draftId)));
      salesDraftLines=salesDraftLines.filter(line=>!savedDraftIds.has(String(line.draftId)));
      salesDraftGroupId=data.group_id;
      renderSalesDraftLines();
    }
    $('sales-order-status').textContent=(isEditing?'수주를 수정했습니다.':'수주를 저장했습니다.')+' 일련번호 '+number(sequence)+' · 총수주금액 '+money(total)+'원';
  }catch(error){
    if(generation===authGeneration)$('sales-order-status').textContent=String(error?.message||'').includes('register_sales_order_group')
      ?'다품목 수주 DB 설정이 필요합니다. supabase/sales-order-groups.sql을 실행하세요.'
      :errorText(error);
  }
  finally{salesOrderSaving=false;$('sales-order-editor').disabled=false;updateSalesOrderSaveButton();}
}
async function registerSalesOrderLine(draftId){
  if(!currentUser||busy)return;
  if(salesOrderSaving){showDuplicateSalesOrderNotice();return;}
  if(editingSalesOrderId){
    window.alert('기존 수주를 수정하는 동안에는 품목별 개별 등록을 할 수 없습니다. 변경 사항 저장을 사용하세요.');
    return;
  }
  const line=salesDraftLines.find(row=>String(row.draftId)===String(draftId));
  if(!line){showDuplicateSalesOrderNotice();return;}
  if(!salesOrderHeaderIsValid()||!validOrderDueDate(line.due_date)){
    $('sales-order-status').textContent='수주 상단의 필수 정보를 입력하고 품목 내용을 확인하세요.';
    return;
  }
  const generation=authGeneration,orderDate=$('sales_order_date').value;
  salesOrderSaving=true;$('sales-order-editor').disabled=true;
  $('sales-order-status').textContent='선택한 수주 품목을 등록하는 중…';renderSalesDraftLines();
  try{
    const groupId=editingSalesOrderId||salesDraftGroupId;
    const currentGroup=groupId?salesOrders.filter(order=>(order.order_group_id||order.id)===groupId):[];
    const lines=[...currentGroup.map(salesOrderRecordPayload),salesOrderLinePayload(line)];
    const rpcResult=groupId
      ? await client.rpc('update_sales_order_group',{p_group_id:groupId,
        p_order_date:orderDate,p_order_number:$('sales_order_number').value.trim(),
        p_order_type:$('sales_order_type').value,p_vendor_name:$('sales_vendor_name').value.trim(),
        p_vendor_contact:$('sales_vendor_contact').value.trim(),p_delivery_method:$('sales_delivery_method').value.trim(),p_lines:lines})
      : await client.rpc('register_sales_order_group',{
      p_order_date:orderDate,p_order_number:$('sales_order_number').value.trim(),
      p_order_type:$('sales_order_type').value,p_vendor_name:$('sales_vendor_name').value.trim(),
      p_vendor_contact:$('sales_vendor_contact').value.trim(),p_delivery_method:$('sales_delivery_method').value.trim(),
      p_lines:lines
    });
    const {data,error}=rpcResult;
    if(error)throw error;
    if(generation!==authGeneration)return;
    const registeredOrders=data?.orders||[];
    if(!registeredOrders.some(order=>order.product_name===line.product_name&&
      order.specification===(line.specification||'')&&order.unit===line.unit&&Number(order.quantity)===Number(line.quantity)&&
      Number(order.unit_price)===Number(line.unit_price)&&String(order.due_date).slice(0,10)===line.due_date))
      throw new Error('수주 등록 응답에 선택한 품목이 없습니다.');
    const resultGroupId=data.group_id||registeredOrders[0].order_group_id;
    if(groupId){
      salesOrders=[...registeredOrders,...salesOrders.filter(order=>(order.order_group_id||order.id)!==groupId)]
        .sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    }else{
      salesOrders=[...registeredOrders,...salesOrders].sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    }
    salesDraftGroupId=resultGroupId;
    salesDraftLines=salesDraftLines.filter(row=>String(row.draftId)!==String(draftId));
    renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesBalance();renderSalesDraftLines();updateIssueSalesOrders();
    const order=registeredOrders[0];
    $('sales-order-status').textContent='수주 품목을 개별 등록했습니다. 일련번호 '+number(order.sequence_id)+' · '+order.product_name;
  }catch(error){
    if(generation===authGeneration)$('sales-order-status').textContent='수주 품목 등록에 실패했습니다. '+errorText(error);
  }finally{
    salesOrderSaving=false;$('sales-order-editor').disabled=false;renderSalesDraftLines();
  }
}
function openSalesOrderFilePicker(){
  if(!currentUser||busy||salesOrderSaving)return;
  $('sales-order-import-file').value='';$('sales-order-import-file').click();
}
async function importSalesOrderFile(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||!currentUser||busy||salesOrderSaving)return;
  if(!window.ExcelJS){window.alert('Excel 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 시도하세요.');return;}
  const generation=authGeneration;
  let parsed;
  try{
    const workbook=new window.ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    parsed=window.parseSalesOrderImportWorkbook(workbook,PRODUCT_UNITS);
  }catch(error){
    window.alert('Excel 파일을 읽지 못했습니다. .xlsx 파일인지 확인하세요. '+errorText(error));
    return;
  }
  if(generation!==authGeneration)return;
  if(parsed.errors.length){
    const shown=parsed.errors.slice(0,30),more=parsed.errors.length-shown.length;
    window.alert('Excel 수주 품목을 불러올 수 없습니다. 열 제목과 오류 행을 확인하세요.\n\n'
      +shown.join('\n')+(more>0?`\n그 외 ${more}건의 오류가 더 있습니다.`:''));
    return;
  }
  if(salesDraftLines.length+parsed.rows.length>100){
    window.alert('수주 품목은 한 번에 최대 100개까지 저장할 수 있습니다. 기존 품목을 저장한 뒤 다시 업로드하세요.');
    return;
  }
  salesDraftLines.push(...parsed.rows.map(line=>({...line,draftId:'sales-draft-'+(++salesDraftSequence),selected:true})));
  renderSalesDraftLines();
  $('sales-order-status').textContent='Excel에서 수주 품목 '+number(parsed.rows.length)+'건을 불러왔습니다. 수주 상단 정보를 확인한 뒤 저장하세요.';
}
async function readAll(table,order = 'id',productId = null) {
  const result = [];
  for (let offset=0;;offset+=500) {
    let query = client.from(table).select('*').order(order).range(offset,offset+499);
    if (productId) query = query.eq('product_id',productId);
    const {data,error} = await query;
    if (error) throw error;
    result.push(...data.map(row=>({...row,...(row.received_date?{received_date:String(row.received_date).slice(0,10)}:{})}))); if (data.length<500) return result;
  }
}
async function readAgedStock() {
  const rows=[],cutoff=sixMonthsAgoDate();
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from('stock_aging').select('*').gt('remaining_quantity',0)
      .lte('received_date',cutoff).order('received_date',{ascending:true}).order('sequence_id',{ascending:true}).range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)return stockAgingRows(rows);
  }
}
async function findMovementProductIds(startDate,endDate,kind) {
  if (!startDate && !endDate && !kind) return null;
  const productIds=new Set();
  for (let offset=0;;offset+=500) {
    let query=client.from('stock_movements').select('product_id').order('id');
    if (startDate) query=query.gte('movement_date',startDate);
    if (endDate) query=query.lte('movement_date',endDate);
    if (kind) query=query.eq('kind',kind);
    const {data,error}=await query.range(offset,offset+499);
    if (error) throw error;
    data.forEach(row=>productIds.add(String(row.product_id)));
    if (data.length<500) return productIds;
  }
}
function updateSupplierOptions() {
  const select=$('supplier-filter'),selected=select.value;
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent='거래처를 선택하세요';select.append(placeholder);
  [...new Set(items.filter(stockLedgerManaged).map(item=>String(item.supplier||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
async function applyInventorySearch() {
  if (searching) return;
  const generation=authGeneration;
  const startDate=$('movement-start-date').value,endDate=$('movement-end-date').value,selection=$('movement-kind-filter').value;
  const kind=selection==='supplier'?'':selection,supplier=selection==='supplier' ? $('supplier-filter').value.trim().toLowerCase() : '';
  if (startDate && endDate && startDate>endDate) {
    notify('시작일은 종료일보다 늦을 수 없습니다.',true);
    return;
  }
  if (selection==='supplier' && !supplier) {
    notify('거래처별 검색을 하려면 거래처를 선택하세요.',true);
    return;
  }
  searching=true;$('apply-search').disabled=true;$('clear-search').disabled=true;
  $('movement-start-date').disabled=true;$('movement-end-date').disabled=true;$('movement-kind-filter').disabled=true;$('supplier-filter').disabled=true;
  try {
    const dateProductIds=await findMovementProductIds(startDate,endDate,kind);
    if (generation!==authGeneration) return;
    appliedDateProductIds=dateProductIds;
    appliedSupplier=supplier;
    render();
  } catch (error) {
    notify(errorText(error),true);
  } finally {
    searching=false;$('apply-search').disabled=false;$('clear-search').disabled=false;
    $('movement-start-date').disabled=false;$('movement-end-date').disabled=false;$('movement-kind-filter').disabled=false;$('supplier-filter').disabled=false;
  }
}
function clearInventorySearch() {
  $('movement-start-date').value='';$('movement-end-date').value='';$('movement-kind-filter').value='';$('supplier-filter').value='';
  $('supplier-filter-wrap').hidden=true;
  appliedDateProductIds=null;appliedSupplier='';render();
}
function loadStock() {
  if (loadPromise) { reloadQueued = true; return loadPromise; }
  loadPromise = (async () => {
    do {
      reloadQueued = false;
      if (!currentUser) return;
      const generation = authGeneration;
      const access = await client.rpc('inventory_access_allowed');
      if (access.error) throw access.error;
      if (!access.data) {
        await updateSession(null); client.auth.signOut({scope:'local'}).catch(()=>{});
        throw {message:'ACCOUNT_DISABLED'};
      }
      const [summary,aging] = await Promise.all([
        readAll('stock_summary'),
        readAgedStock()
      ]);
      if (generation!==authGeneration || !currentUser) return;
      items = summary;agedStock=aging;updateSupplierOptions();render();
      if ($('movement-dialog').open && mode==='issue') loadSelectedLots();
    } while (reloadQueued);
  })().finally(()=>{loadPromise=null;});
  return loadPromise;
}
function scheduleSync() {
  clearTimeout(syncTimer); syncTimer = setTimeout(async()=>{
    if (!currentUser || busy) return;
    try { await loadStock(); } catch (error) { notify(errorText(error),true); }
  },250);
}
function scheduleSalesOrderSync() {
  clearTimeout(salesSyncTimer);
  salesSyncTimer=setTimeout(()=>{if(currentUser&&!salesOrderSaving)loadSalesOrders();},250);
}
function subscribeToChanges() {
  client.channel('stock-ledger').on('postgres_changes',{event:'*',schema:'public',table:'stock_products'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_lots'},scheduleSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'sales_orders'},scheduleSalesOrderSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'purchase_orders'},schedulePurchaseOrderSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'purchase_order_lines'},schedulePurchaseOrderSync)
    .on('postgres_changes',{event:'*',schema:'public',table:'purchase_order_receipts'},schedulePurchaseOrderSync)
    .subscribe(status=>{
      if (!currentUser) return;
      $('sync-status').textContent = status==='SUBSCRIBED' ? '● 실시간 연결됨' : '○ 자동 동기화 · 5초 간격';
      if (status==='SUBSCRIBED') scheduleSync();
    });
}
async function refreshAdminAccess() {
  const generation = authGeneration;
  $('admin-link').hidden = true;
  $('admin-folder').hidden = true;
  if (!currentUser) return;
  try {
    const {data,error} = await client.auth.getSession();
    if (error || !data.session || generation !== authGeneration) return;
    const response = await fetch('/api/admin-users?action=permissions',{
      headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'
    });
    if (!response.ok) return;
    const result = await response.json();
    if (generation === authGeneration && currentUser) {
      $('admin-link').hidden = result.is_admin !== true;
      $('admin-folder').hidden = result.is_admin !== true;
    }
  } catch { /* 권한 조회에 실패하면 관리자 링크를 숨긴 상태로 유지합니다. */ }
}
async function updateSession(session) {
  const next = session?.user || null;
  if (currentUser && next?.id===currentUser.id || !currentUser && !next && authGeneration>0) return;
  authGeneration++; currentUser = next; client.removeAllChannels(); clearTimeout(syncTimer);clearTimeout(salesSyncTimer);clearTimeout(purchaseSyncTimer);lotsGeneration++;
  if(typeof resetVendorSession==='function')resetVendorSession();
  appliedSalesBalanceFilters={startDate:'',endDate:'',orderType:''};
  $('sales-balance-start-date').value='';$('sales-balance-end-date').value='';$('sales-balance-type-filter').value='';
  appliedDateProductIds=null;appliedSupplier='';salesRegisterQuery='';salesRegisterSearched=false;salesRegisterVisibleOrders=[];salesRegisterTargetOrderIds=[];$('movement-start-date').value='';$('movement-end-date').value='';$('movement-kind-filter').value='';$('supplier-filter').value='';$('supplier-filter-wrap').hidden=true;
  $('admin-link').hidden = true;
  $('admin-folder').hidden = true;
  $('sidebar-toggle').hidden = !currentUser;
  $('header-account').hidden = !currentUser;
  $('profile-menu').hidden=true;
  $('profile-menu-toggle').setAttribute('aria-expanded','false');
  $('profile-details').hidden=true;
  $('profile-info-menu').setAttribute('aria-expanded','false');
  $('app-layout').classList.toggle('signed-in',!!currentUser);
  items = []; agedStock=[];assetClassifications=[];editingAssetClassificationId='';salesOrders=[];salesDraftLines=[];purchaseOrders=[];purchaseOrderLines=[];purchaseReceipts=[];purchaseDraftLines=[];purchaseOrderVendors=[];purchaseOrderVendorsLoaded=false;populatePurchaseOrderVendorOptions();renderSalesOrders();renderSalesStatus();renderSalesStatus('query');renderSalesRegister();renderSalesBalance();updateSupplierOptions();render();
  $('login-panel').hidden = !!currentUser; $('workspace').hidden = !currentUser;
  const metadata=currentUser?.user_metadata||{};
  const profileName=[metadata.full_name,metadata.name,metadata.display_name].find(value=>typeof value==='string'&&value.trim())?.trim()||currentUser?.email?.split('@')[0]||'사용자';
  $('profile-name').textContent=profileName;
  $('profile-detail-name').textContent=profileName;
  $('profile-detail-email').textContent=currentUser?.email||'';
  if (!currentUser) {
    clearMinimizedDialogs();
    $('password-dialog').close();$('movement-dialog').close(); $('product-info-dialog').close(); $('product-info-status-dialog').close(); $('asset-classification-dialog').close(); $('sales-order-dialog').close(); $('sales-status-dialog').close(); $('sales-status-query-dialog').close(); $('sales-register-dialog').close(); $('sales-register-confirm-dialog').close(); $('purchase-order-dialog').close(); $('purchase-receive-dialog').close(); $('detail-dialog').close(); $('current-stock-dialog').close(); $('stock-risk-dialog').close(); $('long-stock-dialog').close(); $('product-list-dialog').close(); $('movement-list-dialog').close(); $('print-settings-dialog').close(); notify('등록된 계정으로 로그인해 주세요.'); return;
  }
  try {
    await loadStock();
    if(currentUser){
      try{await loadAssetClassifications();}
      catch(error){notify('품목 자산 분류 DB 설정이 필요합니다. Supabase에서 supabase/item-asset-classification.sql을 실행하세요.',true);}
      await loadSalesOrders();subscribeToChanges();notify('재고 현황을 불러왔습니다.');await refreshAdminAccess();
    }
  }
  catch (error) { notify(errorText(error),true); }
}
function activeProduct() {
  const code = $('product_code').value.trim().toUpperCase();
  return items.find(item=>item.product_code===code&&stockLedgerManaged(item));
}
function inProgressSalesOrders(){
  return salesOrders.filter(order=>salesOrderStatus(order)==='진행'
    &&Number(order.quantity)>Number(order.shipped_quantity||0));
}
function salesOrdersForIssue(product){
  if(!product)return [];
  const trim=value=>String(value||'').trim();
  return inProgressSalesOrders().filter(order=>
    trim(order.product_name)===trim(product.product_name)
    &&trim(order.specification)===trim(product.specification)
    &&order.unit===(product.unit||'EA(개)'));
}
function updateIssueSalesOrders(reset=false){
  const select=$('issue-sales-order');
  if(mode!=='issue'||!select?.replaceChildren)return;
  const product=activeProduct(),orders=inProgressSalesOrders();
  let previous=reset?'':select.value;
  if(previous&&product&&!salesOrdersForIssue(product).some(order=>order.id===previous))previous='';
  select.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='수주 연결 안 함 (선택)';select.append(empty);
  orders.forEach(order=>{
    const option=document.createElement('option');option.value=order.id;
    option.textContent=order.order_number+' · '+(order.vendor_name||'거래처 미입력')+' · '+order.product_name
      +' · 납기 '+String(order.due_date||'').slice(0,10)
      +' · 잔여 '+number(Number(order.quantity)-Number(order.shipped_quantity||0))+' '+order.unit;
    select.append(option);
  });
  select.value=previous||'';select.disabled=Boolean(editingMovementId)||orders.length===0;
}
function selectIssueSalesOrder(){
  const order=inProgressSalesOrders().find(row=>row.id===$('issue-sales-order').value);
  if(!order)return;
  const trim=value=>String(value||'').trim();
  const product=items.find(item=>stockLedgerManaged(item)
    &&trim(item.product_name)===trim(order.product_name)
    &&trim(item.specification)===trim(order.specification)
    &&(item.unit||'EA(개)')===order.unit);
  if(!product){
    $('form-message').textContent='선택한 수주 품목과 품명·규격·단위가 같은 재고관리 품목이 없습니다. 품목정보를 확인하세요.';
    return;
  }
  $('product_code').value=product.product_code;
  populateProduct('product_code');
  $('movement_quantity').value=String(Number(order.quantity)-Number(order.shipped_quantity||0));
  requestId=crypto.randomUUID();$('form-message').textContent='';updateAmounts();
}
function productForLookup(source,value=$(source).value) {
  const normalizedValue=String(value||'').trim();
  if(!normalizedValue)return null;
  if(source==='product_code'||source==='info_product_code')return items.find(item=>item.product_code===normalizedValue.toUpperCase())||null;
  if(source==='specification'||source==='info_specification'){
    const normalized=normalizedValue.toLocaleLowerCase();
    const matches=items.filter(item=>String(item.specification||'').trim().toLocaleLowerCase()===normalized);
    return matches.length===1?matches[0]:null;
  }
  return null;
}
function populateProductInfo(source) {
  if(editingProductInfoId||productInfoNewMode)return;
  const item=productForLookup(source);
  selectedProductInfoCode=item?.product_code||'';
  ['info_product_name','info_material','info_color','info_specification'].forEach(id=>$(id).readOnly=false);
  $('info_standard_stock_quantity').readOnly=item?.standard_stock_quantity!==null&&item?.standard_stock_quantity!==undefined;
  $('info_product_category').disabled=!!item?.classification_id;
  $('info_unit').disabled=!!item?.unit;
  if(!item){
    $('info_product_category').options[0].textContent='품목자산분류를 선택하세요';
    return;
  }
  if(item.classification_id)$('info_product_category').value=item.classification_id;
  else $('info_product_category').options[0].textContent=item.product_category+' (기존 분류)';
  const fillBlankOnly=source==='info_specification';
  ['product_code','product_name','specification','material','color','unit','standard_stock_quantity'].forEach(key=>{
    const field=$('info_'+key),value=item[key]??(key==='unit'?'EA(개)':'');
    if(fillBlankOnly&&String(field.value).trim())return;
    field.value=value;
  });
}
function populateProduct(source='product_code') {
  const found = productForLookup(source),item=found&&!stockLedgerManaged(found)?null:found;
  const previous = selectedCode; selectedCode = item?.product_code || '';
  $('form-message').textContent=found&&!stockLedgerManaged(found)?'이 품목은 재고 관리 대상이 아니므로 기초재고·일반 입출고에 사용할 수 없습니다. 발주 등록에서 발주 및 입고 처리하세요.':'';
  if(item)$('product_code').value=item.product_code;
  else if(source==='specification')$('product_code').value='';
  PRODUCT_FIELDS.filter(key=>key!=='product_code').forEach(key=>{
    if(key==='unit'){
      $('unit').disabled=!!item;
      if(item)$('unit').value=item.unit||'EA(개)';
      else if(previous)$('unit').value='EA(개)';
      return;
    }
    const optionalDetail=key==='storage_location'||key==='supplier';
    $(key).readOnly=mode==='issue'||!item||!optionalDetail||!!item[key];
    if(item)$(key).value=item[key]||'';
    else if(previous&&key!==source)$(key).value='';
  });
  if(mode==='issue'){productLots=[];productLotsReady=false;updateIssueSalesOrders(previous!==selectedCode);updateAmounts();loadSelectedLots();}
}
async function loadSelectedLots() {
  const item = activeProduct(), generation = ++lotsGeneration;
  productLotsReady=false;
  if (!item) { productLots=[]; updateAmounts(); return; }
  try {
    const lots = await readAll('stock_lots','id',item.id);
    if (generation!==lotsGeneration || !$('movement-dialog').open || mode!=='issue') return;
    productLots = lots; productLotsReady=true; updateAmounts();
  } catch (error) { if (generation===lotsGeneration) $('form-message').textContent=errorText(error); }
}
function updateAmounts() {
  const quantity = Number($('movement_quantity').value), cost = Number($('movement_cost').value);
  const selectedItem=items.find(item=>item.product_code===$('product_code').value.trim().toUpperCase()),valueDisabled=selectedItem?.value_management_disabled===true;
  if(mode!=='issue'){
    $('movement_cost').readOnly=valueDisabled;
    if(valueDisabled)$('movement_cost').value='0';
    $('movement_amount').value=money(quantity*(valueDisabled?0:cost));return;
  }
  const unit=$('unit').value||'EA(개)';
  $('fifo-remaining-heading').textContent=`현재 잔량 (${unit})`;
  $('fifo-issue-heading').textContent=`차감수량 (${unit})`;
  const plan = planFifo(productLots,Number.isSafeInteger(quantity) && quantity>0 ? quantity : 0,$('movement_date').value);
  $('movement_cost').value = plan.shortage>0 ? '' : plan.unitCost.toFixed(2); $('movement_amount').value = plan.shortage>0 ? '재고 부족' : money(valueDisabled?0:plan.amount);
  renderFifoPreview(plan.allocations);
  $('form-message').textContent = !activeProduct() ? '출고할 기존 품번을 선택하세요.' : plan.shortage>0 ? `선택한 날짜 기준 재고가 ${number(plan.shortage)} ${unit} 부족합니다.` : '';
}
function validateIssueQuantity(showAlert=false) {
  if(mode!=='issue'||!productLotsReady)return true;
  const quantity=Number($('movement_quantity').value),date=$('movement_date').value;
  if(!Number.isSafeInteger(quantity)||quantity<1||!validDate(date))return true;
  const plan=planFifo(productLots,quantity,date);
  if(plan.shortage<=0)return true;
  if(showAlert){
    const unit=$('unit').value||'EA(개)',available=quantity-plan.shortage;
    window.alert(`출고 수량이 재고수량을 초과했습니다. 선택한 출고일자 기준 출고 가능 수량은 ${number(available)} ${unit}입니다.`);
  }
  return false;
}
function openMovement(kind) {
  if (!currentUser || busy) return;
  if(!items.some(stockLedgerManaged)){window.alert('수량·금액 관리 대상 품목정보를 먼저 등록해 주세요.');return;}
  mode = kind;editingMovementId='';$('save-movement').textContent='저장';$('bulk-delete-movement').hidden=true;const [title,prefix,dateLabel] = MODE_LABELS[mode];
  $('movement-form').reset(); selectedCode=''; productLots=[]; productLotsReady=false; lotsGeneration++; requestId=crypto.randomUUID();
  $('dialog-title').textContent = mode==='opening'?'기초재고 등록':title;
  $('dialog-description').textContent = mode==='issue' ? '먼저 들어온 입고 건부터 자동 차감합니다.'
    : mode==='receipt' ? '품목정보에 등록된 품번을 선택하세요. Excel 업로드에는 품목분류, 품번, 품명, 규격, 색상, 저장위치, 납품업체, 입고일자, 입고수량, 입고단가 열이 필요합니다.'
    : '품목정보에 등록된 품번을 선택하세요.';
  $('import-receipt-button').hidden=mode!=='receipt';
  $('receipt-import-file').value='';
  $('date-label').textContent=dateLabel; $('quantity-label').textContent=prefix+'수량'; $('cost-label').textContent=prefix+'단가'; $('amount-label').textContent=prefix+'금액';
  $('movement_date').value=todayDate(); $('movement_date').max=todayDate();
  $('movement_cost').readOnly=mode==='issue'; $('movement_cost').required=mode!=='issue'; $('movement_cost').value='0';
  $('fifo-section').hidden=mode!=='issue'; $('form-message').textContent=''; $('movement-editor').disabled=false;
  if($('issue-sales-order-field'))$('issue-sales-order-field').hidden=mode!=='issue';
  updateIssueSalesOrders(true);
  PRODUCT_FIELDS.forEach(key=>{if(key==='unit')$(key).disabled=false;else $(key).readOnly=key!=='product_code';});
  $('product-codes').replaceChildren();
  $('product-specifications').replaceChildren();
  items.filter(stockLedgerManaged).forEach(item=>{
    const option=document.createElement('option');option.value=item.product_code;option.label=item.product_name;$('product-codes').append(option);
    if(item.specification){const specOption=document.createElement('option');specOption.value=item.specification;specOption.label=item.product_code+' · '+item.product_name;$('product-specifications').append(specOption);}
  });
  updateAmounts(); $('movement-dialog').showModal();
  $('edit-existing-movement').textContent=MODE_LABELS[mode][0]+' 내역 수정';
  $('edit-existing-movement').hidden=true;
  if(mode==='issue')loadSalesOrders();
}
async function loadAssetClassifications() {
  const {data,error}=await client.rpc('list_stock_product_classifications');
  if(error)throw error;
  assetClassifications=Array.isArray(data)?data:[];
  renderAssetClassifications();
  updateProductClassificationOptions();
}
function renderAssetClassifications() {
  const body=$('asset-classification-items');body.replaceChildren();
  if(!assetClassifications.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=9;cell.className='empty';cell.textContent='등록된 품목자산분류가 없습니다.';row.append(cell);body.append(row);return;}
  assetClassifications.forEach(classification=>{
    const row=document.createElement('tr');
    [classification.name,classification.inventory_asset_type||'선택하세요',classificationFlag(classification.quantity_management_disabled)?'✓':'',classificationFlag(classification.value_management_disabled)?'✓':'',classificationFlag(classification.shortage_control_enabled)?'✓':'',classificationFlag(classification.is_set_item)?'✓':'',classificationFlag(classification.lot_management_default)?'✓':'',classification.notes||''].forEach(value=>row.append(makeCell(value)));
    const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='수정';button.dataset.classificationId=classification.id;action.append(button);row.append(action);body.append(row);
  });
}
function classificationFlag(value) {
  return value===true||value===1||value==='1'||value==='true';
}
function updateProductClassificationOptions() {
  const select=$('info_product_category'),selected=select.value;select.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='품목자산분류를 선택하세요';select.append(placeholder);
  assetClassifications.forEach(classification=>{const option=document.createElement('option');option.value=classification.id;option.textContent=classification.name+(classification.inventory_asset_type?' · '+classification.inventory_asset_type:' · 재고자산종류 미설정');select.append(option);});
  if([...select.options].some(option=>option.value===selected))select.value=selected;
}
function resetAssetClassificationForm() {
  editingAssetClassificationId='';$('asset-classification-form').reset();$('asset-classification-id').value='';
  $('save-asset-classification').textContent='분류 추가';$('cancel-asset-classification-edit').hidden=true;
}
function editAssetClassification(id) {
  const row=assetClassifications.find(item=>item.id===id);if(!row)return;
  editingAssetClassificationId=row.id;$('asset-classification-id').value=row.id;
  $('asset-classification-name').value=row.name;$('asset-classification-type').value=row.inventory_asset_type||'';
  $('asset-classification-notes').value=row.notes||'';
  $('asset-quantity-disabled').checked=classificationFlag(row.quantity_management_disabled);$('asset-value-disabled').checked=classificationFlag(row.value_management_disabled);
  $('asset-shortage-control').checked=classificationFlag(row.shortage_control_enabled);$('asset-set-item').checked=classificationFlag(row.is_set_item);
  $('asset-lot-default').checked=classificationFlag(row.lot_management_default);
  $('save-asset-classification').textContent='분류 저장';$('cancel-asset-classification-edit').hidden=false;
  $('asset-classification-name').focus();
}
async function saveAssetClassification(event) {
  event.preventDefault();if(!currentUser||busy)return;
  const details={id:editingAssetClassificationId||null,name:$('asset-classification-name').value.trim(),inventory_asset_type:$('asset-classification-type').value,
    quantity_management_disabled:$('asset-quantity-disabled').checked,value_management_disabled:$('asset-value-disabled').checked,
    shortage_control_enabled:$('asset-shortage-control').checked,is_set_item:$('asset-set-item').checked,lot_management_default:$('asset-lot-default').checked,notes:$('asset-classification-notes').value.trim()};
  const generation=authGeneration;busy=true;$('asset-classification-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  $('asset-classification-status').textContent='분류를 저장하는 중…';
  try{
    const {data,error}=await client.rpc('save_stock_product_classification',{p_details:details});if(error)throw error;
    if(generation!==authGeneration)return;
    resetAssetClassificationForm();
    await loadAssetClassifications();
    $('asset-classification-status').textContent='품목자산분류를 저장했습니다. 기존 거래의 단가·금액은 변경되지 않았습니다.';
  }catch(error){if(generation===authGeneration){
    if(/CLASSIFICATION_HAS_LEDGER_HISTORY/.test(error?.message||''))alertBlocked('이 분류에 거래(입출고) 이력이 있습니다.');
    $('asset-classification-status').textContent=errorText(error);
  }}
  finally{busy=false;$('asset-classification-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=false);$('cancel-asset-classification-edit').hidden=!editingAssetClassificationId;}
}
async function showAssetClassifications() {
  if(!currentUser||busy)return;
  resetAssetClassificationForm();$('asset-classification-status').textContent='분류를 불러오는 중…';$('asset-classification-dialog').showModal();
  try{await loadAssetClassifications();$('asset-classification-status').textContent=`품목자산분류 ${number(assetClassifications.length)}개`}
  catch(error){$('asset-classification-status').textContent='분류를 불러오지 못했습니다. Supabase에서 supabase/item-asset-classification.sql을 실행하세요. '+errorText(error);}
}
function renderProductInfoItems() {
  const body=$('product-info-items');body.replaceChildren();
  $('product-info-specifications').replaceChildren();
  if(!productInfoDrafts.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=10;cell.className='empty';cell.textContent='가등록된 품목정보가 없습니다. 품목정보를 입력하고 가등록하거나 Excel을 업로드하세요.';row.append(cell);body.append(row);}
  productInfoDrafts.forEach(draft=>{
    const row=document.createElement('tr'),classification=assetClassifications.find(entry=>entry.id===draft.classification_id||entry.name===draft.product_category);
    row.append(makeCell(draft.product_category||''),makeCell(classification?.inventory_asset_type||'미지정'));
    ['product_code','product_name','specification','material','color','unit'].forEach(key=>row.append(makeCell(draft[key]||'')));
    row.append(makeCell(draft.standard_stock_quantity==null?'':number(draft.standard_stock_quantity)+' '+(draft.unit||'EA(개)')));
    const manage=document.createElement('td'),label=document.createElement('label'),box=document.createElement('input');
    box.type='checkbox';box.checked=draft.checked!==false;box.dataset.productInfoDraft=draft.draftId;
    box.setAttribute('aria-label',draft.product_code+' 일괄 저장 선택');
    box.addEventListener('change',()=>{draft.checked=box.checked;});
    label.append(box,' 저장 선택');manage.append(label);row.append(manage);body.append(row);
  });
  items.forEach(item=>{
    if(item.specification){const specOption=document.createElement('option');specOption.value=item.specification;specOption.label=item.product_code+' · '+item.product_name;$('product-info-specifications').append(specOption);}
  });
}
function duplicateProductInfoField(details,exceptId='',drafts=[]){
  const normalize=value=>String(value||'').trim().toLocaleLowerCase('ko-KR');
  const code=String(details.product_code||'').trim().toUpperCase();
  const specification=normalize(details.specification);
  const editedIds=new Set([exceptId,...drafts.map(draft=>draft.productId)].filter(Boolean));
  const others=[...items.filter(item=>!editedIds.has(item.id)),...drafts.filter(draft=>draft!==details)];
  if(code&&others.some(item=>String(item.product_code||'').trim().toUpperCase()===code))return '품번';
  if(specification&&others.some(item=>normalize(item.specification)===specification))return '규격';
  return '';
}
function filteredProductInfoStatusItems() {
  const filters=[
    ['product_code',$('product-info-status-code-query').value],
    ['product_name',$('product-info-status-name-query').value],
    ['specification',$('product-info-status-specification-query').value]
  ].map(([key,value])=>[key,value.trim().toLocaleLowerCase('ko-KR')]).filter(([,value])=>value);
  return items.filter(item=>!filters.length||filters.some(([key,value])=>String(item[key]||'').toLocaleLowerCase('ko-KR').includes(value)));
}
function renderProductInfoStatus() {
  const body=$('product-info-status-items');
  const filtered=filteredProductInfoStatusItems();
  body.replaceChildren();
  if(!filtered.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=10;cell.className='empty';cell.textContent=items.length?'검색 결과가 없습니다.':'등록된 품목정보가 없습니다.';row.append(cell);body.append(row);return;}
  filtered.forEach(item=>{
    const row=document.createElement('tr');
    ['product_category','product_code','product_name','specification','material','color','unit'].forEach(key=>row.append(makeCell(item[key]||'')));
    row.append(makeCell(number(item.standard_stock_quantity)+' '+(item.unit||'EA(개)')));
    const action=document.createElement('td'),button=document.createElement('button');
    row.append(makeCell(item.created_by_name||'기존 등록자'));
    button.type='button';button.className='secondary';button.textContent='수정';button.dataset.productInfoId=item.id;
    button.setAttribute('aria-label',item.product_code+' 품목정보 수정');
    const remove=document.createElement('button');
    remove.type='button';remove.className='secondary danger';remove.textContent='삭제';remove.dataset.productInfoDeleteId=item.id;
    remove.setAttribute('aria-label',item.product_code+' 품목정보 삭제');
    action.append(button,remove);row.append(action);body.append(row);
  });
}
const PRODUCT_DELETE_BLOCKED_MESSAGE='해당 품목은 삭제할 수 없으니 이후 단계에서 처리된 내용을 삭제 하여 주시기 바랍니다.';
async function deleteProductInfo(id){
  const item=items.find(row=>row.id===id);if(!item||busy)return;
  if(productInfoDrafts.some(draft=>draft.productId===id)){
    window.alert('이미 가등록 목록에 있는 품목입니다. 품목정보 등록 창에서 일괄 저장 또는 일괄 삭제를 진행하세요.');
    return;
  }
  try{
    if(await productInfoUsedInPurchase(id)||await productInfoUsedInMovements(id)){window.alert(PRODUCT_DELETE_BLOCKED_MESSAGE);return;}
  }catch(error){
    window.alert('발주 사용 여부를 확인하지 못했습니다. 삭제를 진행하지 않습니다. '+errorText(error));
    return;
  }
  if(!window.confirm(`품목 '${item.product_code} ${item.product_name||''}'을(를) 삭제하시겠습니까?`))return;
  try{
    const {error}=await client.rpc('delete_stock_product',{p_product_id:id});
    if(error)throw error;
  }catch(error){
    window.alert(/PRODUCT_USED_IN_PURCHASE|PRODUCT_HAS_LEDGER_HISTORY/.test(error?.message||'')?PRODUCT_DELETE_BLOCKED_MESSAGE:'품목정보를 삭제하지 못했습니다. '+errorText(error));
    return;
  }
  items=items.filter(row=>row.id!==id);
  renderProductInfoStatus();renderProductInfoItems();
  $('product-info-status-list-message').textContent=`등록 품목 ${number(items.length)}개`;
}
function exportProductInfoStatusExcel() {
  const rows=filteredProductInfoStatusItems();
  return downloadDataWorkbook('export-product-info-status','품목정보 현황','품목정보 현황',
    ['품목분류','품번','품명','규격','재질','색상','단위','적정재고','등록자명'],
    rows.map(item=>[item.product_category||'',item.product_code||'',item.product_name||'',item.specification||'',item.material||'',item.color||'',item.unit||'',Number(item.standard_stock_quantity||0),item.created_by_name||'기존 등록자']),
    [7],'내보낼 품목정보가 없습니다.');
}
async function showProductInfo() {
  if(!currentUser||busy)return;
  productInfoDrafts=[];resetProductInfoForm();
  renderProductInfoItems();$('product-info-status').textContent='품목자산분류를 확인하는 중…';
  $('product-info-dialog').showModal();
  try{
    await loadAssetClassifications();
    $('product-info-status').textContent=assetClassifications.length?'':'사용 가능한 품목자산분류를 먼저 등록하세요.';
  }catch(error){
    $('product-info-status').textContent='품목자산분류를 불러오지 못했습니다. 분류 설정과 DB 적용 상태를 확인하세요. '+errorText(error);
  }
}
function showProductInfoStatus() {
  if(!currentUser||busy)return;
  ['product-info-status-code-query','product-info-status-name-query','product-info-status-specification-query'].forEach(id=>$(id).value='');
  renderProductInfoStatus();$('product-info-status-list-message').textContent=`등록 품목 ${number(items.length)}개`;
  $('product-info-status-dialog').showModal();$('product-info-status-code-query').focus();
}
function resetProductInfoForm(){
  editingProductInfoId='';selectedProductInfoCode='';
  $('product-info-form').reset();
  $('save-product-info').textContent='일괄 저장';$('cancel-product-info-edit').hidden=true;
  $('info_product_category').disabled=false;$('info_unit').disabled=false;
  ['info_product_code','info_product_name','info_specification','info_material','info_color','info_standard_stock_quantity'].forEach(id=>$(id).readOnly=false);
  $('info_product_category').options[0].textContent='품목자산분류를 선택하세요';
}
async function productInfoUsedInPurchase(productId){
  if(purchaseOrderLines.some(line=>line.product_id===productId))return true;
  const {count,error}=await client.from('purchase_order_lines').select('id',{count:'exact',head:true}).eq('product_id',productId);
  if(error)throw error;
  return (count||0)>0;
}
async function productInfoUsedInMovements(productId){
  const {count,error}=await client.from('stock_movements').select('id',{count:'exact',head:true}).eq('product_id',productId);
  if(error)throw error;
  return (count||0)>0;
}
function alertBlocked(detail){
  window.alert('처리할 수 없습니다.\n'+detail+'\n먼저 이후 프로세스의 data를 삭제한 뒤 다시 시도하세요.');
}
async function movementUsedDownstream(movement){
  if(movement.kind==='issue'){
    if(!movement.sales_order_id)return '';
    const {data,error}=await client.from('sales_orders').select('*').eq('id',movement.sales_order_id).maybeSingle();
    if(error)throw error;
    return data&&salesOrderStatus(data)==='완료'?'이 출고는 매출 등록이 완료된 수주에 연결되어 있습니다.':'';
  }
  const {data,error}=await client.from('stock_lots').select('quantity,remaining_quantity').eq('movement_id',movement.id);
  if(error)throw error;
  return (data||[]).some(lot=>Number(lot.remaining_quantity)<Number(lot.quantity))?'이 입고(기초) 수량이 이미 출고에 사용되었습니다.':'';
}
function salesOrderDownstreamReason(id){
  const order=salesOrders.find(row=>row.id===id);if(!order)return '';
  const groupId=order.order_group_id||order.id;
  const group=salesOrders.filter(row=>(row.order_group_id||row.id)===groupId);
  if(group.some(row=>Number(row.shipped_quantity)>0))return '이 수주는 출고 처리된 내역이 있습니다.';
  if(group.some(row=>salesOrderStatus(row)==='완료'))return '이 수주는 매출 등록이 완료되었습니다.';
  return '';
}
async function editProductInfo(id){
  const item=items.find(row=>row.id===id);if(!item||busy)return;
  if(!window.confirm('품목정보를 수정하시겠습니까?'))return;
  if(productInfoDrafts.some(draft=>draft.productId===id)){
    window.alert('이미 가등록 목록에 있는 품목입니다. 품목정보 등록 창에서 일괄 저장 또는 일괄 삭제를 진행하세요.');
    return;
  }
  let downstream='';
  try{
    if(await productInfoUsedInPurchase(id))downstream='발주';
    else if(await productInfoUsedInMovements(id))downstream='입출고';
  }catch(error){
    window.alert('발주 사용 여부를 확인하지 못했습니다. 수정을 진행하지 않습니다. '+errorText(error));
    return;
  }
  $('product-info-status-dialog').close();
  resetProductInfoForm();
  editingProductInfoId=item.id;selectedProductInfoCode='';productInfoNewMode=false;
  updateProductClassificationOptions();
  [['product_category','classification_id'],['product_code','product_code'],['product_name','product_name'],
    ['specification','specification'],['material','material'],['color','color'],['unit','unit'],
    ['standard_stock_quantity','standard_stock_quantity']].forEach(([field,key])=>$('info_'+field).value=item[key]??'');
  lockFilledProductInfoFields(item);
  if(downstream)window.alert(`${downstream} 단계 이후 사용된 품목정보입니다.\n입력된 항목은 수정할 수 없고 비어 있는 항목만 입력할 수 있습니다.\n입력된 항목을 수정하려면 먼저 ${downstream} 등 이후 프로세스의 data를 삭제하세요.`);
  $('cancel-product-info-edit').hidden=false;
  $('product-info-status').textContent=downstream
    ?'비어 있는 항목만 입력할 수 있습니다. 입력 후 품목정보 가등록을 누르세요.'
    :'품목정보를 수정한 뒤 품목정보 가등록을 누르세요.';
  renderProductInfoItems();
  $('product-info-dialog').showModal();
  $('info_product_code').focus();
}
function lockFilledProductInfoFields(item){
  const filled=key=>key==='standard_stock_quantity'?item[key]!==null&&item[key]!==undefined:String(item[key]??'').trim()!=='';
  $('info_product_code').readOnly=true;
  ['product_name','specification','material','color','standard_stock_quantity'].forEach(key=>$('info_'+key).readOnly=filled(key));
  $('info_product_category').disabled=!!item.classification_id;
  $('info_unit').disabled=!!item.unit;
}async function importProductInfoFile(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||!currentUser||busy)return;
  if(editingProductInfoId){
    window.alert('품목정보 수정 중에는 Excel 업로드를 시작할 수 없습니다. 수정 내용을 저장하거나 취소한 뒤 다시 시도하세요.');
    return;
  }
  if(!window.ExcelJS){window.alert('Excel 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 시도하세요.');return;}

  const generation=authGeneration,workbook=new window.ExcelJS.Workbook();
  let parsed;
  try{
    await workbook.xlsx.load(await file.arrayBuffer());
    parsed=window.parseProductImportWorkbook(workbook,assetClassifications,items,PRODUCT_UNITS);
  }catch(error){
    window.alert('Excel 파일을 읽지 못했습니다. .xlsx 파일인지 확인하세요. '+errorText(error));
    return;
  }
  if(generation!==authGeneration)return;
  if(parsed.errors.length){
    const shown=parsed.errors.slice(0,30);
    const more=parsed.errors.length-shown.length;
    window.alert('Excel 파일을 등록할 수 없습니다. 누락되거나 잘못된 열과 행을 수정하세요.\n\n'
      +shown.join('\n')+(more>0?`\n그 외 ${more}건의 오류가 더 있습니다.`:''));
    return;
  }
  const importedDrafts=parsed.rows.map(row=>{
    const classification=assetClassifications.find(entry=>entry.name===row.product_category);
    return {...row,classification_id:classification?.id||null,draftId:'product-info-draft-'+(++productInfoDraftSequence),checked:true};
  });
  const conflict=importedDrafts.map(draft=>duplicateProductInfoField(draft,'',productInfoDrafts)).find(Boolean);
  if(conflict){
    window.alert(`이미 임시 목록에 추가된 ${conflict}이(가) Excel 파일에 있습니다. 중복을 정리한 뒤 다시 업로드하세요.`);
    return;
  }
  productInfoDrafts.push(...importedDrafts);
  renderProductInfoItems();
  $('product-info-status').textContent=`Excel에서 품목정보 ${importedDrafts.length}건을 추가했습니다. 저장할 행을 체크한 뒤 일괄 저장하세요.`;
}function openProductInfoFilePicker(){
  if(!currentUser||busy)return;
  $('product-info-import-file').value='';
  $('product-info-import-file').click();
}
function showMissingReceiptProducts(missingProducts,errors){
  const body=$('receipt-import-missing-items');body.replaceChildren();
  missingProducts.forEach(item=>{
    const row=document.createElement('tr');
    [item.rowNumber,item.productCode,item.productName,item.productCategory]
      .forEach(value=>{const cell=document.createElement('td');cell.textContent=String(value||'');row.append(cell);});
    body.append(row);
  });
  $('receipt-import-missing-errors').textContent=errors.length
    ? '다른 행 오류:\n'+errors.slice(0,30).join('\n')+(errors.length>30?`\n그 외 ${errors.length-30}건의 오류가 더 있습니다.`:'')
    : '';
  $('receipt-import-missing-dialog').showModal();
}
async function importReceiptFile(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||!currentUser||busy||mode!=='receipt')return;
  if(editingMovementId){
    window.alert('입고 내역 수정 중에는 Excel 업로드를 시작할 수 없습니다. 수정 창을 닫은 뒤 다시 시도하세요.');
    return;
  }
  if(!window.ExcelJS){window.alert('Excel 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 시도하세요.');return;}

  const generation=authGeneration;
  let parsed;
  try{
    await loadStock();
    if(generation!==authGeneration)return;
    const workbook=new window.ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    parsed=window.parseReceiptImportWorkbook(workbook,items,todayDate());
  }catch(error){
    window.alert('Excel 파일을 읽거나 최신 품목정보를 확인하지 못했습니다. .xlsx 파일과 네트워크 연결을 확인하세요. '+errorText(error));
    return;
  }
  if(generation!==authGeneration)return;
  if(parsed.missingProducts.length){
    showMissingReceiptProducts(parsed.missingProducts,parsed.errors);
    return;
  }
  if(parsed.errors.length){
    const shown=parsed.errors.slice(0,30),more=parsed.errors.length-shown.length;
    window.alert('Excel 입고 내역을 등록할 수 없습니다. 필수 열과 오류 행을 수정하세요.\n\n'
      +shown.join('\n')+(more>0?`\n그 외 ${more}건의 오류가 더 있습니다.`:''));
    return;
  }
  if(!window.confirm(`${file.name}\n입고 내역 ${parsed.rows.length}건을 일괄 등록할까요?`))return;

  busy=true;$('movement-editor').disabled=true;$('import-receipt-button').disabled=true;$('close-dialog').disabled=true;
  $('form-message').textContent=`입고 내역을 등록하는 중입니다. 0/${parsed.rows.length}건`;
  let registered=0,failure=null;
  try{
    for(const row of parsed.rows){
      if(generation!==authGeneration)return;
      let error;
      try{
        ({error}=await client.rpc('post_stock_movement',{
          p_request_id:crypto.randomUUID(),p_kind:'receipt',p_date:row.date,p_details:row.details,
          p_quantity:row.quantity,p_unit_cost:row.unitCost
        }));
      }catch(requestError){error=requestError;}
      if(error){failure={rowNumber:row.rowNumber,error};break;}
      registered++;
      $('form-message').textContent=`입고 내역을 등록하는 중입니다. ${registered}/${parsed.rows.length}건`;
    }

    if(generation!==authGeneration)return;
    if(failure){
      let refreshMessage='';
      try{await loadStock();}
      catch(refreshError){refreshMessage=' 최신 재고 목록을 불러오지 못했습니다. '+errorText(refreshError);}
      const message=`Excel 입고 등록을 중단했습니다. ${registered}/${parsed.rows.length}건은 등록되었고, ${failure.rowNumber}행에서 오류가 발생했습니다. ${errorText(failure.error)}${refreshMessage}`;
      $('form-message').textContent=message;
      window.alert(message);
      return;
    }

    try{
      await loadStock();
      if(generation!==authGeneration)return;
      $('form-message').textContent=`Excel에서 입고 내역 ${registered}건을 등록했습니다.`;
      window.alert(`입고 내역 ${registered}건을 등록했습니다.`);
    }catch(error){
      const message=`입고 내역 ${registered}건은 등록했지만 최신 재고 목록 갱신에 실패했습니다. ${errorText(error)}`;
      $('form-message').textContent=message;
      window.alert(message);
    }
  }finally{
    busy=false;$('movement-editor').disabled=false;$('import-receipt-button').disabled=false;$('close-dialog').disabled=false;
  }
}
function readProductInfoForm(){
  const fields=['product_category','product_code','product_name','specification','material','color','unit','standard_stock_quantity'];
  const details=Object.fromEntries(fields.map(key=>[key,$('info_'+key).value.trim()]));
  const selectedClassification=assetClassifications.find(row=>row.id===$('info_product_category').value);
  details.classification_id=selectedClassification?.id||null;details.product_category=selectedClassification?.name||'';
  details.product_code=details.product_code.toUpperCase();
  details.standard_stock_quantity=details.standard_stock_quantity===''?null:Number(details.standard_stock_quantity);
  return details;
}
function productInfoDraftError(details){
  if(!details.classification_id)return '품목자산분류와 재고자산종류를 설정한 뒤 선택하세요.';
  const selectedClassification=assetClassifications.find(row=>row.id===details.classification_id);
  if(!selectedClassification?.inventory_asset_type)
    return '선택한 품목자산분류의 재고자산종류가 설정되지 않았습니다. 분류 설정에서 종류를 지정한 뒤 품목정보를 저장하세요.';
  if(!details.product_code||!details.product_name||!details.unit)return '품번·품명·단위를 입력하세요.';
  if(!Number.isSafeInteger(details.standard_stock_quantity)||details.standard_stock_quantity<1||details.standard_stock_quantity>1000000)
    return '적정재고 수량은 1~1,000,000 사이의 정수로 입력하세요.';
  return '';
}
function duplicateProductInfoMessage(field){
  return field==='품번'?'이미 등록된 품번입니다. 다른 품번을 입력하세요.':'이미 등록된 규격입니다. 다른 규격을 입력하세요.';
}
function startNewProductInfo(){
  if(busy)return;
  resetProductInfoForm();
  productInfoNewMode=true;
  $('product-info-status').textContent='신규로 입력한 뒤 품목정보 가등록을 누르세요. 품번·규격은 기존 등록 값과 중복될 수 없습니다.';
}
function warnDuplicateProductInfoInput(event){
  if(!productInfoNewMode)return;
  const field=event.target.id==='info_product_code'?'품번':'규격';
  const value=String(event.target.value||'').trim();
  if(!value)return;
  const details=field==='품번'?{product_code:value,specification:''}:{product_code:'',specification:value};
  if(duplicateProductInfoField(details,'',productInfoDrafts)===field)window.alert(duplicateProductInfoMessage(field));
}
function addProductInfoDraft(){
  if(!currentUser||busy)return;
  const details=readProductInfoForm();
  const duplicateField=duplicateProductInfoField(details,editingProductInfoId,productInfoDrafts);
  if(duplicateField){window.alert(duplicateProductInfoMessage(duplicateField));return;}
  const missing=productInfoDraftError(details);
  productInfoDrafts.push({...details,draftId:'product-info-draft-'+(++productInfoDraftSequence),checked:true,...(editingProductInfoId?{productId:editingProductInfoId}:{})});
  resetProductInfoForm();renderProductInfoItems();
  $('product-info-status').textContent=missing
    ?'가등록했습니다. 미입력 항목이 있으니 일괄 저장 전에 보완하세요. ('+missing+')'
    :'품목정보를 가등록했습니다. 저장할 행을 체크한 뒤 일괄 저장하세요.';
}
function deleteProductInfoDrafts(){
  if(busy)return;
  const selected=productInfoDrafts.filter(draft=>draft.checked!==false);
  if(!selected.length){$('product-info-status').textContent='삭제할 가등록 품목을 체크하세요.';return;}
  if(!window.confirm(`체크한 가등록 품목 ${selected.length}건을 삭제하시겠습니까?`))return;
  productInfoDrafts=productInfoDrafts.filter(draft=>draft.checked===false);
  renderProductInfoItems();$('product-info-status').textContent=`가등록 품목 ${selected.length}건을 삭제했습니다.`;
}
async function saveProductInfoDrafts(){
  const selected=productInfoDrafts.filter(draft=>draft.checked!==false);
  if(!selected.length){
    $('product-info-status').textContent='일괄 저장할 품목을 체크하세요. 품목정보를 입력해 가등록하거나 Excel로 업로드하세요.';
    return;
  }
  const incomplete=selected.map(draft=>[draft,productInfoDraftError(draft)]).find(([,message])=>message);
  if(incomplete){
    const message=`${incomplete[0].product_code||'품번 미입력'}: ${incomplete[1]}`;
    $('product-info-status').textContent=message;window.alert(message);
    return;
  }
  const conflict=selected.map(draft=>[draft,duplicateProductInfoField(draft,'',productInfoDrafts)]).find(([,field])=>field);
  if(conflict){window.alert(`${conflict[0].product_code}: ${duplicateProductInfoMessage(conflict[1])}`);return;}
  const generation=authGeneration;busy=true;$('product-info-editor').disabled=true;
  let saved=0,failure=null;
  try{
    for(const draft of selected){
      $('product-info-status').textContent=`품목정보를 일괄 저장하는 중입니다. ${saved}/${selected.length}건`;
      const {draftId,checked,productId,...details}=draft;
      let result;
      try{result=productId?await client.rpc('update_stock_product',{p_product_id:productId,p_details:details}):await client.rpc('register_stock_product',{p_details:details});}
      catch(requestError){result={error:requestError};}
      if(generation!==authGeneration)return;
      if(result.error){failure={draft,error:result.error};break;}
      if(productId)items=items.map(item=>item.id===result.data.id?{...item,...result.data}:item);else items.push(result.data);
      productInfoDrafts=productInfoDrafts.filter(entry=>entry!==draft);saved++;
    }
    let refreshMessage='';
    try{await loadStock();}
    catch(refreshError){refreshMessage=' 최신 목록을 불러오지 못했습니다. '+errorText(refreshError);}
    if(generation!==authGeneration)return;
    renderProductInfoItems();
    const message=failure
      ? `일괄 저장을 중단했습니다. ${saved}/${selected.length}건은 저장되었고, ${failure.draft.product_code}에서 오류가 발생했습니다. ${errorText(failure.error)}${refreshMessage}`
      : `품목정보 ${saved}건을 일괄 저장했습니다.${refreshMessage}`;
    $('product-info-status').textContent=message;
    if(failure)window.alert(message);
  }finally{
    busy=false;$('product-info-editor').disabled=false;
  }
}
async function saveProductInfo(event) {
  event.preventDefault();
  if(!currentUser||busy)return;
  return saveProductInfoDrafts();
}async function showCurrentStock() {
  if (!currentUser || busy) return;
  const generation=authGeneration;
  renderCurrentStock();$('current-stock-status').textContent='최신 재고를 불러오는 중…';$('current-stock-dialog').showModal();
  try {await loadStock();if(generation===authGeneration)$('current-stock-status').textContent='';}
  catch(error){if(generation===authGeneration)$('current-stock-status').textContent='최신 조회에 실패했습니다. 표시된 재고는 마지막 조회 결과입니다. '+errorText(error);}
}
function renderProductListHeaders() {
  const head=$('product-list-head');head.replaceChildren();
  const serial=document.createElement('th');serial.scope='col';serial.className='numeric';serial.textContent='일련번호';head.append(serial);
  productListFields().forEach(field=>{const header=document.createElement('th');header.scope='col';header.textContent=field.label;if(field.numeric)header.className='numeric';head.append(header);});
}
function productListFields() { return STOCK_DISPLAY_FIELDS.flatMap(field=>field.key==='material'?[field,{key:'color',label:'색상',numeric:false}]:[field]); }
function renderProductList() {
  const ledgerItems=items.filter(stockLedgerManaged);
  const shown=filterInventoryItems(ledgerItems,{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds});
  const fields=productListFields(),body=$('product-list-items');body.replaceChildren();
  if(!shown.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=fields.length+1;cell.className='empty';cell.textContent=ledgerItems.length?'검색 조건에 맞는 품목이 없습니다.':'재고관리를 하는 품목이 없습니다.';row.append(cell);body.append(row);return;}
  shown.forEach((item,index)=>{const row=document.createElement('tr'),serial=document.createElement('td');serial.className='numeric';serial.textContent=number(index+1);row.append(serial);fields.forEach(field=>{const cell=document.createElement('td');if(field.numeric)cell.className='numeric';cell.textContent=field.numeric?number(item[field.key]):item[field.key]||'';row.append(cell);});body.append(row);});
}
function updateProductListSuppliers() {
  const select=$('product-list-supplier'),selected=select.value;select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='전체 업체';select.append(all);
  [...new Set(items.filter(stockLedgerManaged).map(item=>String(item.supplier||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
async function showProductList() {
  if(!currentUser||busy)return;
  const generation=authGeneration;
  renderProductListHeaders();
  $('product-list-status').textContent='최신 품목 목록을 불러오는 중…';$('product-list-dialog').showModal();
  try {
    await loadStock();
    if(generation!==authGeneration||!$('product-list-dialog').open)return;
    updateProductListSuppliers();renderProductList();$('product-list-status').textContent='';
  } catch(error) {
    if(generation===authGeneration)$('product-list-status').textContent='최신 품목 목록을 불러오지 못했습니다. 표시된 목록은 마지막 조회 결과입니다. '+errorText(error);
  }
}
function updateMovementListSuppliers() {
  const select=$('movement-list-supplier'),selected=select.value;select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='전체 업체';select.append(all);
  [...new Set(items.filter(stockLedgerManaged).map(item=>String(item.supplier||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'))
    .forEach(supplier=>{const option=document.createElement('option');option.value=supplier;option.textContent=supplier;select.append(option);});
  select.value=[...select.options].some(option=>option.value===selected)?selected:'';
}
function filteredMovementListRows() {
  const startDate=$('movement-list-start-date').value,endDate=$('movement-list-end-date').value;
  const supplier=$('movement-list-supplier').value.trim().toLowerCase(),query=$('movement-list-query').value.trim().toLowerCase();
  const kind=movementListKind||$('movement-list-kind').value;
  const itemsById=new Map(items.map(item=>[item.id,item]));
  return movementListRows.filter(movement=>{
    const date=String(movement.movement_date||'').slice(0,10),item=itemsById.get(movement.product_id);
    if(startDate&&date<startDate||endDate&&date>endDate||kind&&movement.kind!==kind||item&&!stockLedgerManaged(item))return false;
    if(supplier&&supplier!==String(item?.supplier||'').trim().toLowerCase())return false;
    if(!query)return true;
    return [movement.sequence_id,date,MODE_LABELS[movement.kind]?.[1],item?.product_code,item?.product_name,item?.specification,item?.color,item?.storage_location,item?.supplier]
      .some(value=>String(value??'').toLowerCase().includes(query));
  });
}
function renderMovementList() {
  const shown=filteredMovementListRows(),itemsById=new Map(items.map(item=>[item.id,item]));
  const body=$('movement-list-items');body.replaceChildren();
  if(!shown.length){
    const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=14;cell.className='empty';
    cell.textContent=movementListRows.length?'검색 조건에 맞는 내역이 없습니다.':'기록된 '+movementListLabel()+'이 없습니다.';row.append(cell);body.append(row);return;
  }
  shown.forEach(movement=>{
    const item=itemsById.get(movement.product_id),row=document.createElement('tr');
    const kindCell=document.createElement('td'),badge=document.createElement('span');badge.className='badge '+movement.kind;badge.textContent=MODE_LABELS[movement.kind]?.[1]||movement.kind;kindCell.append(badge);
    row.append(
      makeCell(movement.sequence_id==null?'':number(movement.sequence_id),true),
      makeCell(String(movement.movement_date||'').slice(0,10)),
      kindCell,
      makeCell(item?.product_code||''),
      makeCell(item?.product_name||''),
      makeCell(item?.specification||''),
      makeCell(item?.color||''),
      makeCell(item?.storage_location||''),
      makeCell(item?.supplier||''),
      makeCell(item?.unit||'EA(개)'),
      makeCell(number(movement.quantity),true),
      makeCell(money(movement.unit_cost),true)
    );
    const amount=makeCell(money(movement.amount),true);
    if(movement.kind==='issue'){
      const button=document.createElement('button');button.className='code-button';button.textContent=money(movement.amount);
      button.setAttribute('aria-label',(item?.product_code||'')+' '+String(movement.movement_date||'').slice(0,10)+' 출고 차감 내역');
      button.addEventListener('click',()=>showAllocations(movement));amount.replaceChildren(button);
    }
    row.append(amount);
    const action=document.createElement('td'),edit=document.createElement('button');
    edit.type='button';edit.className='secondary';edit.textContent='수정';edit.dataset.movementId=movement.id;
    action.append(edit);
    if(movement.kind==='receipt'||movement.kind==='opening'){
      const remove=document.createElement('button');
      remove.type='button';remove.className='secondary';remove.textContent='삭제';remove.dataset.deleteReceiptId=movement.id;
      action.append(remove);
    }
    row.append(action);body.append(row);
  });
}
async function revertReceipt(id){
  const movement=movementListRows.find(row=>row.id===id);
  if(!movement||!['receipt','opening'].includes(movement.kind)||!currentUser||busy)return false;
  const item=items.find(row=>row.id===movement.product_id);
  const opening=movement.kind==='opening',label=opening?'기초재고':'입고';
  try{
    const reason=await movementUsedDownstream(movement);
    if(reason){alertBlocked(reason);return false;}
  }catch(error){window.alert('이후 단계 사용 여부를 확인하지 못했습니다. 삭제를 진행하지 않습니다. '+errorText(error));return false;}
  if(!window.confirm(`${label} '${item?.product_code||''} ${item?.product_name||''}' ${number(movement.quantity)}${item?.unit||''} 내역을 ${opening?'삭제하시겠습니까?':'삭제하고 미입고 상태로 되돌리시겠습니까?'}`))return false;
  const generation=authGeneration;busy=true;
  try{
    const {error}=await client.rpc('revert_stock_receipt',{p_movement_id:id});
    if(error)throw error;
    if(generation!==authGeneration)return true;
    movementListRows=(await readAll('stock_movements','sequence_id')).sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    renderMovementList();
    $('movement-list-status').textContent=opening?'기초재고 내역을 삭제했습니다.':'입고 내역을 삭제하고 미입고 상태로 되돌렸습니다.';
    try{await Promise.all([loadStock(),loadPurchaseOrders()]);}
    catch{$('movement-list-status').textContent+=' 목록 새로고침은 다시 시도해 주세요.';}
    return true;
  }catch(error){
    if(generation!==authGeneration)return false;
    const missing=/PGRST202|42883/.test(error?.code||'')||opening&&/NOT_A_RECEIPT/.test(error?.message||'');
    window.alert(/INSUFFICIENT_STOCK|OPENING_USED_DOWNSTREAM/.test(error?.message||'')?'처리할 수 없습니다.\n이 입고(기초) 수량이 이미 출고에 사용되었습니다.\n먼저 이후 프로세스의 data를 삭제한 뒤 다시 시도하세요.':missing?`${label} 삭제 기능이 DB에 적용되지 않았습니다. Supabase SQL Editor에서 최신 supabase/revert-stock-receipt.sql을 실행한 뒤 다시 시도하세요.`:`${label} 내역을 삭제하지 못했습니다. `+errorText(error));
  }finally{busy=false;}
}
async function showMovementList(kind='') {
  if(!currentUser||busy||movementListLoading)return;
  movementListKind=['opening','receipt','issue'].includes(kind)?kind:'';
  $('movement-list-kind').value=movementListKind;
  $('movement-list-kind').disabled=Boolean(movementListKind);
  $('movement-list-heading').textContent=movementListLabel();
  $('movement-list-table').setAttribute('aria-label',movementListLabel());
  $('close-movement-list').setAttribute('aria-label',movementListLabel()+' 창 닫기');
  movementListLoading=true;
  const generation=authGeneration;
  renderMovementList();
  $('movement-list-status').textContent=movementListLabel()+'을 불러오는 중…';$('movement-list-dialog').showModal();
  try {
    await loadStock();
    if(generation!==authGeneration||!$('movement-list-dialog').open)return;
    updateMovementListSuppliers();
    movementListRows=(await readAll('stock_movements','sequence_id')).sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
    if(generation!==authGeneration||!$('movement-list-dialog').open)return;
    renderMovementList();$('movement-list-status').textContent=filteredMovementListRows().length.toLocaleString('ko-KR')+'건의 '+movementListLabel()+'을 표시합니다.';
  } catch(error) {
    if(generation===authGeneration)$('movement-list-status').textContent='최신 '+movementListLabel()+'을 불러오지 못했습니다. '+errorText(error);
  } finally {movementListLoading=false;}
}
function searchMovementList() {
  if(!currentUser||movementListLoading)return;
  const startDate=$('movement-list-start-date').value,endDate=$('movement-list-end-date').value;
  if(startDate&&endDate&&startDate>endDate){$('movement-list-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  renderMovementList();$('movement-list-status').textContent='검색이 완료되었습니다.';
}
function clearMovementListSearch() {
  if(movementListLoading)return;
  ['movement-list-start-date','movement-list-end-date','movement-list-supplier','movement-list-query'].forEach(id=>$(id).value='');
  $('movement-list-kind').value=movementListKind;
  renderMovementList();$('movement-list-status').textContent='검색 조건을 초기화했습니다.';
}
function startColumnResizing(tableId,columnsId,storageKey,defaults) {
  const columnGroup=$(columnsId),table=$(tableId);
  if(!columnGroup?.children||!table)return;
  const columns=[...columnGroup.children];
  const minimum=52,maximum=600;
  let widths=[...defaults],drag=null;
  try {
    const saved=JSON.parse(window.localStorage.getItem(storageKey)||'null');
    if(Array.isArray(saved)&&saved.length===columns.length&&saved.every(width=>Number.isInteger(width)&&width>=minimum&&width<=maximum))widths=saved;
  } catch {}
  function applyWidth(index,width) {
    widths[index]=Math.max(minimum,Math.min(maximum,Math.round(width)));
    columns[index].style.width=widths[index]+'px';
    const handle=table.querySelector(`.column-resizer[data-column="${index}"]`);
    if(!handle)return;
    handle.setAttribute('aria-valuemin',String(minimum));handle.setAttribute('aria-valuemax',String(maximum));handle.setAttribute('aria-valuenow',String(widths[index]));
  }
  function saveWidths() {
    try {window.localStorage.setItem(storageKey,JSON.stringify(widths));} catch {}
  }
  columns.forEach((_,index)=>applyWidth(index,widths[index]));
  table.addEventListener('columnorderchange',event=>{
    const {from,to}=event.detail;
    if(from<0||to<0||from>=columns.length||to>=columns.length)return;
    columns.splice(to,0,columns.splice(from,1)[0]);
    widths.splice(to,0,widths.splice(from,1)[0]);
    widths.forEach((width,index)=>applyWidth(index,width));
    saveWidths();
  });
  table.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.column-resizer');
    if(!handle||!table.contains(handle))return;
    if(event.button!==0)return;
    const index=Number(handle.dataset.column);
    drag={pointerId:event.pointerId,index,startX:event.clientX,startWidth:widths[index]};
    handle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  table.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    applyWidth(drag.index,drag.startWidth+event.clientX-drag.startX);
  });
  function finish(event) {
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag=null;saveWidths();
  }
  table.addEventListener('pointerup',finish);
  table.addEventListener('pointercancel',finish);
  table.addEventListener('keydown',event=>{
    const handle=event.target.closest('.column-resizer');
    if(!handle||!table.contains(handle))return;
    const index=Number(handle.dataset.column);
    const delta=event.shiftKey?50:10;
    const next={ArrowLeft:widths[index]-delta,ArrowRight:widths[index]+delta,Home:minimum,End:maximum}[event.key];
    if(next===undefined)return;
    event.preventDefault();applyWidth(index,next);saveWidths();
  });
}
async function searchProductList() {
  if(!currentUser||productListSearching)return;
  const startDate=$('product-list-start-date').value,endDate=$('product-list-end-date').value;
  if(startDate&&endDate&&startDate>endDate){$('product-list-status').textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}
  const supplier=$('product-list-supplier').value.trim().toLowerCase(),query=$('product-list-query').value.trim();
  const generation=authGeneration;productListSearching=true;$('search-product-list').disabled=true;
  $('clear-product-list-search').disabled=true;$('product-list-start-date').disabled=true;$('product-list-end-date').disabled=true;
  $('product-list-supplier').disabled=true;$('product-list-query').disabled=true;
  try {
    productListDateIds=await findMovementProductIds(startDate,endDate,'');
    if(generation!==authGeneration)return;
    productListSupplier=supplier;productListQuery=query;
    renderProductList();$('product-list-status').textContent='검색이 완료되었습니다.';
  } catch(error) {
    if(generation===authGeneration)$('product-list-status').textContent=errorText(error);
  } finally {
    productListSearching=false;$('search-product-list').disabled=false;$('clear-product-list-search').disabled=false;
    $('product-list-start-date').disabled=false;$('product-list-end-date').disabled=false;$('product-list-supplier').disabled=false;$('product-list-query').disabled=false;
  }
}
function clearProductListSearch() {
  if(productListSearching)return;
  $('product-list-start-date').value='';$('product-list-end-date').value='';$('product-list-supplier').value='';$('product-list-query').value='';
  productListDateIds=null;productListSupplier='';productListQuery='';renderProductList();$('product-list-status').textContent='검색 조건을 초기화했습니다.';
}
function purchaseOrderPrintData(){
  const vendor=purchaseOrderVendors.find(row=>row.id===$('purchase-order-supplier').value),profile=vendor?.profile||{};
  const lines=purchaseDraftLines.map(line=>{
    const item=items.find(row=>row.id===line.product_id)||{};
    return {product_code:item.product_code,product_name:item.product_name,specification:item.specification,unit:item.unit,quantity:line.quantity,unit_cost:line.unit_cost,expected_date:line.expected_date};
  });
  return {orderNumber:$('purchase-order-number').value,orderDate:$('purchase-order-date').value,currency:'KRW',lines,
    supplier:{name:vendor?String(vendor.legal_name||vendor.vendor_name||''):'',representative:profile.representative,address:profile.business_address,business_number:profile.business_registration_number,
      phone:profile.phone,contact:profile.contact_person,contact_phone:profile.manager_phone,email:profile.email}};
}
function purchasePrintOrientation(){return document.querySelector('input[name="purchase-print-orientation"]:checked')?.value==='portrait'?'portrait':'landscape';}
function openPrintSettings(target) {
  activePrintTarget=target;
  $('purchase-print-orientation').hidden=target!=='purchase-order';
  $('print-settings-dialog').showModal();
}
function printInventoryList(target) {
  const targetDialogs={'product-list':'product-list-dialog','current-stock':'current-stock-dialog','stock-risk':'stock-risk-dialog','long-stock':'long-stock-dialog','movement-list':'movement-list-dialog','sales-status':'sales-status-dialog','sales-status-query':'sales-status-query-dialog','purchase-order':'purchase-order-dialog'};
  if(target in targetDialogs&&!$(targetDialogs[target]).open)return;
  activePrintTarget=target;
  if(target==='purchase-order')$('purchase-order-print').innerHTML=PurchaseOrderPrint.buildPurchaseOrderPrint({...purchaseOrderPrintData(),orientation:purchasePrintOrientation()});
  applyProductListPrintSettings();
  if($('print-settings-dialog').open)$('print-settings-dialog').close();
  document.body.dataset.printTarget=target;
  window.addEventListener('afterprint',()=>{delete document.body.dataset.printTarget;},{once:true});
  window.print();
}
function setProductListPrintMargin(side,value) {
  const margin=Number(value);
  if(!Number.isFinite(margin))return;
  printMargins[side]=Math.min(40,Math.max(2,Math.round(margin)));
  const input=$('print-margin-'+side),handle=document.querySelector(`.margin-handle[data-margin="${side}"]`);
  input.value=String(printMargins[side]);handle.setAttribute('aria-valuenow',String(printMargins[side]));
  $('printable-area').style.setProperty('--margin-'+side+'-offset',(printMargins[side]/(side==='top'||side==='bottom'?210:297)*100)+'%');
}
function applyProductListPrintSettings() {
  const scale=Number($('product-list-print-scale').value)/100;
  const tables={
    'product-list':'#product-list-dialog .product-list-table table',
    'current-stock':'#current-stock-dialog table',
    'stock-risk':'#stock-risk-dialog table',
    'long-stock':'#long-stock-dialog table',
    'sales-balance':'#sales-balance table',
    'sales-status':'#sales-status-dialog table',
    'sales-status-query':'#sales-status-query-dialog table',
    'movement-list':'#movement-list-dialog .product-list-table table',
    'purchase-order':'#purchase-order-print'
  };
  let style=document.getElementById('product-list-print-page-style');
  if(!style){style=document.createElement('style');style.id='product-list-print-page-style';document.head.append(style);}
  const purchaseOrderPage=activePrintTarget==='purchase-order';
  style.textContent=`@page{size:A4 landscape;margin:${printMargins.top}mm ${printMargins.right}mm ${printMargins.bottom}mm ${printMargins.left}mm}@media print{${tables[activePrintTarget]}{zoom:${scale};width:${100/scale}%}}`;
  // 여백을 0으로 두면 브라우저 머리글·바닥글이 표시되지 않으므로 여백은 발주서 안쪽에 적용합니다.
  if(purchaseOrderPage)style.textContent=`@page{size:A4 ${purchasePrintOrientation()};margin:0}@media print{#purchase-order-print{--po-top:${printMargins.top}mm;--po-right:${printMargins.right}mm;--po-bottom:${printMargins.bottom}mm;--po-left:${printMargins.left}mm}}`;
}
function startProductListPrintSettings() {
  const scale=$('product-list-print-scale');
  scale.addEventListener('input',()=>{$('product-list-print-scale-value').value=scale.value+'%';});
  document.querySelectorAll('.margin-handle').forEach(handle=>{
    handle.addEventListener('pointerdown',event=>{
      const side=handle.dataset.margin;
      printMarginDrag={side,x:event.clientX,y:event.clientY,value:printMargins[side]};
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
      setProductListPrintMargin(handle.dataset.margin,printMargins[handle.dataset.margin]+direction*(event.shiftKey?5:1));
    });
  });
  document.addEventListener('pointermove',event=>{
    if(!printMarginDrag)return;
    const paper=$('product-list-print-preview').getBoundingClientRect(),{side,x,y,value}=printMarginDrag;
    const vertical=side==='top'||side==='bottom';
    const delta=vertical?(event.clientY-y)*210/paper.height:(event.clientX-x)*297/paper.width;
    const direction=side==='bottom'||side==='right'?-1:1;
    setProductListPrintMargin(side,value+delta*direction);
  });
  document.addEventListener('pointerup',()=>{printMarginDrag=null;});
  document.addEventListener('pointercancel',()=>{printMarginDrag=null;});
  ['top','right','bottom','left'].forEach(side=>{
    const input=$('print-margin-'+side);
    input.addEventListener('input',()=>setProductListPrintMargin(side,input.value));
    input.addEventListener('change',()=>setProductListPrintMargin(side,input.value||10));
  });
  document.querySelectorAll('[data-print-settings]').forEach(button=>button.addEventListener('click',()=>openPrintSettings(button.dataset.printSettings)));
  $('product-list-print-scale').addEventListener('input',()=>applyProductListPrintSettings());
  document.querySelectorAll('input[name="purchase-print-orientation"]').forEach(radio=>radio.addEventListener('change',()=>applyProductListPrintSettings()));
}
function closeMovement() { if (!busy) {lotsGeneration++;editingMovementId='';$('save-movement').textContent='저장';$('movement-dialog').close();} }
function missingReceiptDetails(){
  return [['storage_location','저장위치'],['supplier','납품업체']]
    .filter(([id])=>!$(id).value.trim()).map(([id,label])=>({id,label}));
}
function focusMissingReceiptDetail(){
  $('receipt-details-dialog').close();
  const missing=missingReceiptDetails();
  $(missing[0]?.id||'storage_location').focus();
}
function ignoreReceiptDetailsAndSave(){
  ignoreMissingReceiptDetailsOnce=true;
  $('receipt-details-dialog').close();
  $('movement-form').requestSubmit();
}
async function editMovement(id){
  const movement=movementListRows.find(row=>row.id===id);if(!movement||!currentUser||busy)return;
  try{
    const reason=await movementUsedDownstream(movement);
    if(reason){alertBlocked(reason);return;}
  }catch(error){window.alert('이후 단계 사용 여부를 확인하지 못했습니다. 수정을 진행하지 않습니다. '+errorText(error));return;}
  openMovement(movement.kind);
  const item=items.find(row=>row.id===movement.product_id);if(!item)return;
  editingMovementId=movement.id;
  $('import-receipt-button').hidden=true;
  $('product_code').value=item.product_code;populateProduct('product_code');
  PRODUCT_FIELDS.forEach(key=>{
    $(key).readOnly=key!=='product_code';
    if(key!=='product_code')$(key).value=item[key]||'';
  });
  $('product_code').readOnly=true;$('unit').disabled=true;
  $('movement_date').value=String(movement.movement_date).slice(0,10);
  $('movement_quantity').value=String(movement.quantity);
  $('movement_cost').value=String(movement.unit_cost||0);
  $('movement_cost').readOnly=movement.kind==='issue';
  $('dialog-title').textContent=MODE_LABELS[movement.kind][0]+' 수정';
  $('dialog-description').textContent='수정 후 품목별 FIFO 원장을 다시 계산합니다. 재고 부족이 발생하면 변경되지 않습니다.';
  $('save-movement').textContent='변경 사항 저장';
  $('bulk-delete-movement').hidden=movement.kind!=='receipt';
  if(movement.kind==='issue'){
    const select=$('issue-sales-order');
    if(movement.sales_order_id&&!Array.from(select.options).some(option=>option.value===movement.sales_order_id)){
      const option=document.createElement('option');option.value=movement.sales_order_id;option.textContent='연결된 수주';select.append(option);
    }
    select.value=movement.sales_order_id||'';select.disabled=true;
    $('movement_cost').value=String(movement.unit_cost||0);
    try{
      await loadSelectedLots();
      if(!productLotsReady)return;
      const {data,error}=await client.from('stock_allocations').select('lot_id,quantity').eq('issue_id',movement.id);
      if(error)throw error;
      const lotsById=new Map(productLots.map(lot=>[String(lot.id),lot]));
      data.forEach(allocation=>{
        const lot=lotsById.get(String(allocation.lot_id));
        if(lot)lot.remaining_quantity=Number(lot.remaining_quantity)+Number(allocation.quantity);
      });
      updateAmounts();
    }catch(error){$('form-message').textContent=errorText(error);}
  }
  if(movement.kind!=='issue')updateAmounts();
}
async function saveMovement(event) {
  event.preventDefault(); if (busy || !currentUser) return;
  if(mode!=='issue'&&!activeProduct()){
    window.alert('품목정보를 입력해 주세요!');
    $('form-message').textContent='품목정보를 먼저 등록하고 해당 품번을 선택하세요.';
    return;
  }
  const quantity=Number($('movement_quantity').value), unitCost=mode==='issue' ? 0 : Number($('movement_cost').value), date=$('movement_date').value;
  if (!Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000 || !validDate(date) || !Number.isFinite(unitCost) || unitCost<0 || unitCost>1000000000 || Math.abs(unitCost*100-Math.round(unitCost*100))>0.0001) {
    $('form-message').textContent='날짜와 수량, 단가를 확인하세요. 수량은 양의 정수, 단가는 소수 둘째 자리까지 입력합니다.';return;
  }
  if (mode==='issue' && !activeProduct()) {$('form-message').textContent='출고할 기존 품번을 선택하세요.';return;}
  if (mode==='issue' && !editingMovementId && !validateIssueQuantity(true)) return;
  const skipReceiptDetailsPrompt=ignoreMissingReceiptDetailsOnce;
  ignoreMissingReceiptDetailsOnce=false;
  if(mode==='receipt'&&!editingMovementId&&!skipReceiptDetailsPrompt){
    const missing=missingReceiptDetails();
    if(missing.length){
      $('receipt-details-missing').textContent=missing.map(field=>field.label).join(', ');
      $('receipt-details-dialog').showModal();
      return;
    }
  }
  const details=Object.fromEntries(PRODUCT_FIELDS.map(key=>[key,$(key).value.trim()])); details.product_code=details.product_code.toUpperCase();
  const salesOrderId=mode==='issue'?$('issue-sales-order')?.value:'';
  if(salesOrderId&&!editingMovementId){
    const order=salesOrdersForIssue(activeProduct()).find(row=>row.id===salesOrderId);
    if(!order||quantity>Number(order.quantity)-Number(order.shipped_quantity||0)){
      $('form-message').textContent='선택한 수주의 잔여 수량과 출고수량을 확인하세요.';return;
    }
    details.sales_order_id=salesOrderId;
  }
  const generation=authGeneration; busy=true; $('movement-editor').disabled=true; $('close-dialog').disabled=true; $('form-message').textContent='저장 중…';
  try {
    const {data,error}=editingMovementId
      ? await client.rpc('edit_stock_movement',{
        p_movement_id:editingMovementId,p_date:date,p_quantity:quantity,p_unit_cost:unitCost,
        p_sales_order_id:mode==='issue'?$('issue-sales-order').value||null:null
      })
      : await client.rpc('post_stock_movement',{p_request_id:requestId,p_kind:mode,p_date:date,p_details:details,p_quantity:quantity,p_unit_cost:unitCost});
    if (error) throw error;
    if (generation!==authGeneration) return;
    const wasEditing=!!editingMovementId;
    $('movement-dialog').close(); requestId=null;editingMovementId='';$('save-movement').textContent='저장';
    const hasSerial=data?.sequence_id!=null;
    const text=MODE_LABELS[mode][0]+(wasEditing?' 수정 완료':' 저장 완료')+' · 일련번호 '+(hasSerial?number(data.sequence_id):'확인 필요')+' · '+number(data.quantity)+' '+details.unit+' / '+money(data.amount)+'원';
    try {
      await loadStock();
      if(salesOrderId||wasEditing)await loadSalesOrders();
      if(wasEditing&&$('movement-list-dialog').open){
        movementListRows=(await readAll('stock_movements','sequence_id')).sort((a,b)=>Number(b.sequence_id)-Number(a.sequence_id));
        renderMovementList();$('movement-list-status').textContent='거래 내용을 수정하고 FIFO 원장을 다시 계산했습니다.';
      }
      notify(text,!hasSerial);
    } catch {notify(text+' · 목록 새로고침은 다시 시도해 주세요.',true);}
  } catch (error) {if (generation===authGeneration) {if(error?.message?.includes('PRODUCT_INFO_REQUIRED'))window.alert('품목정보를 입력해 주세요!');if(error?.message?.includes('INSUFFICIENT_STOCK'))window.alert(errorText(error));$('form-message').textContent=errorText(error);}}
  finally {busy=false;$('movement-editor').disabled=false;$('close-dialog').disabled=false;}
}
async function showLots(item) {
  $('detail-title').textContent=item.product_code+' · 입고 건별 잔량'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const lots=await readAll('stock_lots','id',item.id);
    if (generation!==authGeneration || !$('detail-dialog').open) return;
    const unit=item.unit||'EA(개)';
    renderDetailTable(['기초·입고일자',`입고수량 (${unit})`,`잔량 (${unit})`,'단가','잔여금액'],lots.sort((a,b)=>a.received_date.localeCompare(b.received_date)||Number(a.id)-Number(b.id)).map(lot=>[lot.received_date,number(lot.quantity),number(lot.remaining_quantity),money(lot.unit_cost),money(lot.remaining_quantity*lot.unit_cost)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
}
async function showAllocations(movement) {
  $('detail-title').textContent='선입선출 차감 내역'; $('detail-content').textContent='불러오는 중…'; $('detail-dialog').showModal();
  const generation=authGeneration;
  try {
    const {data,error}=await client.from('stock_allocations').select('quantity,unit_cost,amount,stock_lots(received_date)').eq('issue_id',movement.id).order('id');
    if(error) throw error;
    if(generation!==authGeneration || !$('detail-dialog').open) return;
    const unit=items.find(item=>item.id===movement.product_id)?.unit||'EA(개)';
    renderDetailTable(['기초·입고일자',`차감수량 (${unit})`,'단가','금액'],data.map(row=>[row.stock_lots?.received_date || '',number(row.quantity),money(row.unit_cost),money(row.amount)]));
  } catch(error) {$('detail-content').textContent=errorText(error);}
}
async function downloadDataWorkbook(buttonId,sheetName,filePrefix,headers,rows,numericColumns,emptyMessage) {
  if(exporting||!currentUser)return;
  if(!rows.length){notify(emptyMessage);return;}
  if(!window.ExcelJS){notify('Excel 도구를 불러오지 못했습니다. 새로고침해 주세요.',true);return;}
  exporting=true;$(buttonId).disabled=true;const generation=authGeneration;
  try {
    const workbook=createDataWorkbook(window.ExcelJS,{sheetName,headers,rows,numericColumns});
    const buffer=await workbook.xlsx.writeBuffer();
    if(generation!==authGeneration)return;
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=filePrefix+'-'+todayDate()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify(sheetName+' '+rows.length.toLocaleString('ko-KR')+'건을 Excel로 내보냈습니다.');
  }catch(error){notify('Excel 파일을 만들지 못했습니다. '+errorText(error),true);}
  finally{exporting=false;$(buttonId).disabled=false;}
}
function exportCurrentStockExcel(){
  const fields=CURRENT_STOCK_FIELDS,rows=currentStockRows(items);
  return downloadDataWorkbook('export-current-stock','현재재고','현재재고',
    ['일련번호',...fields.map(field=>field.label)],
    rows.map((item,index)=>[index+1,...fields.map(field=>field.numeric?Number(item[field.key]||0):item[field.key]||'')]),
    [0,...fields.flatMap((field,index)=>field.numeric?[index+1]:[])],'내보낼 현재 재고가 없습니다.');
}
function exportProductListExcel(){
  const fields=productListFields(),rows=filterInventoryItems(items.filter(stockLedgerManaged),{query:productListQuery,supplier:productListSupplier,dateProductIds:productListDateIds});
  return downloadDataWorkbook('export-product-list','품목 목록','품목 목록',
    ['일련번호',...fields.map(field=>field.label)],
    rows.map((item,index)=>[index+1,...fields.map(field=>field.numeric?Number(item[field.key]||0):item[field.key]||'')]),
    [0,...fields.flatMap((field,index)=>field.numeric?[index+1]:[])],'내보낼 품목이 없습니다.');
}
function exportMovementListExcel(){
  const fields=[
    {key:'sequence_id',label:'일련번호',numeric:true},{key:'movement_date',label:'일자'},
    {key:'kind',label:'구분'},{key:'product_code',label:'품번'},{key:'product_name',label:'품명'},
    {key:'specification',label:'규격'},{key:'color',label:'색상'},{key:'storage_location',label:'저장위치'},
    {key:'supplier',label:'업체'},{key:'unit',label:'단위'},{key:'quantity',label:'수량',numeric:true},
    {key:'unit_cost',label:'단가',numeric:true},{key:'amount',label:'금액',numeric:true}
  ];
  const rows=filteredMovementListRows(),itemsById=new Map(items.map(item=>[item.id,item]));
  return downloadDataWorkbook('export-movement-list',movementListLabel(),movementListLabel(),
    fields.map(field=>field.label),rows.map(movement=>{
      const item=itemsById.get(movement.product_id);
      return [movement.sequence_id,String(movement.movement_date||'').slice(0,10),MODE_LABELS[movement.kind]?.[1]||movement.kind,
        item?.product_code||'',item?.product_name||'',item?.specification||'',item?.color||'',item?.storage_location||'',
        item?.supplier||'',item?.unit||'EA(개)',Number(movement.quantity||0),Number(movement.unit_cost||0),Number(movement.amount||0)];
    }),fields.flatMap((field,index)=>field.numeric?[index]:[]),'내보낼 입출고 내역이 없습니다.');
}
function exportSalesStatusExcel(view='status'){
  const filters=view==='query'?appliedSalesQueryFilters:appliedSalesStatusFilters;
  const sourceOrders=view==='query'?completedSalesOrders(salesOrders):salesOrders;
  const rows=filterSalesOrders(sourceOrders,{...filters,dateField:view==='query'?'shipped_date':'order_date'});
  const headers=['일련번호','수주일자','수주번호','수주형태','거래처','연락처','출고일자','매출 상태','품명','규격','단위','수량','단가','수주금액','납기일자','배송방법','주소','기타사항'];
  const button=view==='query'?'export-sales-query':'export-sales-status';
  return downloadDataWorkbook(button,'매출현황','매출현황',headers,rows.map(order=>[
    Number(order.sequence_id),String(order.order_date||'').slice(0,10),order.order_number,order.order_type,order.vendor_name||'',order.vendor_contact||'',String(order.shipped_date||'').slice(0,10),salesOrderStatus(order),
    order.product_name,order.specification,order.unit,Number(order.quantity||0),Number(order.unit_price||0),
    Number(order.amount||0),String(order.due_date||'').slice(0,10),order.delivery_method,order.address,order.notes
  ]),[0,11,12,13],'내보낼 수주 내역이 없습니다.');
}
async function exportExcel() {
  if(exporting || !currentUser) return;
  if(!items.length){notify('내보낼 품목이 없습니다.');return;}
  if(!window.ExcelJS){notify('Excel 도구를 불러오지 못했습니다. 새로고침해 주세요.',true);return;}
  exporting=true;$('export').disabled=true;const generation=authGeneration;
  try {
    const workbook=createInventoryWorkbook(window.ExcelJS,items.filter(stockLedgerManaged).map(item=>({...item})));
    const buffer=await workbook.xlsx.writeBuffer();
    if(generation!==authGeneration)return;
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download='재고현황-'+todayDate()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('19개 필드의 재고현황을 Excel로 내보냈습니다.');
  }catch{notify('Excel 파일을 만들지 못했습니다.',true);}finally{exporting=false;$('export').disabled=false;}
}
const popupMenuDraftRows=new Map();
function popupDraftConfig(bodyId){
  if(bodyId==='product-info-items')return{rows:()=>productInfoDrafts,set:rows=>{productInfoDrafts=rows;},add:addProductInfoDraft,render:renderProductInfoItems};
  if(bodyId==='sales-order-draft-items')return{rows:()=>salesDraftLines,set:rows=>{salesDraftLines=rows;},add:addSalesOrderLine,render:renderSalesDraftLines};
  if(bodyId==='purchase-draft-items')return{rows:()=>purchaseDraftLines,set:rows=>{purchaseDraftLines=rows;},add:addPurchaseDraftLine,render:renderPurchaseDraftLines};
  return null;
}
function addPopupTableDraftRow(bodyId){
  const config=popupDraftConfig(bodyId);
  if(!config)return false;
  const before=new Set(config.rows());
  config.add();
  const added=config.rows().filter(row=>!before.has(row));
  if(!added.length)return false;
  const tracked=popupMenuDraftRows.get(bodyId)||new Set();
  added.forEach(row=>tracked.add(row));
  popupMenuDraftRows.set(bodyId,tracked);
  return true;
}
function resetPopupTableDraftRows(bodyId){
  const config=popupDraftConfig(bodyId),tracked=popupMenuDraftRows.get(bodyId);
  if(!config||!tracked?.size||bodyId==='purchase-draft-items'&&purchaseOrderSaved)return false;
  const rows=config.rows(),remaining=rows.filter(row=>!tracked.has(row));
  if(remaining.length===rows.length)return false;
  config.set(remaining);tracked.clear();config.render();
  return true;
}
async function recordUserAuthActivity(eventType,session){
  const activeSession=session||(await client.auth.getSession()).data.session;
  if(!activeSession)throw new Error('로그인 세션을 확인할 수 없습니다.');
  const response=await fetch('/api/user-activity',{
    method:'POST',headers:{Authorization:'Bearer '+activeSession.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({event_type:eventType}),cache:'no-store'
  });
  let result;
  try{result=await response.json();}catch{throw new Error('로그인 이력 서버에 연결하지 못했습니다.');}
  if(!response.ok)throw new Error(result.error||'로그인 이력을 저장하지 못했습니다.');
}
async function startApp(){
  installDialogInteractions();
  installPopupTableTools();
  if(typeof startVendorManagement==='function')startVendorManagement();
  $('message').textContent='로그인 상태를 확인하고 있습니다…';
  $('today').textContent=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'});renderHeaders();render();
  if(!window.supabase){$('login-panel').hidden=false;notify('로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true);return;}
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:'inventory-note-stock-session',autoRefreshToken:true,detectSessionInUrl:false}});
  client.auth.onAuthStateChange((event,session)=>{if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))setTimeout(()=>updateSession(session),0);});
  $('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-button').disabled=true;try{const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)notify('아이디, 비밀번호와 계정 상태를 확인하세요.',true);else try{await recordUserAuthActivity('login',data.session);}catch(activityError){notify('로그인은 완료했지만 이력을 저장하지 못했습니다: '+activityError.message,true);}}catch{notify('로그인 서버에 연결하지 못했습니다.',true);}finally{$('password').value='';$('login-button').disabled=false;}});
  $('logout').addEventListener('click',async()=>{closeProfileMenu();if(busy)return;let activityError;try{await recordUserAuthActivity('logout');}catch(error){activityError=error;}const {error}=await client.auth.signOut({scope:'local'});if(error)notify('로그아웃에 실패했습니다.',true);else if(activityError)notify('로그아웃했지만 이력을 저장하지 못했습니다: '+activityError.message,true);});
  const profileButton=$('profile-menu-toggle'),profileMenu=$('profile-menu');
  const closeProfileMenu=()=>{profileMenu.hidden=true;profileButton.setAttribute('aria-expanded','false');};
  profileButton.addEventListener('click',()=>{
    const open=profileMenu.hidden;
    profileMenu.hidden=!open;profileButton.setAttribute('aria-expanded',String(open));
  });
  $('profile-info-menu').addEventListener('click',event=>{
    const details=$('profile-details'),expanded=details.hidden;
    details.hidden=!expanded;event.currentTarget.setAttribute('aria-expanded',String(expanded));
  });
  $('profile-password-menu').addEventListener('click',()=>{
    closeProfileMenu();$('password-form').reset();$('password-status').textContent='';$('password-dialog').showModal();
  });
  $('password-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const password=$('new-password').value,confirmation=$('confirm-password').value;
    if(password.length<12||password.length>128){$('password-status').textContent='비밀번호는 12~128자로 입력하세요.';return;}
    if(password!==confirmation){$('password-status').textContent='비밀번호가 일치하지 않습니다.';return;}
    if(!currentUser){$('password-status').textContent='로그인 상태를 확인해 주세요.';return;}
    $('password-update-button').disabled=true;
    try{
      const {error}=await client.auth.updateUser({password});
      if(error){$('password-status').textContent='비밀번호를 변경하지 못했습니다. 입력 내용을 확인해 주세요.';return;}
      $('password-dialog').close();notify('비밀번호를 변경했습니다.');
    }catch{
      $('password-status').textContent='비밀번호 변경 서비스에 연결하지 못했습니다.';
    }finally{$('password-update-button').disabled=false;}
  });
  $('close-password-dialog').addEventListener('click',()=>$('password-dialog').close());
  $('password-dialog').addEventListener('close',()=>$('password-form').reset());
  document.addEventListener('click',event=>{if(!event.target.closest('.account-menu-wrap'))closeProfileMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!profileMenu.hidden){closeProfileMenu();profileButton.focus();}});
  $('product-info-button').addEventListener('click',showProductInfo);
  $('product-info-status-button').addEventListener('click',showProductInfoStatus);
  $('asset-classification-button').addEventListener('click',showAssetClassifications);
  $('close-asset-classification').addEventListener('click',()=>$('asset-classification-dialog').close());
  $('asset-classification-form').addEventListener('submit',saveAssetClassification);
  $('cancel-asset-classification-edit').addEventListener('click',resetAssetClassificationForm);
  $('asset-classification-items').addEventListener('click',event=>{const button=event.target.closest('[data-classification-id]');if(button)editAssetClassification(button.dataset.classificationId);});
  $('sales-order-button').addEventListener('click',showSalesOrder);
  $('purchase-entry-button').addEventListener('click',()=>showPurchaseOrders('entry'));
  $('purchase-query-button').addEventListener('click',()=>showPurchaseOrders('query'));
  $('close-purchase-order').addEventListener('click',()=>$('purchase-order-dialog').close());
  $('purchase-order-form').addEventListener('submit',savePurchaseOrder);
  $('add-purchase-line').addEventListener('click',addPurchaseDraftLine);
  $('new-purchase-order').addEventListener('click',startNewPurchaseOrder);
  $('purchase-order-date').addEventListener('change',()=>{
    const today=todayDate();
    $('purchase-order-date').min=today;$('purchase-order-date').max=today;
    if($('purchase-order-date').value<today){
      $('purchase-order-date').value=today;
      $('purchase-order-status').textContent='발주일자는 오늘 날짜보다 이전으로 설정할 수 없습니다.';
    }else $('purchase-order-status').textContent='';
    updatePurchaseOrderNumber();
  });
  $('purchase-line-product').addEventListener('change',updatePurchaseProductDetails);
  $('purchase-draft-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-purchase-line]');
    if(!button)return;
    if(purchaseOrderSaved){$('purchase-order-status').textContent='이미 저장된 발주 품목은 삭제할 수 없습니다.';return;}
    purchaseDraftLines.splice(Number(button.dataset.removePurchaseLine),1);renderPurchaseDraftLines();
  });
  $('purchase-order-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-receive-purchase-line]');
    if(button)openPurchaseReceipt(button.dataset.receivePurchaseLine);
  });
  $('purchase-order-dialog').addEventListener('cancel',event=>{if(purchaseSaving)event.preventDefault();});
  $('close-purchase-receive').addEventListener('click',()=>$('purchase-receive-dialog').close());
  $('purchase-receive-form').addEventListener('submit',savePurchaseReceipt);
  $('purchase-receive-form').addEventListener('input',()=>{receivingPurchaseRequestId=crypto.randomUUID();});
  $('purchase-receive-dialog').addEventListener('cancel',event=>{if(purchaseSaving)event.preventDefault();});
  $('sales-status-button').addEventListener('click',()=>showSalesStatus('status'));
  $('sales-register-button').addEventListener('click',showSalesRegister);
  $('sales-status-query-button').addEventListener('click',()=>showSalesStatus('query'));
  $('close-sales-order').addEventListener('click',()=>$('sales-order-dialog').close());
  $('cancel-sales-order').addEventListener('click',cancelSalesOrder);
  $('sales-order-form').addEventListener('submit',saveSalesOrder);
  $('import-sales-order-button').addEventListener('click',openSalesOrderFilePicker);
  $('sales-order-import-file').addEventListener('change',importSalesOrderFile);
  $('save-sales-order-draft').addEventListener('click',addSalesOrderLine);
  $('add-sales-line-footer').addEventListener('click',startNewSalesOrder);
  $('sales-order-draft-items').addEventListener('change',changeSalesDraftSelection);
  $('sales-order-draft-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-register-sales-line]');
    if(!button)return;
    registerSalesOrderLine(button.dataset.registerSalesLine);
  });
  $('sales-order-items').addEventListener('click',event=>{const button=event.target.closest('[data-sales-order-id]');if(button)editSalesOrder(button.dataset.salesOrderId);});
  $('close-sales-status').addEventListener('click',()=>$('sales-status-dialog').close());
  $('close-sales-query').addEventListener('click',()=>$('sales-status-query-dialog').close());
  $('close-sales-register').addEventListener('click',()=>$('sales-register-dialog').close());
  $('search-sales-register').addEventListener('click',applySalesRegisterSearch);
  $('add-sales-register').addEventListener('click',resetSalesRegisterSearch);
  $('bulk-sales-register').addEventListener('click',openBulkSalesRegisterConfirmation);
  $('sales-register-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applySalesRegisterSearch();}});
  $('sales-register-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-sales-register-order-id]');
    if(button)openSalesRegisterConfirmation(button.dataset.salesRegisterOrderId);
  });
  $('close-sales-register-confirm').addEventListener('click',cancelSalesRegisterConfirmation);
  $('cancel-sales-register-confirm').addEventListener('click',cancelSalesRegisterConfirmation);
  $('sales-register-confirm-dialog').addEventListener('cancel',event=>{
    if(salesStatusUpdating)event.preventDefault();else salesRegisterTargetOrderIds=[];
  });
  $('complete-sales-register-confirm').addEventListener('click',completeSalesRegistration);
  $('apply-sales-status-search').addEventListener('click',()=>applySalesStatusSearch());
  $('search-sales-status-orders').addEventListener('click',()=>applySalesStatusSearch());
  $('clear-sales-status-search').addEventListener('click',()=>applySalesStatusSearch(true));
  $('apply-sales-query-search').addEventListener('click',()=>applySalesStatusSearch(false,'query'));
  $('clear-sales-query-search').addEventListener('click',()=>applySalesStatusSearch(true,'query'));
  $('sales-status-items').addEventListener('change',changeSalesOrderStatus);
  $('sales-status-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-sales-order-id]');
    if(button)editSalesOrderFromStatus(button.dataset.salesOrderId);
  });
  $('sales-query-items').addEventListener('change',changeSalesOrderStatus);
  $('sales-query-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-sales-order-id]');
    if(button)editSalesOrderFromStatus(button.dataset.salesOrderId);
  });
  $('sales-balance-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-sales-order-id]');
    if(button)editSalesOrderFromStatus(button.dataset.salesOrderId);
  });
  $('export-sales-status').addEventListener('click',exportSalesStatusExcel);
  $('export-sales-query').addEventListener('click',()=>exportSalesStatusExcel('query'));
  $('apply-sales-balance-search').addEventListener('click',()=>applySalesBalanceSearch());
  $('clear-sales-balance-search').addEventListener('click',()=>applySalesBalanceSearch(true));
  ['sales_quantity','sales_unit_price'].forEach(id=>$(id).addEventListener('input',updateSalesAmount));
  const closeProductInfo=()=>{productInfoDrafts=[];resetProductInfoForm();renderProductInfoItems();$('product-info-dialog').close();};
  $('close-product-info').addEventListener('click',closeProductInfo);
  $('delete-product-info-drafts').addEventListener('click',deleteProductInfoDrafts);
  $('import-product-info-button').addEventListener('click',openProductInfoFilePicker);
  $('add-product-info-draft').addEventListener('click',addProductInfoDraft);
  $('new-product-info').addEventListener('click',startNewProductInfo);
  $('product-info-import-file').addEventListener('change',importProductInfoFile);
  $('close-product-info-status').addEventListener('click',()=>$('product-info-status-dialog').close());
  $('export-product-info-status').addEventListener('click',exportProductInfoStatusExcel);
  ['product-info-status-code-query','product-info-status-name-query','product-info-status-specification-query'].forEach(id=>$(id).addEventListener('input',renderProductInfoStatus));
  $('clear-product-info-status-search').addEventListener('click',()=>{
    ['product-info-status-code-query','product-info-status-name-query','product-info-status-specification-query'].forEach(id=>$(id).value='');
    renderProductInfoStatus();$('product-info-status-code-query').focus();
  });
  $('product-info-form').addEventListener('submit',saveProductInfo);
  $('cancel-product-info-edit').addEventListener('click',resetProductInfoForm);
  $('product-info-status-items').addEventListener('click',event=>{
    const remove=event.target.closest('[data-product-info-delete-id]');
    if(remove){deleteProductInfo(remove.dataset.productInfoDeleteId);return;}
    const button=event.target.closest('[data-product-info-id]');if(!button)return;
    editProductInfo(button.dataset.productInfoId);
  });
  $('info_product_code').addEventListener('input',()=>populateProductInfo('info_product_code'));
  $('info_product_code').addEventListener('input',warnDuplicateProductInfoInput);
  $('info_specification').addEventListener('input',()=>populateProductInfo('info_specification'));
  $('info_specification').addEventListener('input',warnDuplicateProductInfoInput);
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>openMovement(button.dataset.mode)));
  installMovementHistoryButton();
  $('close-dialog').addEventListener('click',closeMovement);$('movement-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('movement-form').addEventListener('submit',saveMovement);
  $('import-receipt-button').addEventListener('click',()=>{$('receipt-import-file').click();});
  $('receipt-import-file').addEventListener('change',importReceiptFile);
  $('close-receipt-import-missing').addEventListener('click',()=>$('receipt-import-missing-dialog').close());
  $('receipt-details-fill').addEventListener('click',focusMissingReceiptDetail);
  $('receipt-details-ignore').addEventListener('click',ignoreReceiptDetailsAndSave);
  $('close-receipt-details').addEventListener('click',()=>$('receipt-details-dialog').close());
  $('movement-list-items').addEventListener('click',event=>{const button=event.target.closest('[data-movement-id]');if(button)editMovement(button.dataset.movementId);const remove=event.target.closest('[data-delete-receipt-id]');if(remove)revertReceipt(remove.dataset.deleteReceiptId);});
  $('movement-form').addEventListener('input',()=>{requestId=crypto.randomUUID();if(mode!=='issue')$('form-message').textContent='';});
  $('product_code').addEventListener('input',()=>populateProduct('product_code'));
  $('specification').addEventListener('input',()=>populateProduct('specification'));
  ['movement_quantity','movement_cost','movement_date'].forEach(id=>$(id).addEventListener('input',updateAmounts));
  $('issue-sales-order').addEventListener('change',()=>{
    selectIssueSalesOrder();updateAmounts();validateIssueQuantity(true);
  });
  ['movement_quantity','movement_date'].forEach(id=>$(id).addEventListener('change',()=>validateIssueQuantity(true)));
  $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('current-stock-button').addEventListener('click',showCurrentStock);
  $('export-current-stock').addEventListener('click',exportCurrentStockExcel);
  $('close-current-stock').addEventListener('click',()=>$('current-stock-dialog').close());
  $('stock-risk-button').addEventListener('click',showStockRisk);
  $('close-stock-risk').addEventListener('click',()=>$('stock-risk-dialog').close());
  $('long-stock-button').addEventListener('click',showLongStock);
  $('close-long-stock').addEventListener('click',()=>$('long-stock-dialog').close());
  $('product-list-button').addEventListener('click',showProductList);
  $('export-product-list').addEventListener('click',exportProductListExcel);
  $('close-product-list').addEventListener('click',()=>$('product-list-dialog').close());
  $('search-product-list').addEventListener('click',searchProductList);
  $('search-purchase-orders').addEventListener('click',searchPurchaseOrders);
  $('clear-purchase-order-search').addEventListener('click',clearPurchaseOrderSearch);
  $('purchase-search-status').addEventListener('change',searchPurchaseOrders);
  PURCHASE_SEARCH_IDS.slice(2,7).forEach(id=>$(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchPurchaseOrders();}}));
  $('clear-product-list-search').addEventListener('click',clearProductListSearch);
  $('receipt-list-button').addEventListener('click',()=>showMovementList('receipt'));
  $('opening-status-summary').addEventListener('click',event=>{event.preventDefault();showMovementList('opening');});
  $('issue-list-button').addEventListener('click',()=>showMovementList('issue'));
  $('export-movement-list').addEventListener('click',exportMovementListExcel);
  $('close-movement-list').addEventListener('click',()=>$('movement-list-dialog').close());
  $('search-movement-list').addEventListener('click',searchMovementList);
  $('clear-movement-list-search').addEventListener('click',clearMovementListSearch);
  ensureMovementEditColumn();
  startColumnResizing('current-stock-table','current-stock-columns','inventory-current-stock-column-widths',columnWidthDefaults['current-stock']);
  startColumnResizing('movement-list-table','movement-list-columns','inventory-movement-list-column-widths',columnWidthDefaults['movement-list']);
  document.querySelectorAll('[data-print]').forEach(button=>button.addEventListener('click',()=>printInventoryList(button.dataset.print)));
  $('close-print-settings').addEventListener('click',()=>$('print-settings-dialog').close());
  startProductListPrintSettings();
  $('search').addEventListener('input',render);$('filter').addEventListener('change',render);$('export').addEventListener('click',exportExcel);
  $('movement-kind-filter').addEventListener('change',()=>{$('supplier-filter-wrap').hidden=$('movement-kind-filter').value!=='supplier';});
  $('apply-search').addEventListener('click',applyInventorySearch);$('clear-search').addEventListener('click',clearInventorySearch);
  const timer=setInterval(scheduleSync,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync();});window.addEventListener('online',scheduleSync);
  window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(timer);clearTimeout(syncTimer);clearTimeout(salesSyncTimer);clearTimeout(purchaseSyncTimer);client.removeAllChannels();}});
}
