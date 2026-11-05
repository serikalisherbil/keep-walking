import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { emptyMoney, moneyWrites, type MoneyAction, type MoneyCollection, type MoneyData, type MoneyEntry, type MoneyRow } from './money';

// Read current account/debt documents inside the transaction: simultaneous device
// edits retry against current balances instead of overwriting an older snapshot.
export async function commitMoney(db:Firestore,userId:string,action:MoneyAction){
  const ref=(name:MoneyCollection,id:string)=>doc(db,'users',userId,name,id);
  await runTransaction(db,async tx=>{
    const data=emptyMoney();const read=new Set<string>();
    async function load(name:MoneyCollection,id:string){
      if(!id||read.has(`${name}/${id}`))return;read.add(`${name}/${id}`);
      const snapshot=await tx.get(ref(name,id));
      if(snapshot.exists())(data[name] as MoneyRow[]).push({...snapshot.data(),id} as MoneyRow);
    }
    if(['init','period','period-edit'].includes(action.kind))await load('moneyMeta','state');
    if(action.kind==='account')await load('moneyAccounts',action.row.id);
    if(action.kind==='category')await load('moneyCategories',action.row.id);
    if(action.kind==='recurring'){await load('moneyRecurring',action.row.id);await load('moneyAccounts',action.row.accountId);}
    if(action.kind==='existing-debt'){await load('moneyDebts',action.row.id);await load('moneyAccounts',action.row.accountId);}
    if(action.kind==='debt-details')await load('moneyDebts',action.id);
    if(action.kind==='period'||action.kind==='period-edit')await load('moneyPeriods',data.moneyMeta[0]?.currentPeriodId||'');
    if(action.kind==='period-edit')await load('moneyPeriods',action.row.id);
    if(action.kind==='limit')await load('moneyPeriods',action.periodId);
    if(action.kind==='entry'||action.kind==='void'){
      await load('moneyEntries',action.kind==='void'?action.id:action.row.id);
      const entries:MoneyEntry[]=[...data.moneyEntries,...(action.kind==='entry'?[action.row]:[])];
      for(const entry of entries){await load('moneyAccounts',entry.from);await load('moneyAccounts',entry.to);await load('moneyDebts',entry.debtId);}
    }
    for(const {name,row} of moneyWrites(data,action))tx.set(ref(name,row.id),JSON.parse(JSON.stringify(row)));
  });
}
