# Security notes

## Firestore rules
- `firestore.rules` in this repo is the source of truth.
- **Checked 1 Nov 2026:** the LIVE rules (published 7 Jul 2026) matched the repo file exactly: owner-only under `users/{uid}/**`, everything else denied.
- Since then the repo adds `entitlements/{uid}` (owner can read, nobody can write from the app). **Deploy it before turning payments on** (SETUP.md step 3).
- Proof: `cd rules-test && npm install && npm test` runs the rules on a local emulator (needs Java 11+). It checks that users can't read or write each other's data and that nobody can give themselves Pro.

## Functions
- All price functions only answer our own sites (`netlify/lib/origin.js`). Add the custom domain with the `ALLOWED_ORIGINS` env var.
- `checkout` / `billing-portal` also require a valid Firebase sign-in token.
- `stripe-webhook` is called by Stripe, so it isn't origin-locked; every call must carry a valid Stripe signature.
- Secrets live only in Netlify env vars, never in the repo or the app.
