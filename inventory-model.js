'use strict';
const STOCK_FIELDS = [
  ['product_category','품목분류'],['product_code','품번'],['product_name','품명'],['specification','규격'],['material','재질'],
  ['opening_quantity','기초수량'],['opening_unit_cost','기초단가'],['opening_amount','기초금액'],
  ['receipt_quantity','입고수량'],['receipt_unit_cost','입고단가'],['receipt_amount','입고금액'],
  ['issue_quantity','출고수량'],['issue_unit_cost','출고단가'],['issue_amount','출고금액'],
  ['stock_quantity','재고수량'],['stock_unit_cost','재고단가'],['stock_amount','재고금액'],
  ['storage_location','저장위치'],['supplier','납품업체']
].map(([key,label]) => ({key,label,numeric:/_(quantity|unit_cost|amount)$/.test(key)}));
const STOCK_DISPLAY_FIELDS = STOCK_FIELDS.flatMap(field=>field.key==='opening_quantity'?[{key:'unit',label:'단위',numeric:false},field]:[field]);
const PRODUCT_UNITS = ['EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식'];
const PRODUCT_FIELDS = ['product_category','product_code','product_name','specification','material','color','unit','storage_location','supplier'];
const CURRENT_STOCK_FIELDS = STOCK_FIELDS.filter(field=>! /^(opening|receipt|issue)_/.test(field.key))
  .flatMap(field=>field.key==='material'?[field,{key:'color',label:'색상',numeric:false}]:field.key==='stock_quantity'?[{key:'unit',label:'단위',numeric:false},field]:[field]);
function currentStockRows(rows) { return rows.filter(row=>Number(row.stock_quantity)>0); }
function stockRiskItems(rows) {
  return rows.filter(row=>{
    const standard=Number(row.standard_stock_quantity),stock=Number(row.stock_quantity)||0;
    return Number.isSafeInteger(standard)&&standard>0&&stock*5<standard;
  }).slice().sort((a,b)=>Number(a.stock_quantity)/Number(a.standard_stock_quantity)-Number(b.stock_quantity)/Number(b.standard_stock_quantity));
}
function filterInventoryItems(rows,{query='',availability='all',dateProductIds=null,supplier=''}={}) {
  const text=String(query).trim().toLowerCase(),vendor=String(supplier).trim().toLowerCase();
  return rows.filter(item=>
    PRODUCT_FIELDS.some(key=>String(item[key]||'').toLowerCase().includes(text))&&
    (availability==='all'||(Number(item.stock_quantity)>0)===(availability==='available'))&&
    (!dateProductIds||dateProductIds.has(String(item.id)))&&
    String(item.supplier||'').toLowerCase().includes(vendor)
  );
}
function filterSalesOrders(rows,{startDate='',endDate='',orderType='',salesStatus=''}={}) {
  return rows.filter(order=>{
    const date=String(order.order_date||'').slice(0,10);
    return (!startDate||date>=startDate)&&(!endDate||date<=endDate)&&
      (!orderType||order.order_type===orderType)&&(!salesStatus||order.sales_status===salesStatus);
  });
}
function summarizeSalesOrders(rows,filters={}) {
  const orders=filterSalesOrders(rows,{...filters,salesStatus:''});
  const cents=orders.reduce((totals,order)=>{
    const amount=Math.round(Number(order.amount||0)*100);
    totals.total+=amount;
    if(order.sales_status==='매출완료')totals.completed+=amount;
    else totals.outstanding+=amount;
    return totals;
  },{total:0,completed:0,outstanding:0});
  return {total:cents.total/100,completed:cents.completed/100,outstanding:cents.outstanding/100};
}
function todayDate() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function sixMonthsAgoDate(today=todayDate()) {
  const [year,month,day]=today.split('-').map(Number),targetMonth=month-1-6;
  const lastTargetDay=new Date(Date.UTC(year,targetMonth+1,0)).getUTCDate();
  return new Date(Date.UTC(year,targetMonth,Math.min(day,lastTargetDay))).toISOString().slice(0,10);
}
function stockAgingRows(rows,today=todayDate()) {
  const cutoff=sixMonthsAgoDate(today);
  return rows.filter(row=>Number(row.remaining_quantity)>0&&row.received_date<=cutoff)
    .slice().sort((a,b)=>a.received_date.localeCompare(b.received_date)||Number(a.sequence_id)-Number(b.sequence_id));
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value >= '1900-01-01' && value <= todayDate();
}
function validOrderDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value >= '1900-01-01';
}
function planFifo(lots,quantity,date) {
  const ordered = lots.filter(lot => Number(lot.remaining_quantity)>0 && lot.received_date<=date)
    .slice().sort((a,b) => a.received_date.localeCompare(b.received_date) || (BigInt(a.id)<BigInt(b.id) ? -1 : BigInt(a.id)>BigInt(b.id) ? 1 : 0));
  let left = quantity, amountCents = 0n;
  const allocations = [];
  for (const lot of ordered) {
    if (left<=0) break;
    const take = Math.min(left,Number(lot.remaining_quantity));
    const cents = BigInt(Math.round(Number(lot.unit_cost)*100))*BigInt(take);
    allocations.push({...lot,take,amount:Number(cents)/100}); amountCents += cents; left -= take;
  }
  const amount = Number(amountCents)/100;
  return {allocations,shortage:Math.max(left,0),amount,unitCost:quantity>0 ? amount/quantity : 0};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {STOCK_FIELDS,STOCK_DISPLAY_FIELDS,PRODUCT_FIELDS,PRODUCT_UNITS,CURRENT_STOCK_FIELDS,currentStockRows,stockRiskItems,stockAgingRows,sixMonthsAgoDate,filterInventoryItems,filterSalesOrders,summarizeSalesOrders,todayDate,validDate,validOrderDueDate,planFifo};
