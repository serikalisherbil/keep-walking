import { addDays, addMonths, format, getDaysInMonth } from 'date-fns';

// All monetary amounts are integer tiyn. Bank integrations are not used.
export type MoneyKind = 'expense'|'income'|'transfer'|'loan'|'repayment';
export interface MoneyAccount { id:string; name:string; icon:string; color:string; kind:'account'|'goal'; opening:number; balance:number; target:number; archived:boolean; purchaseId?:string }
export interface MoneyCategory { id:string; name:string; icon:string; color:string; kind:'expense'|'income'; archived:boolean }
export interface MoneyEntry { id:string; kind:MoneyKind; amount:number; at:number; from:string; to:string; categoryId:string; note:string; debtId:string; recurringId:string; occurrence:string; purchase:boolean; voided:boolean; updatedAt:number }
export interface MoneyDebt { id:string; person:string; direction:'lent'|'borrowed'; principal:number; remaining:number; accountId:string; due:string; note:string; existing?:boolean }
export interface MoneyPeriod { id:string; name:string; start:number; limits:Record<string,number> }
export interface MoneyRecurring { id:string; name:string; amount:number; accountId:string; categoryId:string; start:string; frequency:'daily'|'weekly'|'monthly'; active:boolean }
export interface MoneyMeta { id:string; currentPeriodId:string }
export interface MoneyData { moneyAccounts:MoneyAccount[]; moneyCategories:MoneyCategory[]; moneyEntries:MoneyEntry[]; moneyDebts:MoneyDebt[]; moneyPeriods:MoneyPeriod[]; moneyRecurring:MoneyRecurring[]; moneyMeta:MoneyMeta[] }
export type MoneyCollection=keyof MoneyData;
export type MoneyRow=MoneyData[MoneyCollection][number];
export const moneyCollections:MoneyCollection[]=['moneyAccounts','moneyCategories','moneyEntries','moneyDebts','moneyPeriods','moneyRecurring','moneyMeta'];
export const emptyMoney=():MoneyData=>({moneyAccounts:[],moneyCategories:[],moneyEntries:[],moneyDebts:[],moneyPeriods:[],moneyRecurring:[],moneyMeta:[]});
export const moneyColors=['#ec9450','#58ae8b','#668fdf','#ac7ddd','#df6f8d','#d3ac49','#63afbc','#b18c71'];
export const moneyIcons=['💳','🏦','💵','🪙','🍽️','🛒','🚕','📚','🩺','🎮','🎬','📱','🎁','💼','🎓','🏠','✈️','⛸️','💻','🎯','👕','☕','⚽','💰'];
export function defaultMoneyCategories():MoneyCategory[]{
  return [...[['food','Food','🍽️'],['transport','Transport','🚕'],['shopping','Shopping','🛒'],['study','Study','📚'],['health','Health','🩺'],['fun','Entertainment','🎮'],['subscriptions','Subscriptions','📱'],['other','Other','🪙']].map(([id,name,icon],i)=>({id:`expense-${id}`,name,icon,color:moneyColors[i],kind:'expense' as const,archived:false})),
  ...[['salary','Salary','💼'],['scholarship','Scholarship','🎓'],['gift','Gift','🎁'],['freelance','Freelance','💻'],['other','Other income','💰']].map(([id,name,icon],i)=>({id:`income-${id}`,name,icon,color:moneyColors[(i+1)%8],kind:'income' as const,archived:false}))];
}
export const tenge=(amount:number)=>`${new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(amount/100)} ₸`;
export function parseMoney(input:string,zero=false):number {
  const value=input.trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(value))throw Error('Enter a positive amount with up to two decimal places.');
  const [whole,fraction='']=value.split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  checkAmount(amount,zero);return amount;
}
export const inputMoney=(value:number)=>String(value/100);
export const localTime=(at=Date.now())=>format(at,"yyyy-MM-dd'T'HH:mm");
export const dayKey=(at=Date.now())=>format(at,'yyyy-MM-dd');
export function entryDraft(kind:MoneyKind='expense'):MoneyEntry {return{id:crypto.randomUUID(),kind,amount:0,at:Date.now(),from:'',to:'',categoryId:'',note:'',debtId:'',recurringId:'',occurrence:'',purchase:false,voided:false,updatedAt:0};}
function checkAmount(value:number,zero=false){if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>1e14)throw Error('Enter a valid amount.');}
function name(value:string){if(!value.trim()||value.length>160)throw Error('Enter a name (up to 160 characters).');}
export interface MoneyWrite {name:MoneyCollection;row:MoneyRow}
export type MoneyAction = {kind:'init';at:number}|{kind:'account';row:MoneyAccount}|{kind:'category';row:MoneyCategory}|{kind:'recurring';row:MoneyRecurring}|{kind:'period';row:MoneyPeriod}|{kind:'period-edit';row:MoneyPeriod}|{kind:'limit';periodId:string;categoryId:string;amount:number}|{kind:'entry';row:MoneyEntry;newDebt?:MoneyDebt;ifAbsent?:boolean}|{kind:'void';id:string}|{kind:'existing-debt';row:MoneyDebt}|{kind:'debt-details';id:string;person:string;due:string;note:string;principal?:number};

// Pure transaction reducer. Its input can contain only the referenced current documents.
export function moneyWrites(data:MoneyData,action:MoneyAction,now=Date.now()):MoneyWrite[]{
  const writes:MoneyWrite[]=[];
  const put=(name:MoneyCollection,row:MoneyRow)=>writes.push({name,row});
  const get=<K extends MoneyCollection>(key:K,id:string):MoneyData[K][number]|undefined=>data[key].find(row=>row.id===id);
  if(action.kind==='init'){
    if(get('moneyMeta','state'))return [];
    put('moneyPeriods',{id:'initial',name:'My first period',start:new Date(`${dayKey(action.at)}T00:00:00`).getTime(),limits:{}});
    put('moneyMeta',{id:'state',currentPeriodId:'initial'});
    defaultMoneyCategories().forEach(row=>put('moneyCategories',row));return writes;
  }
  if(action.kind==='account'){
    const row={...action.row,name:action.row.name.trim()};name(row.name);checkAmount(row.opening,true);checkAmount(row.target,true);
    const old=get('moneyAccounts',row.id);if(old&&old.kind!==row.kind)throw Error('An account cannot be changed into a savings goal.');
    row.balance=(old?.balance??0)+row.opening-(old?.opening??0);row.purchaseId=old?.purchaseId||'';
    if(row.kind==='goal'&&row.opening!==0)throw Error('Fund a goal with a transfer from an account.');
    if(row.archived&&row.balance!==0)throw Error('Move the remaining money before archiving.');
    put('moneyAccounts',row);return writes;
  }
  if(action.kind==='category'){name(action.row.name);const old=get('moneyCategories',action.row.id);if(old&&old.kind!==action.row.kind)throw Error('Category type cannot change.');put('moneyCategories',action.row);return writes;}
  if(action.kind==='recurring'){name(action.row.name);checkAmount(action.row.amount);if(!/^\d{4}-\d{2}-\d{2}$/.test(action.row.start))throw Error('Choose a start date.');const account=get('moneyAccounts',action.row.accountId);if(!account||account.archived||account.kind!=='account')throw Error('Choose an active account.');put('moneyRecurring',action.row);return writes;}
  if(action.kind==='existing-debt'){name(action.row.person);checkAmount(action.row.principal);const a=get('moneyAccounts',action.row.accountId);if(!a||a.archived||a.kind!=='account')throw Error('Choose an active account.');if(get('moneyDebts',action.row.id))return [];put('moneyDebts',{...action.row,remaining:action.row.principal,existing:true});return writes;}
  if(action.kind==='debt-details'){
    const old=get('moneyDebts',action.id);if(!old)throw Error('Debt not found.');name(action.person);
    const principal=action.principal??old.principal;checkAmount(principal,true);
    if(!old.existing&&principal!==old.principal)throw Error('Edit the original loan transaction to change its amount.');
    const remaining=old.remaining+principal-old.principal;if(remaining<0)throw Error('The original debt cannot be less than the amount already repaid.');
    put('moneyDebts',{...old,person:action.person.trim(),due:action.due,note:action.note,principal,remaining});return writes;
  }
  if(action.kind==='limit'){
    checkAmount(action.amount,true);const period=get('moneyPeriods',action.periodId);if(!period)throw Error('Period not found.');put('moneyPeriods',{...period,limits:{...period.limits,[action.categoryId]:action.amount}});return writes;
  }
  if(action.kind==='period'){
    const current=get('moneyPeriods',get('moneyMeta','state')?.currentPeriodId||'');
    name(action.row.name);if(!current||action.row.start<=current.start||action.row.start>now+60000)throw Error('Start after the current period began and no later than now.');
    put('moneyPeriods',{...action.row,limits:{...current.limits}});put('moneyMeta',{id:'state',currentPeriodId:action.row.id});return writes;
  }
  if(action.kind==='period-edit'){
    const first=[...data.moneyPeriods].sort((a,b)=>a.start-b.start)[0];if(first?.id!==action.row.id||data.moneyPeriods.length>1)throw Error('Only the first period can be adjusted before starting another.');
    if(!Number.isFinite(action.row.start)||action.row.start>now)throw Error('Choose a valid past start date.');name(action.row.name);put('moneyPeriods',{...first,name:action.row.name,start:action.row.start});return writes;
  }
  const old=get('moneyEntries',action.kind==='void'?action.id:action.row.id);
  if(action.kind==='void'&&!old)throw Error('Transaction not found.');
  if(action.kind==='entry'&&action.ifAbsent&&old&&!old.voided)return [];
  const row:MoneyEntry=action.kind==='void'?{...old!,voided:true,updatedAt:now}:{...action.row,updatedAt:now};
  checkAmount(row.amount);if(!Number.isFinite(row.at)||row.at>now+60000)throw Error('Use an actual transaction date, not a future date.');
  if(row.note.length>2000)throw Error('Keep the note under 2,000 characters.');
  if(old&&(old.kind!==row.kind||old.debtId!==row.debtId||old.recurringId!==row.recurringId||old.occurrence!==row.occurrence))throw Error('Keep the transaction type and its debt/payment link.');
  if(['expense','transfer','loan','repayment'].includes(row.kind)&&!row.from&&row.kind!=='loan'&&row.kind!=='repayment')throw Error('Choose the source account.');
  if(['income','transfer'].includes(row.kind)&&!row.to)throw Error('Choose the destination account.');
  if(row.kind==='transfer'&&row.from===row.to)throw Error('Choose two different accounts or goals.');
  if((row.kind==='expense'&&row.to)||(row.kind==='income'&&row.from))throw Error('An expense has one source; an income has one destination.');
  if(['expense','income'].includes(row.kind)&&!row.categoryId)throw Error('Choose a category or income source.');
  const debts=new Map<string,MoneyDebt>();
  if(action.kind==='entry'&&action.newDebt&&!get('moneyDebts',action.newDebt.id)){
    name(action.newDebt.person);if(action.newDebt.id!==row.debtId||row.kind!=='loan')throw Error('Invalid debt link.');
    debts.set(row.debtId,{...action.newDebt,principal:0,remaining:0,existing:false});
  }
  const accounts=new Map<string,MoneyAccount>();
  function account(id:string,fresh:boolean){let value=accounts.get(id)||get('moneyAccounts',id);if(!value)throw Error('Account not found.');if(fresh&&value.archived)throw Error('Use an active account.');value={...value};accounts.set(id,value);return value;}
  function apply(entry:MoneyEntry,sign:number){
    if(entry.voided)return;
    let from=entry.from,to=entry.to;
    if(entry.kind==='loan'||entry.kind==='repayment'){
      let debt=debts.get(entry.debtId)||get('moneyDebts',entry.debtId);if(!debt)throw Error('Debt not found.');debt={...debt};debts.set(debt.id,debt);
      const delta=entry.amount*sign;
      if(entry.kind==='loan'){debt.principal+=delta;debt.remaining+=delta;}else debt.remaining-=delta;
      const incoming=(debt.direction==='borrowed')===(entry.kind==='loan');
      const id=entry.from||entry.to;if(!id)throw Error('Choose an account for the debt payment.');from=incoming?'':id;to=incoming?id:'';
      if(entry.kind==='loan'&&sign>0)debt.accountId=id;
      if(entry===row&&sign>0){row.from=from;row.to=to;}
    }
    if(from){const a=account(from,sign>0);a.balance-=entry.amount*sign;if(entry.purchase&&sign<0&&a.purchaseId===entry.id)a.purchaseId='';}
    if(to)account(to,sign>0).balance+=entry.amount*sign;
    if(entry.purchase&&sign>0){const a=account(from,true);if(a.kind!=='goal'||(a.purchaseId&&a.purchaseId!==entry.id))throw Error('This goal already has a purchase.');a.purchaseId=entry.id;}
  }
  if(old)apply(old,-1);apply(row,1);
  for(const account of accounts.values()){
    if(!Number.isSafeInteger(account.balance)||Math.abs(account.balance)>1e14)throw Error('Balance is out of range.');
    if(account.kind==='goal'&&account.balance<0)throw Error('Not enough money in this savings goal.');
    if(account.archived&&account.balance!==0)account.archived=false;
    put('moneyAccounts',account);
  }
  for(const debt of debts.values()){
    if(debt.remaining<0||debt.principal<0||debt.remaining>debt.principal)throw Error('The payment exceeds the remaining debt, or a later repayment depends on this loan.');
    put('moneyDebts',debt);
  }
  put('moneyEntries',row);return writes;
}

export function periodEntries(data:MoneyData,period:MoneyPeriod,includeVoided=false){const next=data.moneyPeriods.filter(p=>p.start>period.start).sort((a,b)=>a.start-b.start)[0];return data.moneyEntries.filter(e=>(includeVoided||!e.voided)&&e.at>=period.start&&(!next||e.at<next.start));}
export function totals(entries:MoneyEntry[]){return entries.reduce((a,e)=>{if(!e.voided){if(e.kind==='income')a.income+=e.amount;if(e.kind==='expense')a.expense+=e.amount;}return a;},{income:0,expense:0});}
export function nextDue(payment:MoneyRecurring,entries:MoneyEntry[]):string {
  const start=new Date(`${payment.start}T12:00:00`),anchor=start.getDate();
  for(let i=0;i<12000;i++){
    const date=payment.frequency==='daily'?addDays(start,i):payment.frequency==='weekly'?addDays(start,i*7):addMonths(start,i);
    if(payment.frequency==='monthly')date.setDate(Math.min(anchor,getDaysInMonth(date)));
    const day=format(date,'yyyy-MM-dd');
    if(!entries.some(e=>!e.voided&&e.recurringId===payment.id&&e.occurrence===day))return day;
  }
  throw Error('Payment history exceeds the supported schedule range.');
}
