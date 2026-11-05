import { moneyPreview } from './money-preview';
import { commitMoney } from './money-service';
import { emptyMoney, moneyWrites, type MoneyAction, type MoneyRow } from './money';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, reauthenticateWithPopup, reauthenticateWithRedirect, signOut, type User } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { type CollectionName, type Data, type Row, type Task, type Log, type Preferences, collections, emptyData, seedData, newUserData, monday, nextTask, dateKey, newTask, shiftDate } from './domain';
import { createCalendarSession } from './calendar-session';

export const firebaseConfig = {
  apiKey: 'AIzaSyAdGDoQYLC_oGwx5vyUq7K2spSVRthG4-Q',
  authDomain: ['keepwalking.web.app', 'keepwalk-2433b.web.app'].includes(location.hostname) ? location.hostname : 'keepwalk-2433b.firebaseapp.com',
  projectId: 'keepwalk-2433b', storageBucket: 'keepwalk-2433b.firebasestorage.app',
  messagingSenderId: '527121584625', appId: '1:527121584625:web:b7ab59626a59aa3f9c7450',
};
export const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];
const calendarSession = createCalendarSession(() => localStorage, () => sessionStorage);
export function calendarToken(): string | null {
  const user = auth.currentUser;
  return user?.emailVerified ? calendarSession.token(user.uid) : null;
}
function remember(result: Awaited<ReturnType<typeof signInWithPopup>>) {
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (token && result.user.emailVerified && result.user.uid === auth.currentUser?.uid) calendarSession.save(result.user.uid, token, Date.now()+50*60*1000);
}
const redirectResult = getRedirectResult(auth);
export async function finishRedirect() { const result = await redirectResult; if (result && sessionStorage.getItem('kw-calendar-redirect') === '1') { remember(result); sessionStorage.removeItem('kw-calendar-redirect'); } }
function provider(calendar = false) {
  const p = new GoogleAuthProvider();
  p.setCustomParameters(calendar && auth.currentUser?.email ? { login_hint: auth.currentUser.email } : { prompt: 'select_account' });
  if (calendar) CALENDAR_SCOPES.forEach(scope => p.addScope(scope));
  return p;
}
export async function login() {
  if (matchMedia('(max-width: 640px)').matches && location.hostname.endsWith('.web.app')) return signInWithRedirect(auth, provider());
  await signInWithPopup(auth, provider());
}
export async function connectCalendar() {
  if (!auth.currentUser) throw new Error('Sign in with Google first.');
  if (matchMedia('(max-width: 640px)').matches && location.hostname.endsWith('.web.app')) {
    sessionStorage.setItem('kw-calendar-redirect','1'); await reauthenticateWithRedirect(auth.currentUser,provider(true)); return;
  }
  remember(await reauthenticateWithPopup(auth.currentUser, provider(true)));
}
export async function logout() { calendarSession.clear(); await signOut(auth); }
export function disconnectCalendar() { calendarSession.clear(); }
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export interface Store {
  demo: boolean;
  money: (action: MoneyAction) => Promise<void>;
  subscribe: (receive: (data: Data, pending: boolean) => void, error: (error: Error) => void) => () => void;
  save: (name: CollectionName, row: Row) => Promise<void>;
  remove: (name: CollectionName, id: string) => Promise<void>;
  saveMany: (rows: { name: CollectionName; row: Row }[]) => Promise<void>;
  complete: (task: Task) => Promise<void>;
  syncTask: (task: Task, update: Partial<Task>) => Promise<void>;
  log: (goalId: string, date: string, amount: number, mode: 'add' | 'set', note: string) => Promise<void>;
}
export async function cloudStore(user: User): Promise<Store> {
  if (!user.emailVerified || !user.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('Sign in with a verified Google account to open your space.');
  const ref = (name: CollectionName, id: string) => doc(db,'users',user.uid,name,id);
  await runTransaction(db,async tx => {
    const settings = await tx.get(ref('preferences','app'));
    if (settings.exists()) return;
    const seed = newUserData();
    for (const name of collections) for (const row of seed[name]) tx.set(ref(name,row.id),clean(row));
  });
  return {
    demo: false,
    async money(action) { await commitMoney(db,user.uid,action); },
    subscribe(receive,error) {
      const data = emptyData(), ready = new Set<string>(), pending = new Map<string,boolean>();
      const unsubs = collections.map(name => onSnapshot(collection(db,'users',user.uid,name),{includeMetadataChanges:true},snapshot => {
        (data[name] as Row[]) = snapshot.docs.map(item => ({...item.data(),id:item.id}) as Row);
        ready.add(name); pending.set(name,snapshot.metadata.hasPendingWrites);
        if (ready.size === collections.length) receive({...data},[...pending.values()].some(Boolean));
      },error));
      return () => unsubs.forEach(unsub => unsub());
    },
    async save(name,row) { await setDoc(ref(name,row.id),clean(row)); },
    async remove(name,id) { await deleteDoc(ref(name,id)); },
    async saveMany(rows) { const batch=writeBatch(db); rows.forEach(({name,row})=>batch.set(ref(name,row.id),clean(row))); await batch.commit(); },
    async syncTask(task,update) {
      await runTransaction(db,async tx=>{
        const snapshot=await tx.get(ref('tasks',task.id));
        if(!snapshot.exists())return;
        const current=snapshot.data() as Task;
        if(current.google?.eventId!==task.google?.eventId || current.google?.etag!==task.google?.etag)return;
        tx.update(ref('tasks',task.id),clean(update));
      });
    },
    async complete(task) {
      await runTransaction(db,async tx => {
        const current=await tx.get(ref('tasks',task.id));
        const wasDone=current.exists() && current.data().done;
        const next=task.done && !wasDone ? nextTask(task) : null;
        const existing=next ? await tx.get(ref('tasks',next.id)) : null;
        tx.set(ref('tasks',task.id),clean({...task,completedAt:task.done?Date.now():0}));
        if (next && !existing?.exists()) tx.set(ref('tasks',next.id),clean(next));
      });
    },
    async log(goalId,date,amount,mode,note) {
      const id=`${goalId}_${date}`;
      await runTransaction(db,async tx => {
        const old=await tx.get(ref('logs',id));
        const value=mode==='add' ? (old.exists()?Number(old.data().value):0)+amount : amount;
        if (!Number.isFinite(value) || value<0 || value>1e9) throw new Error('Enter a valid non-negative result.');
        tx.set(ref('logs',id),{id,goalId,date,value,note});
      });
    },
  };
}
export function demoStore(): Store {
  const key='keep-walking-preview-v1';
  let data: Data;
  try { data=JSON.parse(localStorage.getItem(key)||'null') || seedData(monday()); } catch { data=seedData(monday()); }
  if (!localStorage.getItem(key)) {
    data.tasks=[{...newTask(dateKey()),title:'Plan the week ahead',categoryId:'personal',important:true,subtasks:[{id:'one',title:'Choose this week’s priorities',done:false},{id:'two',title:'Review your weekly minimums',done:false}]},
    {...newTask(dateKey()),title:'Make room for a little progress',categoryId:'health',dueTime:'18:00'},
    {...newTask(shiftDate(dateKey(),1)),title:'Block out a focused study session',categoryId:'study'}];
  }
  data={...emptyMoney(),...data};
  if(!data.moneyMeta.length)Object.assign(data,moneyPreview());
  let listener: ((data: Data,pending:boolean)=>void)|null=null;
  function emit() { localStorage.setItem(key,JSON.stringify(data)); listener?.({...data},false); }
  function put(name:CollectionName,row:Row) { (data[name] as Row[]) = [...(data[name] as Row[]).filter(item=>item.id!==row.id),clean(row)]; }
  return {demo:true,async money(action){for(const {name,row} of moneyWrites(data,action)){(data[name] as MoneyRow[])=[...(data[name] as MoneyRow[]).filter(item=>item.id!==row.id),row];}emit();},subscribe(receive) { listener=receive;receive({...data},false);return()=>{listener=null;}; },
    async save(name,row){put(name,row);emit();}, async saveMany(rows){rows.forEach(({name,row})=>put(name,row));emit();},
    async remove(name,id){(data[name] as Row[])=(data[name] as Row[]).filter(row=>row.id!==id);emit();},
    async syncTask(task,update){const current=data.tasks.find(t=>t.id===task.id);if(current){put('tasks',{...current,...update});emit();}},
    async complete(task){const old=data.tasks.find(t=>t.id===task.id);const next=task.done&&!old?.done?nextTask(task):null;put('tasks',{...task,completedAt:task.done?Date.now():0});if(next&&!data.tasks.some(t=>t.id===next.id))put('tasks',next);emit();},
    async log(goalId,date,amount,mode,note){const id=`${goalId}_${date}`,old=data.logs.find(log=>log.id===id);put('logs',{id,goalId,date,value:mode==='add'?(old?.value??0)+amount:amount,note} as Log);emit();},
  };
}

export interface Calendar { id: string; summary: string; backgroundColor: string; accessRole: string; primary?: boolean; timeZone?: string }
export interface CalendarEvent { id: string; summary?: string; description?: string; start: {dateTime?:string;date?:string}; end: {dateTime?:string;date?:string}; calendarId: string; etag?: string; reminders?: {useDefault:boolean;overrides?:{method:string;minutes:number}[]}; extendedProperties?: {private?:Record<string,string>}; htmlLink?:string; status?:string }
export class CalendarError extends Error { constructor(message:string,public status:number){super(message);} }
async function google<T>(path:string,init:RequestInit={},etag?:string):Promise<T> {
  const token=calendarToken(); if(!token) throw new CalendarError('Reconnect Google Calendar to refresh its access.',401);
  const response=await fetch(`https://www.googleapis.com/calendar/v3/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{}),...init.headers}});
  if(!response.ok){if(response.status===401)disconnectCalendar();const body=await response.json().catch(()=>null);throw new CalendarError(response.status===412?'This event changed in Google Calendar. Refresh before editing it again.':body?.error?.message || `Google Calendar request failed (${response.status}).`,response.status);}
  return response.status===204 ? undefined as T : response.json();
}
export async function listCalendars():Promise<Calendar[]> {
  let items:Calendar[]=[],page='';
  do {const result=await google<{items?:Calendar[];nextPageToken?:string}>(`users/me/calendarList?maxResults=250${page?'&pageToken='+encodeURIComponent(page):''}`);items.push(...result.items||[]);page=result.nextPageToken||'';}while(page);
  return items;
}
export async function listEvents(calendarId:string,start:string,end:string):Promise<CalendarEvent[]> {
  const params=new URLSearchParams({timeMin:new Date(`${start}T00:00:00`).toISOString(),timeMax:new Date(`${end}T00:00:00`).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'2500'});
  let events:CalendarEvent[]=[],page='';
  do {if(page)params.set('pageToken',page);const result=await google<{items?:CalendarEvent[];nextPageToken?:string}>(`calendars/${encodeURIComponent(calendarId)}/events?${params}`);events.push(...(result.items||[]).map(event=>({...event,calendarId})));page=result.nextPageToken||'';}while(page);
  return events.filter(event=>event.status!=='cancelled');
}
export async function readEvent(calendarId:string,id:string):Promise<CalendarEvent> {
  return {...await google<CalendarEvent>(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`),calendarId};
}
export function linkedTaskUpdate(task:Task,event:CalendarEvent):Partial<Task> {
  const start=event.start.dateTime?new Date(event.start.dateTime):null;
  const localTime=start?`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`:'';
  const duration=start&&event.end.dateTime?Math.round((new Date(event.end.dateTime).getTime()-start.getTime())/60000):task.duration;
  return {title:event.summary||'(Untitled event)',notes:event.description||'',dueDate:eventDay(event),dueTime:localTime,duration,
    google:{calendarId:event.calendarId,eventId:event.id,etag:event.etag},
    reminder:event.reminders?.useDefault?task.reminder:event.reminders?.overrides?.[0]?.minutes??-1};
}
export async function writeEvent(calendarId:string,body:Record<string,unknown>,id?:string,etag?:string):Promise<CalendarEvent> {
  const path=`calendars/${encodeURIComponent(calendarId)}/events`;
  try {return {...await google<CalendarEvent>(path+(id?'/'+encodeURIComponent(id):''),{method:id?'PATCH':'POST',body:JSON.stringify(body)},etag),calendarId};}
  catch(error){
    if(error instanceof CalendarError && error.status===409 && !id && typeof body.id==='string') {
      const existing=await google<CalendarEvent>(path+'/'+encodeURIComponent(body.id));
      if(existing.extendedProperties?.private?.keepWalkingId===(body.extendedProperties as {private?:Record<string,string>}|undefined)?.private?.keepWalkingId)return{...existing,calendarId};
    }
    throw error;
  }
}
export async function removeEvent(event:Pick<CalendarEvent,'id'|'calendarId'|'etag'>){try{await google(`calendars/${encodeURIComponent(event.calendarId)}/events/${encodeURIComponent(event.id)}`,{method:'DELETE'},event.etag);}catch(e){if(!(e instanceof CalendarError)||![404,410].includes(e.status))throw e;}}
export const eventDay=(event:CalendarEvent)=>event.start.date || dateKey(new Date(event.start.dateTime!));
export function eventBody(title:string,date:string,time:string,duration:number,description:string,reminder:number) {
  const start=new Date(`${date}T${time}:00`);const end=new Date(start.getTime()+duration*60000);
  return {summary:title,description,start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},reminders:reminder<0?{useDefault:false}:{useDefault:false,overrides:[{method:'popup',minutes:reminder}]}};
}
