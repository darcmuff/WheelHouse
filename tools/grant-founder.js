// Make accounts founders: Pro forever, free, never downgraded by billing.
// Usage (on your own computer, with the service-account JSON):
//   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" node tools/grant-founder.js <uid> [<uid> ...]
// Find a uid in Firebase console → Authentication → Users (the "User UID" column).
const { setEntitlement } = require('../netlify/lib/fbadmin');
(async () => {
  const uids = process.argv.slice(2);
  if (!uids.length) { console.error('Give at least one uid.'); process.exit(1); }
  for (const uid of uids) { await setEntitlement(uid, { plan: 'pro', founder: true, status: 'founder', source: 'founder' }); console.log('Founder:', uid); }
})().catch(e => { console.error(e.message); process.exit(1); });
