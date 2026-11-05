import { emptyMoney,moneyWrites,entryDraft,dayKey,type MoneyAction,type MoneyRow } from './money';
export function moneyPreview(){
  const data=emptyMoney(),now=Date.now(),day=86400000;
  const apply=(action:MoneyAction)=>{for(const {name,row} of moneyWrites(data,action,now))(data[name] as MoneyRow[])=[...(data[name] as MoneyRow[]).filter(x=>x.id!==row.id),row];};
  apply({kind:'init',at:now-5*day});
  for(const [id,name,icon,color,opening,target,kind] of [
    ['demo-kaspi','Kaspi','💳','#e36a62',11500000,0,'account'],['demo-freedom','Freedom','🏦','#63ab69',6800000,0,'account'],['demo-cash','Cash','💵','#d5a54f',1250000,0,'account'],['demo-otbasy','Otbasy','🏠','#6593d9',20000000,0,'account'],['demo-skates','Skates','⛸️','#ac7ddd',0,3500000,'goal'],['demo-laptop','New laptop','💻','#668fdf',0,30000000,'goal']
  ] as const)apply({kind:'account',row:{id,name,icon,color,opening,target,kind,balance:0,archived:false}});
  const entry=(id:string,kind:'expense'|'income'|'transfer',amount:number,from:string,to:string,categoryId:string,note:string,ago:number)=>apply({kind:'entry',row:{...entryDraft(kind),id,amount,from,to,categoryId,note,at:now-ago*day}});
  entry('demo-pay','income',12500000,'','demo-kaspi','income-salary','Salary',4);
  entry('demo-save','transfer',2200000,'demo-kaspi','demo-skates','','For my first pair of skates',3);
  entry('demo-laptop-fund','transfer',4500000,'demo-freedom','demo-laptop','','A little closer to a laptop',3);
  entry('demo-food','expense',680000,'demo-kaspi','','expense-food','Groceries for the week',2);
  entry('demo-coffee','expense',180000,'demo-cash','','expense-food','Coffee with a friend',1);
  entry('demo-taxi','expense',240000,'demo-kaspi','','expense-transport','Ride home',1);
  entry('demo-book','expense',420000,'demo-freedom','','expense-study','A book for the weekend',.5);
  apply({kind:'limit',periodId:'initial',categoryId:'expense-food',amount:3000000});
  apply({kind:'limit',periodId:'initial',categoryId:'expense-transport',amount:1000000});
  apply({kind:'limit',periodId:'initial',categoryId:'expense-study',amount:1500000});
  apply({kind:'entry',newDebt:{id:'demo-friend',person:'A friend',direction:'lent',principal:1500000,remaining:1500000,accountId:'demo-kaspi',due:'',note:'Weekend plans'},row:{...entryDraft('loan'),id:'demo-loan',amount:1500000,from:'demo-kaspi',debtId:'demo-friend',at:now-2*day,note:'Lent to a friend'}});
  apply({kind:'entry',row:{...entryDraft('repayment'),id:'demo-return',amount:500000,from:'demo-kaspi',debtId:'demo-friend',at:now-day,note:'First part returned'}});
  apply({kind:'recurring',row:{id:'demo-internet',name:'Home internet',amount:499000,accountId:'demo-kaspi',categoryId:'expense-subscriptions',start:dayKey(now-day),frequency:'monthly',active:true}});
  return data;
}
