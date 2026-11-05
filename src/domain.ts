import { emptyMoney, moneyCollections, type MoneyData } from './money';
import { addDays, addMonths, format, getDaysInMonth, parseISO, startOfWeek } from 'date-fns';

export type GoalType = 'quantity' | 'time' | 'check';
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export interface Category { id: string; name: string; color: string; order: number; archived?: boolean }
export interface GoogleLink { calendarId: string; eventId: string; etag?: string }
export interface Task {
  id: string; title: string; categoryId: string; important: boolean; done: boolean;
  dueDate: string; dueTime: string; duration: number; repeat: Repeat; days: number[];
  anchorDay: number; seriesId: string; subtasks: { id: string; title: string; done: boolean }[];
  notes: string; createdAt: number; completedAt?: number; archived?: boolean;
  shareGoogle: boolean; google?: GoogleLink | null; reminder: number;
}
export interface Goal { id: string; name: string; type: GoalType; unit: string; color: string; createdWeek: string; archivedWeek?: string }
export interface GoalVersion { id: string; goalId: string; week: string; target: number; plan: number[]; name: string; unit: string; type: GoalType }
export interface Plan extends GoalVersion {}
export interface Log { id: string; goalId: string; date: string; value: number; note: string }
export interface Slot { id: string; title: string; date: string; time: string; duration: number; goalId: string; google?: GoogleLink | null; reminder: number }
export interface Preferences { id: string; theme: 'system' | 'light' | 'dark'; reminderMinutes: number; eveningTime: string; eveningEnabled: boolean; inAppReminders: boolean; defaultCalendarId: string; hiddenCalendarIds: string[] }
export interface Data extends MoneyData { categories: Category[]; tasks: Task[]; goals: Goal[]; versions: GoalVersion[]; plans: Plan[]; logs: Log[]; slots: Slot[]; preferences: Preferences[] }
export type CollectionName = keyof Data;
export type Row = Data[CollectionName][number];
export const collections: CollectionName[] = ['categories', 'tasks', 'goals', 'versions', 'plans', 'logs', 'slots', 'preferences', ...moneyCollections];
export const emptyData = (): Data => ({ ...emptyMoney(), categories: [], tasks: [], goals: [], versions: [], plans: [], logs: [], slots: [], preferences: [] });
export const COLORS = ['#477968', '#8a78ab', '#cc965a', '#5d89ae', '#c8797c', '#879250'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dateKey = (date: Date = new Date()) => format(date, 'yyyy-MM-dd');
export const dateOf = (key: string) => parseISO(`${key}T12:00:00`);
export const shiftDate = (key: string, days: number) => dateKey(addDays(dateOf(key), days));
export const monday = (key: string = dateKey()) => dateKey(startOfWeek(dateOf(key), { weekStartsOn: 1 }));
export const weekDates = (week: string) => Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
export const weekday = (key: string) => (dateOf(key).getDay() + 6) % 7;
export const uid = () => crypto.randomUUID();
export const prefsDefault: Preferences = { id: 'app', theme: 'system', reminderMinutes: 15, eveningTime: '21:00', eveningEnabled: true, inAppReminders: false, defaultCalendarId: '', hiddenCalendarIds: [] };

// Whole units, with remainder spread across the selected days (including small goals).
export function distribute(total: number, selected: number[] = [0,1,2,3,4,5,6]): number[] {
  const days = [...new Set(selected)].filter(day => Number.isInteger(day) && day >= 0 && day < 7).sort((a,b) => a-b);
  const result = Array(7).fill(0) as number[];
  if (!days.length || total <= 0) return result;
  const units = Math.round(total), base = Math.floor(units / days.length), remainder = units % days.length;
  days.forEach(day => { result[day] = base; });
  for (let i = 0; i < remainder; i++) result[days[Math.floor(i * days.length / remainder)]]++;
  return result;
}
export function nextDate(task: Pick<Task, 'dueDate' | 'repeat' | 'days' | 'anchorDay'>): string | null {
  if (!task.dueDate || task.repeat === 'none') return null;
  if (task.repeat === 'daily') return shiftDate(task.dueDate, 1);
  if (task.repeat === 'weekly') {
    const days = task.days.length ? task.days : [weekday(task.dueDate)];
    for (let i = 1; i <= 7; i++) { const candidate = shiftDate(task.dueDate, i); if (days.includes(weekday(candidate))) return candidate; }
  }
  if (task.repeat === 'monthly') {
    const next = addMonths(dateOf(task.dueDate), 1);
    next.setDate(Math.min(task.anchorDay || dateOf(task.dueDate).getDate(), getDaysInMonth(next)));
    return dateKey(next);
  }
  return null;
}
export function nextTask(task: Task): Task | null {
  const dueDate = nextDate(task);
  if (!dueDate) return null;
  return { ...task, id: `${task.seriesId}_${dueDate}`, dueDate, done: false, completedAt: 0, google: null,
    subtasks: task.subtasks.map(subtask => ({ ...subtask, done: false })), createdAt: Date.now() };
}
export function newTask(day = ''): Task {
  const id = uid();
  return { id, title: '', categoryId: 'personal', important: false, done: false, dueDate: day, dueTime: '', duration: 30, repeat: 'none', days: [], anchorDay: day ? dateOf(day).getDate() : 1, seriesId: id, subtasks: [], notes: '', createdAt: Date.now(), shareGoogle: false, google: null, reminder: 15 };
}
export function newUserData(): Data {
  const data = emptyData();
  data.categories = ['Study', 'Work', 'Personal', 'Health'].map((name, i) => ({ id: name.toLowerCase(), name, color: COLORS[i], order: i }));
  data.preferences = [{ ...prefsDefault, hiddenCalendarIds: [] }];
  return data;
}
export function seedData(week: string): Data {
  const data = newUserData();
  const seeds: [string, number, GoalType][] = [['Pace(kiki)',20,'quantity'],['Shooting(rnk)',20,'quantity'],['Passing(kit)',40,'quantity'],['Dribbling(vid)',40,'time'],['Defending(Th)',2,'quantity'],['Physicality',1,'quantity']];
  data.goals = seeds.map(([name,,type],i) => ({ id: `goal-${i+1}`, name, type, unit: type === 'time' ? 'min' : 'units', color: COLORS[i], createdWeek: week }));
  data.versions = seeds.map(([,target],i) => ({ ...data.goals[i], id: `${data.goals[i].id}_${week}`, goalId: data.goals[i].id, week, target, plan: distribute(target) }));
  return data;
}
export function planFor(goal: Goal, week: string, data: Data): Plan | undefined {
  if (week < goal.createdWeek || (goal.archivedWeek && week >= goal.archivedWeek)) return;
  const override = data.plans.find(plan => plan.goalId === goal.id && plan.week === week);
  if (override) return override;
  const version = data.versions.filter(v => v.goalId === goal.id && v.week <= week).sort((a,b) => b.week.localeCompare(a.week))[0];
  return version ? { ...version, id: `${goal.id}_${week}`, week } : undefined;
}
export const valueFor = (data: Data, goalId: string, date: string) => data.logs.find(log => log.goalId === goalId && log.date === date)?.value ?? 0;
export const weekTotal = (data: Data, goalId: string, week: string) => weekDates(week).reduce((total,date) => total + valueFor(data, goalId, date), 0);
export function redistribute(plan: Plan, data: Data, from: number): number[] {
  const dates = weekDates(plan.week);
  const remaining = Math.max(0, plan.target - weekTotal(data, plan.goalId, plan.week));
  const selected = dates.map((_,i) => i).filter(i => i >= from && (plan.type !== 'check' || valueFor(data, plan.goalId, dates[i]) === 0));
  const capacity = plan.type === 'check' ? Math.min(remaining, selected.length) : remaining;
  const split = distribute(capacity, selected);
  return plan.plan.map((old,i) => i < from ? old : valueFor(data, plan.goalId, dates[i]) + split[i]);
}
export function monthStats(goal: Goal, month: string, data: Data, today = dateKey()) {
  const total = data.logs.filter(log => log.goalId === goal.id && log.date.startsWith(month)).reduce((sum,log) => sum + log.value, 0);
  const end = dateKey(addMonths(dateOf(`${month}-01`),1));
  let first = monday(`${month}-01`); if (first < `${month}-01`) first = shiftDate(first,7);
  let completed = 0, count = 0;
  for (let week = first; week < end && week <= today; week = shiftDate(week,7)) {
    const plan = planFor(goal,week,data); if (!plan || plan.target <= 0) continue;
    count++; if (weekTotal(data,goal.id,week) >= plan.target) completed++;
  }
  return { total, completed, count };
}
export const weekLabel = (week: string) => `${format(dateOf(week),'MMM d')} – ${format(dateOf(shiftDate(week,6)),'MMM d, yyyy')}`;
export const displayNumber = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n);
