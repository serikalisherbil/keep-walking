import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyMoney,moneyWrites,entryDraft,parseMoney,totals,periodEntries,nextDue,type MoneyAction,type MoneyRow,type MoneyEntry,type MoneyDebt} from './money';
const now=new Date('2026-11-06T20:00:00+05:00').getTime();
function fixture(){
  const data=emptyMoney();
  function apply(action:MoneyAction){const writes=moneyWrites(data,action,now);for(const {name,row} of writes)(data[name] as MoneyRow[])=[...(data[name] as MoneyRow[]).filter(x=>x.id!==row.id),row];return writes;}
  const account=(id:string,opening:number,kind:'account'|'goal'='account')=>apply({kind:'account',row:{id,name:id,opening,balance:0,kind,icon:'💳',color:'#fff',archived:false,target:kind==='goal'?100000:0}});
  const entry=(id:string,kind:MoneyEntry['kind'],amount:number,from:string,to='',extra:Partial<MoneyEntry>={})=>apply({kind:'entry',row:{...entryDraft(kind),id,at:now-1000,amount,from,to,categoryId:kind==='expense'?'expense-food':kind==='income'?'income-salary':'',...extra}});
  const balance=(id:string)=>data.moneyAccounts.find(a=>a.id===id)!.balance;
  apply({kind:'init',at:now});account('bank',100000);account('cash',5000);account('skates',0,'goal');
  return{data,apply,account,entry,balance};
}
test('amounts use exact tiyn, reject invalid input, and accept zero only where intended',()=>{
  assert.equal(parseMoney('1 234,56'),123456);assert.equal(parseMoney('0.19'),19);assert.equal(parseMoney('0',true),0);
  for(const input of ['','-10','1.123','Infinity','1e6','0'])assert.throws(()=>parseMoney(input));
});
test('transfers preserve assets and never inflate income or expenses',()=>{
  const x=fixture();x.entry('move','transfer',30000,'bank','cash');
  assert.equal(x.balance('bank'),70000);assert.equal(x.balance('cash'),35000);assert.equal(x.balance('bank')+x.balance('cash'),105000);
  assert.deepEqual(totals(x.data.moneyEntries),{income:0,expense:0});
});
test('goal funding leaves the main balance, purchase is counted once, and remainder returns',()=>{
  const x=fixture();x.entry('save','transfer',30000,'bank','skates');
  assert.equal(x.balance('bank')+x.balance('cash'),75000);assert.equal(x.balance('skates'),30000);
  x.entry('bought','expense',24000,'skates','',{purchase:true});assert.equal(x.balance('skates'),6000);
  assert.equal(x.data.moneyAccounts.find(a=>a.id==='skates')?.purchaseId,'bought');
  x.entry('rest','transfer',6000,'skates','cash');assert.equal(x.balance('skates'),0);
  assert.deepEqual(totals(x.data.moneyEntries),{income:0,expense:24000});
  assert.equal(x.data.moneyAccounts.reduce((s,a)=>s+a.balance,0),81000);
  x.apply({kind:'void',id:'bought'});assert.equal(x.balance('skates'),24000);assert.equal(x.data.moneyAccounts.find(a=>a.id==='skates')?.purchaseId,'');
});
test('invalid goal spending and nonzero archival fail without altering any records',()=>{
  const x=fixture(),before=JSON.stringify(x.data);
  assert.throws(()=>x.entry('too-much','expense',1000,'skates','',{purchase:true}),/Not enough/);
  assert.throws(()=>x.apply({kind:'account',row:{...x.data.moneyAccounts[0],archived:true}}),/remaining money/);
  assert.equal(JSON.stringify(x.data),before);
});
test('editing or voiding an old expense reverses its previous effect exactly',()=>{
  const x=fixture();x.entry('coffee','expense',19,'bank');x.entry('coffee','expense',29,'cash');
  assert.equal(x.balance('bank'),100000);assert.equal(x.balance('cash'),4971);
  x.apply({kind:'void',id:'coffee'});assert.equal(x.balance('cash'),5000);assert.deepEqual(totals(x.data.moneyEntries),{income:0,expense:0});
});
test('voided entries remain available in period history and restoring funds reopens an archived account',()=>{
  const x=fixture();x.entry('all-spent','expense',100000,'bank');
  const a=x.data.moneyAccounts.find(a=>a.id==='bank')!;
  x.apply({kind:'account',row:{...a,archived:true}});
  x.apply({kind:'void',id:'all-spent'});
  assert.equal(x.balance('bank'),100000);assert.equal(x.data.moneyAccounts.find(a=>a.id==='bank')?.archived,false);
  const period=x.data.moneyPeriods[0];
  assert.equal(periodEntries(x.data,period).length,0);assert.equal(periodEntries(x.data,period,true).length,1);
});
for(const direction of ['lent','borrowed'] as const)test(`${direction}: partial repayments update debt and account, without entering spending totals`,()=>{
  const x=fixture();const debt:MoneyDebt={id:'friend',person:'Friend',direction,principal:40000,remaining:40000,accountId:'bank',due:'',note:''};
  x.apply({kind:'entry',newDebt:debt,row:{...entryDraft('loan'),id:'loan',at:now-2000,amount:40000,from:'bank',debtId:'friend'}});
  assert.equal(x.balance('bank'),direction==='lent'?60000:140000);
  assert.equal(x.data.moneyEntries[0].from,direction==='lent'?'bank':'');
  assert.equal(x.data.moneyEntries[0].to,direction==='borrowed'?'bank':'');
  x.entry('partial','repayment',15000,'cash','',{debtId:'friend'});
  assert.equal(x.data.moneyDebts[0].remaining,25000);assert.equal(x.balance('cash'),direction==='lent'?20000:-10000);
  assert.throws(()=>x.entry('overpay','repayment',25001,'bank','',{debtId:'friend'}),/exceeds/);
  assert.equal(x.data.moneyDebts[0].remaining,25000);
  assert.throws(()=>x.apply({kind:'void',id:'loan'}),/exceeds/);
  x.apply({kind:'void',id:'partial'});assert.equal(x.data.moneyDebts[0].remaining,40000);
  assert.deepEqual(totals(x.data.moneyEntries),{income:0,expense:0});
});
test('recording an existing debt leaves opening account balances intact',()=>{
  const x=fixture();x.apply({kind:'existing-debt',row:{id:'old',person:'Friend',direction:'borrowed',principal:10000,remaining:10000,accountId:'bank',due:'',note:''}});
  assert.equal(x.balance('bank'),100000);assert.equal(x.data.moneyEntries.length,0);
});
test('correcting an existing debt preserves repayments and does not change cash',()=>{
  const x=fixture();x.apply({kind:'existing-debt',row:{id:'old',person:'Friend',direction:'lent',principal:20000,remaining:20000,accountId:'bank',due:'',note:''}});
  x.entry('partial','repayment',5000,'bank','',{debtId:'old'});const balance=x.balance('bank');
  x.apply({kind:'debt-details',id:'old',person:'Correct name',due:'2026-12-01',note:'Corrected opening amount',principal:15000});
  assert.equal(x.data.moneyDebts[0].remaining,10000);assert.equal(x.data.moneyDebts[0].person,'Correct name');assert.equal(x.balance('bank'),balance);
  assert.throws(()=>x.apply({kind:'debt-details',id:'old',person:'Correct name',due:'',note:'',principal:4000}),/already repaid/);
});
test('debt detail edits preserve loan cash flows and changing a loan account updates its repayment default',()=>{
  const x=fixture(),d:MoneyDebt={id:'d',person:'Friend',direction:'lent',principal:10000,remaining:10000,accountId:'bank',due:'',note:''};
  const row={...entryDraft('loan'),id:'original',amount:10000,from:'bank',at:now-1000,debtId:'d'};
  x.apply({kind:'entry',row,newDebt:d});x.apply({kind:'debt-details',id:'d',person:'New name',due:'',note:'Note'});
  assert.equal(x.balance('bank'),90000);assert.equal(x.data.moneyDebts[0].remaining,10000);
  assert.throws(()=>x.apply({kind:'debt-details',id:'d',person:'New name',due:'',note:'',principal:20000}),/original loan/);
  x.apply({kind:'entry',row:{...row,from:'cash'}});assert.equal(x.data.moneyDebts[0].accountId,'cash');assert.equal(x.balance('bank'),100000);
});
test('manual period boundaries carry balances and budget limits, and historical edits change the right report',()=>{
  const x=fixture();x.apply({kind:'period-edit',row:{...x.data.moneyPeriods[0],start:now-10000}});
  x.apply({kind:'limit',periodId:'initial',categoryId:'expense-food',amount:20000});
  x.entry('lunch','expense',7000,'bank','',{at:now-5000});
  const before=x.balance('bank');x.apply({kind:'period',row:{id:'next',name:'Next',start:now-2000,limits:{}}});
  assert.equal(x.balance('bank'),before);assert.equal(x.data.moneyPeriods[1].limits['expense-food'],20000);
  assert.equal(totals(periodEntries(x.data,x.data.moneyPeriods[0])).expense,7000);assert.equal(totals(periodEntries(x.data,x.data.moneyPeriods[1])).expense,0);
  x.entry('lunch','expense',9000,'bank','',{at:now-1000});
  assert.equal(totals(periodEntries(x.data,x.data.moneyPeriods[0])).expense,0);assert.equal(totals(periodEntries(x.data,x.data.moneyPeriods[1])).expense,9000);
});
test('monthly due dates return to the 31st after February; payment is posted only on confirmation and once',()=>{
  const x=fixture(),payment={id:'monthly',name:'Rent',amount:1000,accountId:'bank',categoryId:'expense-food',start:'2027-01-31',frequency:'monthly' as const,active:true};
  assert.equal(nextDue(payment,[]),'2027-01-31');
  const records=[{...entryDraft(),recurringId:'monthly',occurrence:'2027-01-31'},{...entryDraft(),recurringId:'monthly',occurrence:'2027-02-28'}];
  assert.equal(nextDue(payment,records),'2027-03-31');
  const row={...entryDraft(),id:'paid-once',at:now-1000,amount:1000,from:'bank',categoryId:'expense-food',recurringId:'monthly',occurrence:'2026-11-06'};
  x.apply({kind:'entry',row,ifAbsent:true});x.apply({kind:'entry',row,ifAbsent:true});assert.equal(x.balance('bank'),99000);assert.equal(x.data.moneyEntries.length,1);
});
