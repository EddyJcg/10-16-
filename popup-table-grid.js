'use strict';
(function(){
  if(typeof document==='undefined'||typeof MutationObserver==='undefined')return;
  const MIN_ROWS=5;
  const SKIPPED_TABLES=new Set(['fifo-preview']);
  const SERIAL_LABEL='일련번호';
  const SERIAL_KEY='일련번호#0';

  const headerRow=table=>table.tHead&&table.tHead.rows[0];
  const startsWithSerial=row=>{
    const first=row.cells[0];
    return Boolean(first)&&first.textContent.trim()===SERIAL_LABEL;
  };
  const isSerialHeader=cell=>Boolean(cell)&&(cell.hasAttribute('data-grid-serial')||cell.textContent.trim()===SERIAL_LABEL);
  const isEmptyNotice=row=>row.cells.length===1&&row.cells[0].colSpan>1;

  function makeCell(tag,text,serial){
    const cell=document.createElement(tag);
    if(serial){cell.dataset.gridSerial='1';cell.dataset.popupColumnKey=SERIAL_KEY;}
    cell.textContent=text;
    return cell;
  }

  function syncHeader(table,head){
    let th=head.cells[0];
    if(!isSerialHeader(th)){
      th=makeCell('th','',true);
      th.scope='col';
      head.insertBefore(th,head.firstChild);
      const colgroup=table.querySelector('colgroup');
      if(colgroup){
        const col=document.createElement('col');
        col.dataset.gridSerial='1';col.dataset.popupColumnKey=SERIAL_KEY;
        colgroup.insertBefore(col,colgroup.firstChild);
      }
    }else if(startsWithSerial(head)){
      th.dataset.gridOwnSerial='1';
      th.dataset.gridSerial='1';
      th.dataset.popupColumnKey=SERIAL_KEY;
    }
    th.setAttribute('aria-label',SERIAL_LABEL);
    if(!th.querySelector('img[data-popup-serial-icon]')){
      const icon=document.createElement('img');
      icon.src='/popup-serial-icon.png';
      icon.alt=SERIAL_LABEL;
      icon.dataset.popupSerialIcon='1';
      th.replaceChildren(icon);
    }
  }

  const MIN_WIDTH=30;
  const NEW_COLUMN_WIDTH=80;
  const STORAGE_KEY='popup-table-column-widths';
  const savedWidths=new Map();
  try{Object.entries(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')).forEach(([k,v])=>{if(v>0)savedWidths.set(k,v);});}catch(e){}
  function persistWidths(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(Object.fromEntries(savedWidths)));}catch(e){}}
  const labelOf=th=>(th.hasAttribute('data-grid-serial')?SERIAL_LABEL:th.textContent.trim()).toLowerCase();
  function widthKey(table,th){
    const dialog=table.closest('dialog');
    const index=dialog?[...dialog.querySelectorAll('table')].indexOf(table):0;
    return (dialog&&dialog.id)+'|'+index+'|'+labelOf(th);
  }
  function setColumnWidth(table,index,width){
    const head=headerRow(table);
    const th=head.cells[index];
    if(!th)return;
    const value=Math.max(MIN_WIDTH,Math.round(width))+'px';
    th.style.width=value;th.style.minWidth=value;th.style.maxWidth=value;
    const col=table.querySelectorAll('colgroup > col')[index];
    if(col){col.style.width=value;col.style.minWidth=value;}
  }
  function fitTableWidth(table){
    const total=[...headerRow(table).cells].reduce((sum,th)=>sum+(parseFloat(th.style.width)||th.getBoundingClientRect().width),0);
    table.style.width=Math.round(total)+'px';
    table.style.maxWidth='none';
  }
  function freezeTable(table){
    const head=headerRow(table);
    const widths=[...head.cells].map(th=>th.getBoundingClientRect().width);
    table.classList.add('grid-resized');
    widths.forEach((width,index)=>{if(!head.cells[index].style.width)setColumnWidth(table,index,width);});
    table.style.tableLayout='fixed';
    fitTableWidth(table);
  }
  function restoreWidths(table){
    const head=headerRow(table);
    let restored=false;
    [...head.cells].forEach((th,index)=>{
      const width=savedWidths.get(widthKey(table,th));
      if(width&&!th.style.width){setColumnWidth(table,index,width);restored=true;}
    });
    if(restored){
      [...head.cells].forEach((th,index)=>{
        if(!th.style.width)setColumnWidth(table,index,th.getBoundingClientRect().width||NEW_COLUMN_WIDTH);
      });
      table.classList.add('grid-resized');table.style.tableLayout='fixed';fitTableWidth(table);
    }
  }
  function syncHandles(table,head){
    if(table.querySelector('.column-resizer')){
      table.querySelectorAll('.grid-col-handle').forEach(handle=>handle.remove());
      return;
    }
    [...head.cells].forEach(th=>{
      if(th.colSpan>1||th.querySelector('.grid-col-handle'))return;
      if(typeof getComputedStyle==='function'&&getComputedStyle(th).position==='static')th.style.position='relative';
      const handle=document.createElement('span');
      handle.className='grid-col-handle';
      handle.setAttribute('aria-hidden','true');
      th.append(handle);
    });
    restoreWidths(table);
  }

  function syncTable(table){
    if(SKIPPED_TABLES.has(table.id))return;
    const head=headerRow(table);
    const body=table.tBodies[0];
    if(!head||!head.cells.length||!body)return;
    syncHeader(table,head);
    syncHandles(table,head);
    const ownSerial=head.cells[0].dataset.gridOwnSerial==='1';
    const columns=head.cells.length;
    const rows=[...body.rows];
    const dataRows=[];
    rows.forEach(row=>{
      if(row.hasAttribute('data-grid-blank'))return;
      if(isEmptyNotice(row)){row.classList.add('grid-empty-hidden');return;}
      row.classList.remove('grid-empty-hidden');
      dataRows.push(row);
    });
    dataRows.forEach((row,index)=>{
      if(ownSerial)return;
      let cell=row.cells[0];
      if(!cell||!cell.hasAttribute('data-grid-serial')){
        cell=makeCell('td','',true);
        row.insertBefore(cell,row.firstChild);
      }
      const label=String(index+1);
      if(cell.textContent!==label)cell.textContent=label;
    });

    const need=Math.max(0,MIN_ROWS-dataRows.length);
    const blanks=rows.filter(row=>row.hasAttribute('data-grid-blank'));
    const lastData=dataRows.length?rows.indexOf(dataRows[dataRows.length-1]):-1;
    const firstBlank=blanks.length?rows.indexOf(blanks[0]):Infinity;
    const stable=blanks.length===need&&firstBlank>lastData&&blanks.every(row=>row.cells.length===columns);
    if(!stable){
      blanks.forEach(row=>row.remove());
      for(let index=0;index<need;index+=1){
        const row=document.createElement('tr');
        row.setAttribute('data-grid-blank','');
        row.setAttribute('aria-hidden','true');
        for(let column=0;column<columns;column+=1){
          const cell=makeCell('td',column===0?String(dataRows.length+index+1):'',false);
          if(column===0)cell.className='grid-blank-serial';
          row.append(cell);
        }
        body.append(row);
      }
    }
  }

  function syncAll(){
    document.querySelectorAll('dialog table').forEach(syncTable);
  }

  const observer=new MutationObserver(()=>{
    observer.disconnect();
    try{syncAll();}finally{observe();}
  });
  function observe(){
    document.querySelectorAll('dialog').forEach(dialog=>observer.observe(dialog,{childList:true,subtree:true}));
  }
  // 열 경계 핸들 드래그: popup-floating의 창 이동보다 먼저 처리하도록 window 캡처 단계에서 받습니다.
  let resizing=null;
  const onHandle=event=>event.target.closest&&event.target.closest('.grid-col-handle');
  window.addEventListener('pointerdown',event=>{
    const handle=onHandle(event);
    if(!handle||event.button>0)return;
    const th=handle.parentElement,table=th.closest('table');
    event.preventDefault();event.stopPropagation();
    freezeTable(table);
    const index=[...headerRow(table).cells].indexOf(th);
    resizing={table,index,pointerId:event.pointerId,startX:event.clientX,startWidth:th.getBoundingClientRect().width,handle};
    handle.classList.add('is-active');
    try{handle.setPointerCapture(event.pointerId);}catch(error){}
  },true);
  window.addEventListener('pointermove',event=>{
    if(!resizing||event.pointerId!==resizing.pointerId)return;
    setColumnWidth(resizing.table,resizing.index,resizing.startWidth+event.clientX-resizing.startX);
    fitTableWidth(resizing.table);
  },true);
  const finishResize=event=>{
    if(!resizing||event.pointerId!==resizing.pointerId)return;
    const {table,handle}=resizing;
    handle.classList.remove('is-active');
    [...headerRow(table).cells].forEach(th=>{const w=parseFloat(th.style.width);if(w)savedWidths.set(widthKey(table,th),w);});
    persistWidths();
    resizing=null;
  };
  window.addEventListener('pointerup',finishResize,true);
  window.addEventListener('pointercancel',finishResize,true);
  ['mousedown','click','dblclick','dragstart'].forEach(type=>window.addEventListener(type,event=>{
    if(!onHandle(event))return;
    event.stopPropagation();
    if(type!=='click')event.preventDefault();
  },true));

  syncAll();
  observe();
  if(typeof window!=='undefined')window.syncPopupTableGrids=syncAll;
})();
