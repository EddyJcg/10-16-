'use strict';
(function(){
  if(typeof document==='undefined')return;

  const VISIBILITY_PREFIX='popup-table-hidden-columns:';
  const FILTERED_CLASS='popup-table-menu-filtered';
  const ADDABLE_BODIES=new Set(['product-info-items','sales-order-draft-items','purchase-draft-items']);
  const MENU_ICON_SHAPES={
    add:[['path',{d:'M3 3.5h10v10H3z'}],['path',{d:'M3 7h10M6.5 3.5v10'}],['path',{d:'M16.5 12.5v6M13.5 15.5h6'}]],
    reset:[['path',{d:'M3.5 8a7 7 0 1 1 .8 6.5'}],['path',{d:'M3 3.5V8h4.5'}]],
    columns:[['path',{d:'M1.5 10s3.1-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3.1 5.5-8.5 5.5-8.5-5.5-8.5-5.5Z'}],['circle',{cx:'10',cy:'10',r:'2.5'}]],
    filter:[['path',{d:'M2.5 3h15l-5.8 6.5v6l-3.4 1.8v-7.8L2.5 3Z'}]]
  };
  const visibilityStates=new WeakMap();
  const filterStates=new WeakMap();
  const initializedTables=new WeakSet();
  const tableObservers=new WeakMap();
  let activeTable=null,menu=null,columnPanel=null,filterPanel=null,exportPanel=null,menuPoint={x:12,y:12},exporting=false;

  function report(message,error=false){
    if(typeof window.notify==='function')window.notify(message,error);
  }
  function rowsOf(table){
    return [...table.tBodies].flatMap(body=>[...body.rows])
      .filter(row=>!row.hasAttribute('data-grid-blank')&&!(row.cells.length===1&&row.cells[0].colSpan>1));
  }
  function cellText(cell){
    if(!cell)return'';
    const select=cell.querySelector('select');
    if(select)return select.selectedOptions?.[0]?.textContent.trim()||select.value||'';
    const input=cell.querySelector('input');
    if(input)return input.type==='checkbox'?(input.checked?'선택':'미선택'):input.value;
    const textarea=cell.querySelector('textarea');
    if(textarea)return textarea.value;
    const clone=cell.cloneNode(true);
    clone.querySelectorAll('button,.grid-col-handle,.popup-table-filter-button,img[data-popup-serial-icon],input,select,textarea')
      .forEach(element=>element.remove());
    return clone.textContent.trim().replace(/\s+/g,' ');
  }
  function columnLabel(header,index){
    return header.getAttribute('aria-label')||cellText(header)||`열 ${index+1}`;
  }
  function columnKeys(table){
    const counts=new Map();
    return [...table.tHead.rows[0].cells].map((header,index)=>{
      if(header.dataset.popupColumnKey)return header.dataset.popupColumnKey;
      const base=cellText(header).replace(/\s+/g,' ').toLocaleLowerCase('ko-KR');
      const occurrence=counts.get(base)||0;
      counts.set(base,occurrence+1);
      return `${base||`column-${index}`}#${occurrence}`;
    });
  }
  function tableIdentity(table){
    const dialog=table.closest('dialog');
    const index=[...dialog.querySelectorAll('table')].indexOf(table);
    return `${dialog.id||'dialog'}|${table.id||index}`;
  }
  function visibilityKey(table){return VISIBILITY_PREFIX+tableIdentity(table);}
  function readHiddenColumns(table){
    try{
      const saved=JSON.parse(window.localStorage.getItem(visibilityKey(table))||'[]');
      return Array.isArray(saved)?new Set(saved.filter(key=>typeof key==='string')):new Set();
    }catch(error){
      report('컬럼 보기 설정을 불러오지 못했습니다. '+String(error.message||error),true);
      return new Set();
    }
  }
  function applyVisibility(table,hidden){
    if(!table.tHead?.rows[0])return;
    const keys=columnKeys(table),headers=[...table.tHead.rows[0].cells];
    headers.forEach((header,index)=>{
      const isHidden=hidden.has(keys[index]);
      header.style.display=isHidden?'none':'';
      [...table.tBodies].forEach(body=>[...body.rows].forEach(row=>{
        if(row.cells.length===1&&row.cells[0].colSpan>1)return;
        if(row.cells[index])row.cells[index].style.display=isHidden?'none':'';
      }));
      const column=table.querySelectorAll('colgroup > col')[index];
      if(column)column.style.display=isHidden?'none':'';
    });
  }
  function filterMap(table){
    let state=filterStates.get(table);
    if(!state){state=new Map();filterStates.set(table,state);}
    return state;
  }
  function applyFilters(table){
    if(!table.tHead?.rows[0])return;
    const keys=columnKeys(table),filters=filterStates.get(table)||new Map();
    rowsOf(table).forEach(row=>{
      if(row.hasAttribute('data-grid-blank')||(row.cells.length===1&&row.cells[0].colSpan>1))return;
      const matches=[...filters].every(([key,allowed])=>{
        const index=keys.indexOf(key);
        return index<0||allowed.has(cellText(row.cells[index]));
      });
      row.classList.toggle(FILTERED_CLASS,!matches);
    });
    table.querySelectorAll('.popup-table-filter-button').forEach(button=>{
      button.classList.toggle('is-filtered',filters.has(button.dataset.popupColumnKey));
    });
  }
  function initializeTable(table){
    if(initializedTables.has(table)||!table.tHead?.rows[0]?.cells.length)return;
    initializedTables.add(table);
    const hidden=readHiddenColumns(table);
    visibilityStates.set(table,hidden);
    applyVisibility(table,hidden);
    const observer=new MutationObserver(()=>{
      applyVisibility(table,visibilityStates.get(table)||new Set());
      applyFilters(table);
    });
    observer.observe(table,{childList:true,subtree:true});
    tableObservers.set(table,observer);
  }
  function initializeTables(){document.querySelectorAll('dialog table').forEach(initializeTable);}
  function removePanel(name){
    if(name==='menu'&&menu){menu.remove();menu=null;}
    if(name==='columns'&&columnPanel){columnPanel.remove();columnPanel=null;}
    if(name==='filter'&&filterPanel){filterPanel.remove();filterPanel=null;}
    if(name==='export'&&exportPanel){exportPanel.remove();exportPanel=null;}
  }
  function closePanels(){
    removePanel('menu');removePanel('columns');removePanel('filter');removePanel('export');activeTable=null;
  }
  function positionPanel(panel,x,y){
    panel.style.left='0px';panel.style.top='0px';
    const rect=panel.getBoundingClientRect();
    panel.style.left=Math.max(6,Math.min(x,window.innerWidth-rect.width-6))+'px';
    panel.style.top=Math.max(6,Math.min(y,window.innerHeight-rect.height-6))+'px';
  }
  function menuButton(label,action,iconName='',disabled=false,title=''){
    const button=document.createElement('button');
    button.type='button';button.className='popup-table-menu-item';
    button.dataset.popupMenuAction=action;button.setAttribute('role','menuitem');button.disabled=disabled;
    const icon=document.createElement('span');icon.className='popup-table-menu-icon';icon.setAttribute('aria-hidden','true');
    if(iconName){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('focusable','false');
      MENU_ICON_SHAPES[iconName].forEach(([tag,attributes])=>{
        const shape=document.createElementNS('http://www.w3.org/2000/svg',tag);
        Object.entries(attributes).forEach(([name,value])=>shape.setAttribute(name,value));
        svg.append(shape);
      });
      icon.append(svg);
    }
    button.append(icon,document.createTextNode(label));
    if(title)button.title=title;
    return button;
  }
  function openMenu(table,x,y){
    closePanels();activeTable=table;menuPoint={x,y};
    initializeTable(table);
    const dialog=table.closest('dialog');
    menu=document.createElement('div');menu.className='popup-table-context-menu';menu.setAttribute('role','menu');
    menu.append(menuButton('Excel로 내보내기','export'));
    menu.append(menuButton('행 추가','add-row','add',!ADDABLE_BODIES.has(table.tBodies[0]?.id),
      '기존 등록 흐름이 있는 작성 표에서만 행을 추가할 수 있습니다.'));
    const divider=document.createElement('div');divider.className='popup-table-menu-divider';divider.setAttribute('role','separator');menu.append(divider);
    menu.append(menuButton('시트 초기화','reset','reset'));
    menu.append(menuButton('컬럼보기 설정','columns','columns'));
    menu.append(menuButton('필터','filters','filter'));
    dialog.append(menu);positionPanel(menu,x,y);
  }
  function openExportPanel(table){
    removePanel('menu');removePanel('columns');removePanel('filter');
    exportPanel=document.createElement('section');exportPanel.className='popup-table-export-panel';
    exportPanel.setAttribute('role','dialog');exportPanel.setAttribute('aria-label','Excel 내보내기');
    const title=document.createElement('strong');title.textContent='Excel 내보내기';exportPanel.append(title);
    const actions=document.createElement('div');actions.className='popup-table-panel-actions popup-table-export-actions';
    const open=document.createElement('button');open.type='button';open.className='primary';open.textContent='Excel에서 열기';
    open.addEventListener('click',()=>{closePanels();exportTable(table,'open');});
    const save=document.createElement('button');save.type='button';save.className='secondary popup-table-save-button';save.textContent='다른 이름으로 저장';
    save.addEventListener('click',()=>{closePanels();exportTable(table,'save');});
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='취소';
    cancel.addEventListener('click',closePanels);
    actions.append(open,save,cancel);exportPanel.append(actions);
    table.closest('dialog').append(exportPanel);positionPanel(exportPanel,menuPoint.x,menuPoint.y);
    open.focus();
  }
  function enableFilters(table){
    initializeTable(table);
    [...table.tHead.rows[0].cells].forEach((header,index)=>{
      if(header.querySelector('.popup-table-filter-button'))return;
      const button=document.createElement('button');
      button.type='button';button.className='popup-table-filter-button';button.textContent='▼';
      button.dataset.popupColumnKey=columnKeys(table)[index];
      button.setAttribute('aria-label',columnLabel(header,index)+' 필터');
      button.title=columnLabel(header,index)+' 필터';
      header.append(button);
    });
    applyFilters(table);
  }
  function openColumnPanel(table){
    removePanel('menu');removePanel('filter');
    const dialog=table.closest('dialog'),headers=[...table.tHead.rows[0].cells],keys=columnKeys(table);
    const selected=new Set(visibilityStates.get(table)||readHiddenColumns(table));
    columnPanel=document.createElement('section');columnPanel.className='popup-table-column-panel';
    columnPanel.setAttribute('role','dialog');columnPanel.setAttribute('aria-label','컬럼 보기 설정');
    const title=document.createElement('strong');title.textContent='컬럼 보기 설정';columnPanel.append(title);
    const description=document.createElement('p');description.textContent='선택된 열은 음영 처리되며 저장 후 표에서 숨겨집니다.';columnPanel.append(description);
    const list=document.createElement('div');list.className='popup-table-column-list';columnPanel.append(list);
    const options=[];
    headers.forEach((header,index)=>{
      const option=document.createElement('label');option.className='popup-table-column-option';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(keys[index]);
      const text=document.createElement('span');text.textContent=columnLabel(header,index);
      option.classList.toggle('is-selected',checkbox.checked);
      checkbox.addEventListener('change',()=>option.classList.toggle('is-selected',checkbox.checked));
      option.append(checkbox,text);list.append(option);options.push({checkbox,key:keys[index]});
    });
    const actions=document.createElement('div');actions.className='popup-table-panel-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='취소';
    cancel.addEventListener('click',()=>removePanel('columns'));
    const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='저장';
    save.addEventListener('click',()=>{
      const hidden=new Set(options.filter(option=>option.checkbox.checked).map(option=>option.key));
      if(hidden.size===headers.length){report('표에 표시할 열을 한 개 이상 남겨 주세요.',true);return;}
      try{window.localStorage.setItem(visibilityKey(table),JSON.stringify([...hidden]));}
      catch(error){report('컬럼 보기 설정을 저장하지 못했습니다. '+String(error.message||error),true);return;}
      visibilityStates.set(table,hidden);applyVisibility(table,hidden);removePanel('columns');
      report('컬럼 보기 설정을 저장했습니다.');
    });
    actions.append(cancel,save);columnPanel.append(actions);
    dialog.append(columnPanel);positionPanel(columnPanel,menuPoint.x,menuPoint.y);
    options[0]?.checkbox.focus();
  }
  function openFilterPanel(table,button){
    removePanel('menu');removePanel('columns');initializeTable(table);
    const header=button.closest('th'),index=[...table.tHead.rows[0].cells].indexOf(header),key=button.dataset.popupColumnKey;
    const values=[...new Set(rowsOf(table).map(row=>cellText(row.cells[index])))];
    const filters=filterMap(table),selected=filters.get(key);
    filterPanel=document.createElement('section');filterPanel.className='popup-table-filter-panel';
    filterPanel.setAttribute('role','dialog');filterPanel.setAttribute('aria-label',columnLabel(header,index)+' 필터');
    const title=document.createElement('strong');title.textContent=columnLabel(header,index)+' 필터';filterPanel.append(title);
    const search=document.createElement('input');search.type='search';search.placeholder='값 검색';search.setAttribute('aria-label','필터 값 검색');filterPanel.append(search);
    const list=document.createElement('div');list.className='popup-table-filter-list';filterPanel.append(list);
    const options=values.map(value=>{
      const option=document.createElement('label');option.className='popup-table-filter-option';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!selected||selected.has(value);
      const label=document.createElement('span');label.textContent=value||'(빈 값)';
      option.append(checkbox,label);list.append(option);
      return{value,checkbox,option};
    });
    search.addEventListener('input',()=>{
      const query=search.value.trim().toLocaleLowerCase('ko-KR');
      options.forEach(option=>{option.option.hidden=!option.value.toLocaleLowerCase('ko-KR').includes(query);});
    });
    const actions=document.createElement('div');actions.className='popup-table-panel-actions popup-table-filter-actions';
    const all=document.createElement('button');all.type='button';all.className='secondary';all.textContent='전체 선택';
    all.addEventListener('click',()=>options.forEach(option=>{option.checkbox.checked=true;}));
    const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='필터 해제';
    clear.addEventListener('click',()=>{filters.delete(key);applyFilters(table);removePanel('filter');});
    const apply=document.createElement('button');apply.type='button';apply.className='primary';apply.textContent='적용';
    apply.addEventListener('click',()=>{
      const chosen=new Set(options.filter(option=>option.checkbox.checked).map(option=>option.value));
      if(chosen.size===values.length)filters.delete(key);else filters.set(key,chosen);
      applyFilters(table);removePanel('filter');
    });
    actions.append(all,clear,apply);filterPanel.append(actions);
    table.closest('dialog').append(filterPanel);
    const rect=button.getBoundingClientRect();positionPanel(filterPanel,rect.left,rect.bottom+4);
    search.focus();
  }
  function resetTable(table){
    const state=filterStates.get(table);
    if(state)state.clear();
    filterStates.delete(table);
    table.querySelectorAll('.popup-table-filter-button').forEach(button=>button.remove());
    rowsOf(table).forEach(row=>row.classList.remove(FILTERED_CLASS));
    const hidden=new Set();visibilityStates.set(table,hidden);
    applyVisibility(table,hidden);
    let storageError='';
    try{window.localStorage.removeItem(visibilityKey(table));}
    catch(error){storageError=' 컬럼 보기 설정을 초기화하지 못했습니다. '+String(error.message||error);}
    const bodyId=table.tBodies[0]?.id;
    const removed=typeof window.resetPopupTableDraftRows==='function'&&window.resetPopupTableDraftRows(bodyId);
    removePanel('menu');removePanel('columns');removePanel('filter');
    report(`현재 표 설정을 초기화했습니다.${removed?' 임시로 추가한 행도 되돌렸습니다.':''} 저장된 업무 데이터는 삭제하지 않았습니다.${storageError}`,Boolean(storageError));
  }
  function safeText(value){return String(value??'').trim();}
  function exportTable(table,mode){
    if(exporting)return;
    const header=[...table.tHead.rows[0].cells],visibleIndexes=header.map((cell,index)=>({cell,index}))
      .filter(({cell})=>cell.style.display!=='none'&&!cell.hidden);
    const rows=rowsOf(table).filter(row=>!row.hidden&&!row.classList.contains(FILTERED_CLASS));
    if(!window.ExcelJS||typeof window.createDataWorkbook!=='function'){
      report('Excel 도구를 불러오지 못했습니다. 새로고침해 주세요.',true);return;
    }
    if(!visibleIndexes.length){report('Excel로 내보낼 표시 열이 없습니다.',true);return;}
    const headers=visibleIndexes.map(({cell,index})=>columnLabel(cell,index));
    const values=rows.map(row=>visibleIndexes.map(({index})=>safeText(cellText(row.cells[index]))));
    const numericColumns=[];
    visibleIndexes.forEach(({cell},column)=>{
      if(cell.classList.contains('numeric')&&values.every(row=>!row[column]||/^-?[\d,]+(?:\.\d+)?$/.test(row[column]))){
        numericColumns.push(column);
        values.forEach(row=>{if(row[column])row[column]=Number(row[column].replace(/,/g,''));});
      }
    });
    const dialogTitle=table.getAttribute('aria-label')||table.closest('dialog').getAttribute('aria-label')||'팝업 표';
    const sheetName=dialogTitle.replace(/[\\/?*:[\]]/g,' ').slice(0,31)||'팝업 표';
    const fileName=dialogTitle.replace(/[<>:"/\\|?*]/g,'-').trim()||'팝업 표';
    const date=typeof window.todayDate==='function'?window.todayDate():new Date().toISOString().slice(0,10);
    const downloadName=fileName+'-'+date+'.xlsx';
    let savePickerRequest=null;
    if(mode==='save'&&typeof window.showSaveFilePicker==='function'){
      try{
        savePickerRequest=window.showSaveFilePicker({
          suggestedName:downloadName,
          types:[{description:'Excel 통합 문서',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]
        }).then(handle=>({handle}),error=>({error}));
      }catch(error){
        if(error.name==='AbortError'){report('Excel 저장을 취소했습니다.');return;}
        report('저장 위치 선택 창을 열지 못했습니다. '+String(error.message||error),true);return;
      }
    }
    exporting=true;
    (async()=>{
      try{
        const workbook=window.createDataWorkbook(window.ExcelJS,{sheetName,headers,rows:values,numericColumns});
        const buffer=await workbook.xlsx.writeBuffer();
        const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        if(savePickerRequest){
          const result=await savePickerRequest;
          if(result.error)throw result.error;
          const writable=await result.handle.createWritable();
          await writable.write(blob);await writable.close();
          report(`${downloadName} 파일을 저장했습니다.`);
          return;
        }
        if(mode==='open'&&typeof navigator.msSaveOrOpenBlob==='function'){
          navigator.msSaveOrOpenBlob(blob,downloadName);
          report('Excel 파일의 열기 또는 저장을 선택했습니다.');
          return;
        }
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=url;link.download=downloadName;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        if(mode==='open')report(rows.length?'파일을 다운로드했습니다. 브라우저 다운로드 목록에서 Excel 파일을 열어주세요.':'내보낼 데이터가 없어 제목 열만 있는 Excel 파일을 다운로드했습니다.');
        else if(mode==='save')report('이 브라우저는 저장 위치 선택을 지원하지 않아 기본 다운로드 폴더에 저장했습니다.');
        else report(`${dialogTitle} 표 ${rows.length.toLocaleString('ko-KR')}건을 Excel로 내보냈습니다.`);
      }catch(error){
        if(error.name==='AbortError')report('Excel 저장을 취소했습니다.');
        else report('Excel 파일을 만들거나 저장하지 못했습니다. '+String(error.message||error),true);
      }
      finally{exporting=false;}
    })();
  }
  document.addEventListener('contextmenu',event=>{
    const header=event.target.closest?.('dialog table thead th');
    if(!header)return;
    const table=header.closest('table'),serial=table.tHead?.rows[0]?.cells[0];
    const onIcon=Boolean(event.target.closest('img[data-popup-serial-icon]'));
    if(!onIcon&&!(serial?.style.display==='none'))return;
    event.preventDefault();openMenu(table,event.clientX,event.clientY);
  });
  document.addEventListener('click',event=>{
    const filterButton=event.target.closest?.('.popup-table-filter-button');
    if(filterButton){event.preventDefault();event.stopPropagation();openFilterPanel(filterButton.closest('table'),filterButton);return;}
    const action=event.target.closest?.('[data-popup-menu-action]');
    if(!action||!activeTable)return;
    event.preventDefault();
    const table=activeTable,name=action.dataset.popupMenuAction;
    if(name==='export')openExportPanel(table);
    else if(name==='add-row'){
      removePanel('menu');
      const added=typeof window.addPopupTableDraftRow==='function'&&window.addPopupTableDraftRow(table.tBodies[0]?.id);
      if(added)report('작성 표에 임시 행을 추가했습니다. 기존 저장 버튼을 눌러 확정하세요.');
      else report('필수 입력값을 확인하세요. 읽기 전용 표에는 행을 추가할 수 없습니다.',true);
    }else if(name==='reset')resetTable(table);
    else if(name==='columns')openColumnPanel(table);
    else if(name==='filters'){removePanel('menu');enableFilters(table);report('각 열 제목의 ▼ 버튼에서 고유값 필터를 설정할 수 있습니다.');}
  });
  document.addEventListener('pointerdown',event=>{
    if(menu?.contains(event.target)||columnPanel?.contains(event.target)||filterPanel?.contains(event.target)||exportPanel?.contains(event.target))return;
    closePanels();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();});
  document.addEventListener('close',event=>{
    if(activeTable?.closest('dialog')===event.target)closePanels();
  },true);
  initializeTables();
  if(typeof MutationObserver!=='undefined'&&document.body){
    const observer=new MutationObserver(initializeTables);
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
