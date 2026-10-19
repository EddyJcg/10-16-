'use strict';
function parseSearchCalendarDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(0);date.setHours(12,0,0,0);date.setFullYear(year,month-1,day);
  return year>=1&&date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}
function searchCalendarDateString(date){
  return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function searchCalendarDays(year,month){
  const first=new Date(0);first.setHours(12,0,0,0);first.setFullYear(year,month,1);
  const last=new Date(first);last.setMonth(month+1,0);
  return Array.from({length:42},(_,index)=>{
    const day=index-first.getDay()+1;
    if(day<1||day>last.getDate())return null;
    const date=new Date(first);date.setDate(day);return searchCalendarDateString(date);
  });
}
function searchCalendarDateAllowed(value,min='',max=''){
  return Boolean(parseSearchCalendarDate(value))&&(!min||value>=min)&&(!max||value<=max);
}
function startSearchDatePickers(){
  const inputs=[...document.querySelectorAll('.search-conditions input[type="date"], .product-list-search input[type="date"], .sales-status-filters input[type="date"]')];
  if(!inputs.length||document.getElementById('search-calendar'))return;
  const calendar=document.createElement('dialog');calendar.id='search-calendar';calendar.className='search-calendar';
  calendar.setAttribute('aria-labelledby','search-calendar-title');
  calendar.innerHTML=`<div class="calendar-title"><strong id="search-calendar-title">날짜 선택</strong><button type="button" data-calendar-close aria-label="달력 닫기">×</button></div>
    <div class="calendar-month"><button type="button" data-calendar-prev aria-label="이전 달">‹</button><input type="number" min="1" max="9999" aria-label="연도"><select aria-label="월"></select><button type="button" data-calendar-next aria-label="다음 달">›</button></div>
    <p class="calendar-announcement" aria-live="polite"></p><div class="calendar-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
    <div class="calendar-days"></div><div class="calendar-footer"><button type="button" data-calendar-clear>지우기</button><button type="button" data-calendar-today>오늘</button></div>`;
  document.body.append(calendar);
  const yearInput=calendar.querySelector('input'),monthSelect=calendar.querySelector('select'),days=calendar.querySelector('.calendar-days');
  for(let month=1;month<=12;month++){
    const option=document.createElement('option');option.value=String(month-1);option.textContent=month+'월';monthSelect.append(option);
  }
  let activeInput=null,year,month;
  function render(focusDate=''){
    yearInput.value=String(year);monthSelect.value=String(month);
    calendar.querySelector('.calendar-announcement').textContent=year+'년 '+(month+1)+'월';
    calendar.querySelector('[data-calendar-prev]').disabled=year===1&&month===0;
    calendar.querySelector('[data-calendar-next]').disabled=year===9999&&month===11;
    calendar.querySelector('[data-calendar-today]').disabled=!searchCalendarDateAllowed(searchCalendarDateString(new Date()),activeInput.min,activeInput.max);
    days.replaceChildren();
    for(const value of searchCalendarDays(year,month)){
      if(!value){days.append(document.createElement('span'));continue;}
      const button=document.createElement('button');button.type='button';button.dataset.date=value;
      button.textContent=String(Number(value.slice(-2)));button.setAttribute('aria-label',value.replace(/-/g,'.'));
      button.disabled=!searchCalendarDateAllowed(value,activeInput.min,activeInput.max);
      if(value===activeInput.value){button.classList.add('calendar-selected');button.setAttribute('aria-pressed','true');}
      if(value===searchCalendarDateString(new Date()))button.setAttribute('aria-current','date');
      days.append(button);
    }
    if(focusDate)days.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }
  function choose(value){
    if(value&&!searchCalendarDateAllowed(value,activeInput.min,activeInput.max))return;
    const input=activeInput;input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    calendar.close();input.focus();
  }
  function moveMonth(delta){
    const next=new Date(0);next.setFullYear(year,month+delta,1);
    if(next.getFullYear()<1||next.getFullYear()>9999)return;
    year=next.getFullYear();month=next.getMonth();render();
  }
  function position(){
    if(!activeInput||!calendar.open)return;
    const rect=activeInput.getBoundingClientRect(),gap=8,padding=12;
    const left=Math.max(padding,Math.min(rect.left,window.innerWidth-calendar.offsetWidth-padding));
    const below=rect.bottom+gap,above=rect.top-calendar.offsetHeight-gap;
    calendar.style.left=left+'px';
    calendar.style.top=Math.max(padding,Math.min(below+calendar.offsetHeight<=window.innerHeight-padding?below:above,window.innerHeight-calendar.offsetHeight-padding))+'px';
  }
  function open(input){
    if(input.disabled||input.readOnly)return;
    activeInput=input;
    const selected=parseSearchCalendarDate(input.value)||new Date();year=selected.getFullYear();month=selected.getMonth();
    calendar.querySelector('#search-calendar-title').textContent=input.getAttribute('aria-label')||'날짜 선택';
    render();calendar.showModal();position();
    const value=searchCalendarDateString(selected);
    (days.querySelector(`[data-date="${value}"]:not(:disabled)`)||days.querySelector('button:not(:disabled)')||yearInput).focus();
  }
  calendar.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.dataset.date)choose(button.dataset.date);
    else if(button?.hasAttribute('data-calendar-close'))calendar.close();
    else if(button?.hasAttribute('data-calendar-prev'))moveMonth(-1);
    else if(button?.hasAttribute('data-calendar-next'))moveMonth(1);
    else if(button?.hasAttribute('data-calendar-clear'))choose('');
    else if(button?.hasAttribute('data-calendar-today'))choose(searchCalendarDateString(new Date()));
    else if(event.target===calendar){
      const rect=calendar.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)calendar.close();
    }
  });
  yearInput.addEventListener('change',()=>{
    const value=Number(yearInput.value);if(Number.isInteger(value)&&value>=1&&value<=9999)year=value;render();
  });
  monthSelect.addEventListener('change',()=>{month=Number(monthSelect.value);render();});
  days.addEventListener('keydown',event=>{
    const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(offset===undefined||!event.target.dataset.date)return;
    event.preventDefault();const date=parseSearchCalendarDate(event.target.dataset.date);date.setDate(date.getDate()+offset);
    const value=searchCalendarDateString(date);
    if(!searchCalendarDateAllowed(value,activeInput.min,activeInput.max))return;
    year=date.getFullYear();month=date.getMonth();render(value);
  });
  calendar.addEventListener('close',()=>activeInput?.focus());
  for(const input of inputs){
    input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls',calendar.id);
    input.addEventListener('click',event=>{event.preventDefault();if(!calendar.open)open(input);});
    input.addEventListener('keydown',event=>{
      if(event.key==='F4'||event.key==='ArrowDown'&&event.altKey){event.preventDefault();if(!calendar.open)open(input);}
    });
  }
  window.addEventListener('resize',position);
}
if(typeof module!=='undefined')module.exports={searchCalendarDays,parseSearchCalendarDate,searchCalendarDateAllowed};
