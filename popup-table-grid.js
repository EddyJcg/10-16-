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
    return Boolean(first)&&!first.hasAttribute('data-grid-serial')&&first.textContent.trim()===SERIAL_LABEL;
  };
  const isEmptyNotice=row=>row.cells.length===1&&row.cells[0].colSpan>1;

  function makeCell(tag,text,serial){
    const cell=document.createElement(tag);
    if(serial){cell.dataset.gridSerial='1';cell.dataset.popupColumnKey=SERIAL_KEY;}
    cell.textContent=text;
    return cell;
  }

  function syncHeader(table,head){
    if(startsWithSerial(head)||head.querySelector('[data-grid-serial]'))return;
    const th=makeCell('th',SERIAL_LABEL,true);
    th.scope='col';
    head.insertBefore(th,head.firstChild);
    const colgroup=table.querySelector('colgroup');
    if(colgroup){
      const col=document.createElement('col');
      col.dataset.gridSerial='1';col.dataset.popupColumnKey=SERIAL_KEY;
      colgroup.insertBefore(col,colgroup.firstChild);
    }
  }

  function syncTable(table){
    if(SKIPPED_TABLES.has(table.id))return;
    const head=headerRow(table);
    const body=table.tBodies[0];
    if(!head||!head.cells.length||!body)return;
    syncHeader(table,head);
    const ownSerial=startsWithSerial(head);
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
  syncAll();
  observe();
  if(typeof window!=='undefined')window.syncPopupTableGrids=syncAll;
})();
