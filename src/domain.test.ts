import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute, nextDate, monday, seedData, newUserData, planFor, redistribute, monthStats, weekTotal } from './domain.ts';
test('new users start with their own empty space, without the original personal goals', () => {
  const first = newUserData(), second = newUserData();
  assert.deepEqual(first.categories.map(item => item.name), ['Study', 'Work', 'Personal', 'Health']);
  for (const key of ['tasks', 'goals', 'versions', 'plans', 'logs', 'slots'] as const) assert.deepEqual(first[key], []);
  first.preferences[0].hiddenCalendarIds.push('private-calendar');
  first.categories[0].name = 'My study';
  assert.deepEqual(second.preferences[0].hiddenCalendarIds, []);
  assert.equal(second.categories[0].name, 'Study');
});
test('weekly distribution preserves whole-unit totals and selected days', () => {
  for (const target of [1,2,20,40,100]) {
    const plan = distribute(target); assert.equal(plan.reduce((a,b) => a+b,0), target);
    assert.ok(plan.every(Number.isInteger)); assert.ok(Math.max(...plan)-Math.min(...plan)<=1);
  }
  assert.deepEqual(distribute(2), [1,0,0,1,0,0,0]);
  assert.deepEqual(distribute(10,[0,2,4]), [4,0,3,0,3,0,0]);
});
test('Monday-based weeks cross calendar years correctly', () => {
  assert.equal(monday('2027-01-01'),'2026-12-28'); assert.equal(monday('2026-10-18'),'2026-10-12');
});
test('monthly recurrence keeps the original day through February', () => {
  const t = { dueDate:'2027-01-31', repeat:'monthly' as const, days:[], anchorDay:31 };
  assert.equal(nextDate(t),'2027-02-28'); assert.equal(nextDate({...t,dueDate:'2027-02-28'}),'2027-03-31');
  assert.equal(nextDate({...t,dueDate:'2028-01-31'}),'2028-02-29');
});
test('weekly recurrence follows chosen weekdays without skipping overdue dates', () => {
  assert.equal(nextDate({dueDate:'2026-10-12',repeat:'weekly',days:[0,2,4],anchorDay:12}),'2026-10-14');
  assert.equal(nextDate({dueDate:'2026-10-16',repeat:'weekly',days:[0,2,4],anchorDay:12}),'2026-10-19');
});
test('goal changes keep prior targets and distributions intact', () => {
  const data = seedData('2026-10-12'), goal = data.goals[0];
  data.versions.push({...data.versions[0],id:'later',week:'2026-10-19',target:30,plan:distribute(30)});
  assert.equal(planFor(goal,'2026-10-12',data)?.target,20);
  assert.equal(planFor(goal,'2026-10-26',data)?.target,30);
  assert.equal(planFor(goal,'2026-10-05',data),undefined);
});
test('overachievement counts fully and redistribution preserves earlier plans', () => {
  const data=seedData('2026-10-12'), plan=planFor(data.goals[0],'2026-10-12',data)!;
  data.logs.push({id:'x',goalId:plan.goalId,date:'2026-10-12',value:9,note:''});
  assert.equal(weekTotal(data,plan.goalId,plan.week),9);
  const result=redistribute(plan,data,1); assert.equal(result[0],plan.plan[0]); assert.equal(result.slice(1).reduce((a,b)=>a+b,0),11);
  data.logs[0].value=30; assert.equal(redistribute(plan,data,1).slice(1).reduce((a,b)=>a+b,0),0);
});
test('monthly totals use actual dates and completed weeks use Monday attribution', () => {
  const data=seedData('2026-09-28'), goal=data.goals[0];
  data.logs.push({id:'a',goalId:goal.id,date:'2026-10-01',value:25,note:''},{id:'b',goalId:goal.id,date:'2026-10-05',value:30,note:''});
  assert.deepEqual(monthStats(goal,'2026-10',data,'2026-10-12'),{total:55,completed:1,count:2});
});
