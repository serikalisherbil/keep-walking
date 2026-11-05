# Keep Walking

English-language PWA for iPhone and Mac, open to verified Google accounts. React + TypeScript + Firebase Authentication, Firestore and Hosting. Each user has a separate private workspace, and Google Calendar access comes from that same signed-in user.

## Run locally

Node 24 or later is recommended. Dependencies and lockfile are included in this project.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5000/?demo=1` for the local interactive preview. Preview records are separate from Firebase records and stay in that browser. Real Google sign-in uses the deployed Hosting origin (or the authorized `localhost:5000` origin).

```sh
npm test
npm run build
```

## Publish to the existing Firebase project

Project: `keepwalk-2433b`. Primary Hosting URL: `https://keepwalking.web.app`. The original `https://keepwalk-2433b.web.app` is also served from the same build and database.

Initial version deployed on 2026-10-12. The live sign-in screen loads successfully. An unauthenticated Firestore read was rejected with HTTP 403 / PERMISSION_DENIED.

The Firebase CLI installed for this chat is at `../../work/firebase-cli/node_modules/.bin/firebase`, relative to this app directory. Sign in using that CLI, then deploy the static build:

```sh
../../work/firebase-cli/node_modules/.bin/firebase login
npm run build
../../work/firebase-cli/node_modules/.bin/firebase deploy --only hosting --project keepwalk-2433b
```

The rules in `firestore.rules` allow a verified Google session to access only `/users/{its-own-Firebase-UID}/...`. Other users and unauthenticated visitors cannot access that workspace. Deploy rule changes explicitly with `--only firestore:rules`; the multiuser release deploys `hosting,firestore:rules` together. Never replace these rules with test-mode, a shared user ID, or a blanket signed-in-user rule. No Cloud Functions, App Hosting, paid plan or billing account is required by this build. It uses Spark plan quotas; exhausting those can interrupt service.

The Firebase web configuration is public project identification, not an administrative credential. The per-user UID restriction must stay in Firestore Rules. The sign-in screen restriction alone is not a security boundary.

## Behavior

- New users start with Study, Work, Personal and Health, plus their own preferences. Tasks and minimums start empty. Existing workspaces, minimums and history are not reseeded or migrated.
- Tasks: custom spaces, optional dates/time, flags, subtasks, overdue tasks under Today. The last completed subtask completes the parent.
- Repeating tasks create the next occurrence on completion. A monthly task anchored on the 31st uses the last day in short months and returns to the 31st later. Past unfinished occurrences retain their dates.
- Google Calendar: explicit connection, all accessible calendars, visibility switches, create/edit/delete events, day/week/month views. Refresh on foreground, manually, and every minute while visible. Shared tasks reconcile Google changes into their task records; deletion of the Google event keeps the local task and disables its sharing. Completed tasks have no equivalent completion flag in Google Calendar.
- New exported recurring occurrences are shared while the app is open with an active Calendar connection. Short-lived Google access tokens persist on this device across tab/app restarts, bound to the authenticated user. Old session-only tokens migrate on the next authenticated load without extending expiry. The app uses a conservative 50-minute lifetime; reconnect when requested. Disconnect/sign-out removes the token. If browser storage is unavailable, access falls back to the current session. Firebase sign-in persists independently. No refresh tokens or Google client secret are shipped in the app.
- Minimums: quantity, minutes or daily check-off; weekly goals, daily plans, explicit redistribution, additions or daily totals, historical edits and monthly statistics. Future day cells edit the plan. Weeks start Monday.
- Each plan version takes effect from its Monday. Week-specific overrides preserve edits without changing recorded results. Editing an older week does not alter later plans unless explicitly repeated forward. Month totals use calendar dates; weekly success is attributed to the month of the week's Monday.
- iPhone: day view of Schedule, per-day minimum cards. Desktop: week view and a weekly minimum table. Automatic, light and dark themes. Blue gradients for To-do, pink-to-purple gradients for Schedule, and the original green minimums palette.
- Export a JSON backup under Settings. Import/restore is not implemented in this version.

## Current boundaries and remaining live checks

This is an online-first initial version. The service worker caches the application shell, not a complete offline database. Data mutations need a working network connection.

In-app reminders only run while the app is open and visible. Google Calendar handles closed-app reminders for Google events and shared tasks. Conditional evening push reminders when the app is closed require a background service and are not implemented. The settings screen states this limitation.

All 13 automated checks pass: weekly distribution, recurrence, date boundaries, historical targets, redistribution, monthly aggregation, and Calendar token persistence/expiry/migration/account isolation/storage fallback/disconnection. Local browser checks cover both themes, phone layout, logging and correcting progress, subtasks, recurring tasks, preserved overdue dates and time blocks. Live Google sign-in, owner Firestore reads/writes, and loading Google Calendar lists/events have been verified. The gradient/session update was deployed on 2026-10-12. After reloading the live app and opening it in a fresh browser tab, sign-in remained active and all 22 events in the visible week loaded without reconnecting Calendar. Responsive previews at 390px and 1280px passed in light/dark themes with no browser console errors. Two-device edits, Calendar create/edit/delete, and installed Safari PWA reconnection behavior still need verification. Preview results do not prove those integrations.

## Install after deployment

- iPhone: open the Hosting URL in Safari → Share → Add to Home Screen.
- Mac: Safari → File → Add to Dock.

Use the same Google account on both devices to see the same private workspace. This web app does not require weekly reinstallation.

## Multiuser release — 2026-11-06

Google sign-in accepts any verified Google account. Calendar authorization remains optional and uses the current user's email as its login hint; reauthentication prevents connecting a different person's account. Ordinary sign-in requests only the standard Google identity scopes.

The Cloud Console audience was verified as External / In production. Calendar's unapproved sensitive scopes currently have a lifetime cap of 100 users (1 used at the time of inspection). Public Calendar use without this limitation requires Google's OAuth verification; it has not been submitted or completed. This does not prevent the app's basic Google sign-in with standard identity scopes.

Validation: 14 domain/session tests and 5 Firestore emulator security tests passed. The latter exercise two mock Google users, all application collections, initialization that preserves existing records, cross-user reads/lists/creates/updates/deletes, unauthenticated/unverified/non-Google denial, and rejection of account enumeration. Tests use only `demo-keep-walking`, never production records. The dependency audit reports no known vulnerabilities after updating re2js.

To repeat the rules checks from this directory (Firebase CLI and Java required):

```sh
FIREBASE_EMULATORS_PATH=../../work/firebase-emulators ../../work/firebase-cli/node_modules/.bin/firebase emulators:exec --only firestore --project demo-keep-walking --config firebase.emulators.json 'npm run test:rules'
```

The owner reported a successful real second-account sign-in on 2026-11-06: the other user could sign in and did not see the owner’s tasks or minimums. Emulator tests separately verify database isolation.

Deployment completed on 2026-11-06: Hosting and Firestore Rules both released successfully. The production app loaded the existing account and records without console errors; the alternate Firebase Hosting domain showed the new public sign-in screen. The owner subsequently confirmed successful sign-in from a friend’s Google account, with a separate workspace.

## Short Hosting address — 2026-11-06

The additional Hosting site `keepwalking` belongs to the original Firebase project `keepwalk-2433b`. Both Hosting entries in `firebase.json` publish the same `dist` build. Run `firebase deploy --only hosting --project keepwalk-2433b` to update both sites. The original site remains available.

The new primary origin is `https://keepwalking.web.app`. Firebase Authentication authorizes `keepwalking.web.app`. The existing OAuth web client includes `https://keepwalking.web.app` as a JavaScript origin and `https://keepwalking.web.app/__/auth/handler` as a redirect URI. Google permissions, Firebase project ID, app ID, database, and per-user UID paths remain the same. The frontend uses its current Hosting origin as `authDomain` on both supported `.web.app` addresses, including mobile redirect flows.

Existing users sign in again with the same Google account on the new origin. Local sessions and service-worker caches belong to their individual origins. Installed Home Screen / Dock shortcuts need to be added from the new address. Source backup: `https://github.com/serikalisherbil/keep-walking` (private).

Validation of the short address on 2026-11-06: both Hosting releases completed; Google sign-in on keepwalking.web.app loaded the existing account with its six open tasks and seven weekly minimums/results. Connecting Calendar loaded seven calendars and 23 visible events without console errors. All 14 domain/session tests and the production build passed. Firestore data and access rules were not modified by this address change. iPhone installation and mobile redirect behavior on the new origin remain a device check.

## Money — 2026-11-06

The fourth tab is a manual KZT money tracker with an orange/gold light/dark palette, coloured account/category cards, emoji icons, spending charts and period trends. Real users start with no accounts, balances, debts or transactions. The interactive preview has fictional sample money records.

- Bank/cash accounts have editable names, icons, colours and opening balances. Opening balances are not income. Accounts can be archived when empty.
- Income, expenses and transfers record amount, date/time, account, category/source and note. Amounts are stored as integer tiyn. Edits reverse the old effect before applying the new one; voiding preserves a recoverable historical record. A correction that restores money to an archived pocket reopens it.
- Savings goals are separate pockets, excluded from Total balance. Funding/returning money is a transfer. Bought records an expense from the goal, keeps the purchase in history, and permits returning the remainder to an account.
- Debts support lent/borrowed money, existing debts already included in opening balances, due dates, partial repayment and history. Loan/repayment flows affect account balances and debt remaining, separately from income/expense totals.
- Start new period uses an explicit date/time, preserves balances/debts/savings, and copies the previous period's category limits. Date boundaries determine reports; edited historical transaction dates update the appropriate period. The initial start date is editable before a second period is created.
- Regular payments support daily/weekly/monthly schedules, pausing and due status. An expense is written only after Mark paid. Deterministic occurrence IDs prevent duplicate payments. Reminders run while Money is open when in-app reminders are enabled; no background/closed-app push service has been added.
- Search/filter by period, type and account; show/restore voided transactions; export the filtered list to CSV for spreadsheet apps. CSV text is quoted and protected against formula injection. Global Settings JSON export includes money records too; import/restore is still not implemented.

Storage uses per-user collections moneyAccounts, moneyCategories, moneyEntries, moneyDebts, moneyPeriods, moneyRecurring and moneyMeta, under the existing users/{UID} path. No bank credentials or financial data are sent to Google Calendar. Existing owner/admin access in the Firebase Console still applies; records are not end-to-end encrypted.

Money mutations use client Firestore transactions reading current referenced account, debt, entry and period documents. Concurrent-device writes retry against current balances. There is no single growing ledger document: records live in separate documents. The initial version loads the user's records into realtime subscriptions for reporting.

Implementation: src/money.ts (types and pure reducer), src/money-service.ts (atomic persistence), src/MoneyView.tsx (UI), src/money.css (responsive themes), src/money-preview.ts (fictional preview only). The existing account-isolation rules already cover these private collections; no rules change is needed.

Validation: 27 domain/session/money tests plus 7 Firestore emulator tests, including cross-user denial on every money collection, simultaneous expenses, competing excessive repayments and competing purchases from a single goal. Browser preview checks include creating a zero-balance account, expense edit/void, goal funding/purchase/remainder return, partial debt repayment, paid regular payment, manual period rollover with copied budgets, same-minute period boundaries, category customization, archival, reload persistence and CSV download. 390px light/dark layouts were checked for overflow and usable forms.

Debt details can be edited without overwriting balances or repayments. Correcting an existing opening debt adjusts its remaining amount while preserving the amount already repaid; a loan recorded with a cash flow must be corrected through its original transaction.

Deployment completed on 2026-11-06 to both Hosting sites. The final live build at keepwalking.web.app loaded the existing signed-in workspace with its six tasks and seven weekly goals, the Money tab with zero accounts/balances, and the eight expense categories plus five income sources. No browser console errors were recorded. No sample financial accounts or transactions were added to production. Real simultaneous edits from an iPhone and Mac remain a device check; concurrency was verified in the Firestore emulator.
