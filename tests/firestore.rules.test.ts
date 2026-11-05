import { commitMoney } from '../src/money-service';
import { entryDraft } from '../src/money';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, setLogLevel } from 'firebase/firestore';
import { collections, newUserData } from '../src/domain';

// Mock accounts and data stay inside the emulator, never the production project.
let environment: RulesTestEnvironment;
const claims = (email: string, verified = true, provider = 'google.com') => ({
  email, email_verified: verified, firebase: { sign_in_provider: provider, identities: { email: [email] } },
});
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run this test with Firebase emulators:exec.');
  setLogLevel('silent');
  environment = await initializeTestEnvironment({
    projectId: 'demo-keep-walking',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await environment?.cleanup(); });

test('two different Google accounts can use every collection in their own workspace', async () => {
  for (const user of ['alice', 'bob']) {
    const db = environment.authenticatedContext(user, claims(`${user}@example.com`)).firestore();
    for (const name of collections) {
      const ref = doc(db, 'users', user, name, 'own-record');
      await assertSucceeds(setDoc(ref, { title: `${user} only` }));
      const saved = await assertSucceeds(getDoc(ref));
      assert.equal(saved.data()?.title, `${user} only`);
      await assertSucceeds(getDocs(collection(db, 'users', user, name)));
      await assertSucceeds(updateDoc(ref, { title: 'updated' }));
      await assertSucceeds(deleteDoc(ref));
    }
  }
});
test('new-account initialization is idempotent and preserves existing plans', async () => {
  const db = environment.authenticatedContext('new-person', claims('new@example.com')).firestore();
  const initialize = () => runTransaction(db, async transaction => {
    if ((await transaction.get(doc(db, 'users', 'new-person', 'preferences', 'app'))).exists()) return;
    const data = newUserData();
    for (const name of collections) for (const row of data[name]) transaction.set(doc(db, 'users', 'new-person', name, row.id), row);
  });
  await assertSucceeds(initialize());
  assert.equal((await getDocs(collection(db, 'users', 'new-person', 'goals'))).size, 0);
  const plan = doc(db, 'users', 'new-person', 'plans', 'my-plan');
  await setDoc(plan, { target: 25 });
  await assertSucceeds(initialize());
  assert.equal((await getDoc(plan)).data()?.target, 25);
});
test('accounts cannot read, list, create, overwrite, or delete another workspace', async () => {
  const alice = environment.authenticatedContext('alice', claims('alice@example.com')).firestore();
  const bob = environment.authenticatedContext('bob', claims('bob@example.com')).firestore();
  for (const name of collections) {
    await setDoc(doc(alice, 'users', 'alice', name, 'private'), { uid: 'alice', value: 'private' });
    const foreign = doc(bob, 'users', 'alice', name, 'private');
    await assertFails(getDoc(foreign));
    await assertFails(getDocs(collection(bob, 'users', 'alice', name)));
    await assertFails(setDoc(foreign, { uid: 'bob', value: 'overwrite' }));
    await assertFails(updateDoc(foreign, { uid: 'bob' }));
    await assertFails(deleteDoc(foreign));
    await assertFails(setDoc(doc(bob, 'users', 'alice', name, 'injected'), { uid: 'bob' }));
    assert.equal((await getDoc(doc(alice, 'users', 'alice', name, 'private'))).data()?.value, 'private');
  }
});
test('unauthenticated, unverified, and non-Google sessions are denied', async () => {
  const contexts = [
    environment.unauthenticatedContext(),
    environment.authenticatedContext('invalid', claims('unverified@example.com', false)),
    environment.authenticatedContext('invalid', claims('password@example.com', true, 'password')),
    environment.authenticatedContext('invalid', claims('anonymous@example.com', true, 'anonymous')),
  ];
  for (const context of contexts) {
    const db = context.firestore();
    for (const path of ['users/invalid/tasks/example', 'users/alice/tasks/private']) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { title: 'not allowed' }));
    }
  }
});
test('users cannot enumerate all accounts or all users’ tasks', async () => {
  const db = environment.authenticatedContext('alice', claims('alice@example.com')).firestore();
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDocs(collectionGroup(db, 'tasks')));
  await assertFails(getDoc(doc(db, 'users', 'bob')));
  await assertFails(setDoc(doc(db, 'shared', 'public'), { data: 'no public collection' }));
});

test('concurrent money writes preserve both expenses and reject a second excessive debt repayment', async () => {
  const first = environment.authenticatedContext('finance-user', claims('finance@example.com')).firestore();
  const second = environment.authenticatedContext('finance-user', claims('finance@example.com')).firestore();
  await commitMoney(first as any, 'finance-user', {kind:'init',at:Date.now()});
  await commitMoney(first as any, 'finance-user', {kind:'account',row:{id:'bank',name:'Bank',kind:'account',icon:'💳',color:'#fff',opening:100000,balance:0,target:0,archived:false}});
  await Promise.all([commitMoney(first as any,'finance-user',{kind:'entry',row:{...entryDraft(),id:'expense-a',amount:1019,from:'bank',categoryId:'expense-food'}}),commitMoney(second as any,'finance-user',{kind:'entry',row:{...entryDraft(),id:'expense-b',amount:2011,from:'bank',categoryId:'expense-food'}})]);
  assert.equal((await getDoc(doc(first,'users','finance-user','moneyAccounts','bank'))).data()?.balance,96970);
  await commitMoney(first as any,'finance-user',{kind:'entry',newDebt:{id:'loan',person:'Friend',direction:'lent',principal:10000,remaining:10000,accountId:'bank',due:'',note:''},row:{...entryDraft('loan'),id:'loan-entry',amount:10000,from:'bank',debtId:'loan'}});
  const results = await Promise.allSettled([commitMoney(first as any,'finance-user',{kind:'entry',row:{...entryDraft('repayment'),id:'payment-a',amount:7000,from:'bank',debtId:'loan'}}),commitMoney(second as any,'finance-user',{kind:'entry',row:{...entryDraft('repayment'),id:'payment-b',amount:7000,from:'bank',debtId:'loan'}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDoc(doc(first,'users','finance-user','moneyDebts','loan'))).data()?.remaining,3000);
  assert.equal((await getDoc(doc(first,'users','finance-user','moneyAccounts','bank'))).data()?.balance,93970);
  await commitMoney(first as any,'finance-user',{kind:'debt-details',id:'loan',person:'Friend renamed',due:'2026-12-01',note:'Updated details'});
  assert.equal((await getDoc(doc(first,'users','finance-user','moneyDebts','loan'))).data()?.remaining,3000);
});

test('two devices cannot post two different purchases from the same savings goal', async () => {
  const first=environment.authenticatedContext('goal-user',claims('goal@example.com')).firestore();
  const second=environment.authenticatedContext('goal-user',claims('goal@example.com')).firestore();
  await commitMoney(first as any,'goal-user',{kind:'account',row:{id:'bank',name:'Bank',kind:'account',icon:'💳',color:'#fff',opening:100000,balance:0,target:0,archived:false}});
  await commitMoney(first as any,'goal-user',{kind:'account',row:{id:'skates',name:'Skates',kind:'goal',icon:'⛸️',color:'#fff',opening:0,balance:0,target:100000,archived:false}});
  await commitMoney(first as any,'goal-user',{kind:'entry',row:{...entryDraft('transfer'),id:'fund',amount:100000,from:'bank',to:'skates'}});
  const results=await Promise.allSettled([commitMoney(first as any,'goal-user',{kind:'entry',row:{...entryDraft(),id:'buy-a',amount:40000,from:'skates',categoryId:'expense-shopping',purchase:true}}),commitMoney(second as any,'goal-user',{kind:'entry',row:{...entryDraft(),id:'buy-b',amount:40000,from:'skates',categoryId:'expense-shopping',purchase:true}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDoc(doc(first,'users','goal-user','moneyAccounts','skates'))).data()?.balance,60000);
  assert.equal((await getDocs(collection(first,'users','goal-user','moneyEntries'))).docs.filter(d=>d.data().purchase).length,1);
});
