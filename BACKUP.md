# Restoring Keep Walking

GitHub backup: https://github.com/serikalisherbil/keep-walking (private).
Primary site: https://keepwalking.web.app

This repository contains the complete application source, icons, dependency lockfile,
Firebase Hosting configuration, Firestore access rules, and tests.
User records live separately in Cloud Firestore; Google Calendar events remain in
Google Calendar. A source backup does not include those records or Google credentials.

## Run from a fresh copy

Install Node.js 24 or later, then run in this directory:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:5000/?demo=1` to use the local preview.
The original Firebase project is `keepwalk-2433b`; its public web configuration
is included in `src/services.ts`. No Firebase administrator key or OAuth client
secret is needed to build the frontend.

## Publish from another computer

Sign in using a Google account with deployment rights to the existing Firebase
project, then deploy the build:

```sh
npx --package firebase-tools@15.33.0 firebase login
npm run build
npx --package firebase-tools@15.33.0 firebase deploy --only hosting --project keepwalk-2433b
```

The Hosting configuration publishes to both `keepwalking` (the primary address) and `keepwalk-2433b` (the original address), in the same Firebase project.

Deploy `firestore:rules` separately when intentionally changing access rules.
The existing project must remain available; source files do not recreate its
stored user data, OAuth settings, or administrator permissions.

## Save later source changes

After a GitHub remote has been created and connected, commit and push reviewed
changes to keep the remote backup current. Uploading the initial version does
not automatically back up later local edits or changes made only in Firebase
Console.

Do not commit login tokens, service-account keys, `.env` secrets, local database
exports, or users' backups. The ignored `node_modules`, `dist`, and `.firebase`
directories are generated files and can be recreated.

## Money data

The source backup includes the Money UI, calculation engine, transaction service and tests. Bank balances are entered manually; no bank account is connected. Actual Money records live in the existing per-user Firestore collections, not in GitHub. Use the app's Settings JSON export for a snapshot of loaded tasks, minimums and Money records, or Money → Transactions → Export CSV for a spreadsheet view.
