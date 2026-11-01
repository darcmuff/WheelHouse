# Going live: what Marc needs to do

Everything in the code is ready, and nothing below costs anything until you choose a plan.
Do the steps in order. Each one says where to click. Where it says "Netlify env", that means:
Netlify → your site → **Site configuration → Environment variables → Add a variable**.
After changing env vars, redeploy: **Deploys → Trigger deploy → Deploy site**.

---

## 1. Support email
1. Pick an address people can write to (for example `support@optrack.app` once you own the domain, or a Gmail for now).
2. Tell Grok Bot the address. It goes in `app/brand.js` → `supportEmail`, and appears on the landing page, legal page and Settings.

## 2. Read and approve the legal page
1. Open `/legal.html` on the dev site and read all three parts.
2. Tell Grok Bot what to change. When you're happy, the "DRAFT" banner comes off.

## 3. Put the new Firestore rules live (2 minutes)
1. Firebase console → project **wheelhouse-61982** → **Firestore Database → Rules**.
2. Replace everything with the contents of `firestore.rules` from this repo and click **Publish**.
   (It's the same as now plus one block for `entitlements`, which lets the app read your plan but never change it.)

## 4. Firebase service account (lets the server record who has paid)
1. Firebase console → ⚙ **Project settings → Service accounts → Generate new private key**. A `.json` file downloads.
2. Netlify env: name `FIREBASE_SERVICE_ACCOUNT`, value = the whole contents of that file (paste it all). Mark it **secret**.
3. Delete the downloaded file from your computer afterwards. Never email it or put it in GitHub.

## 5. Make you and your brother founders (free Pro for life). Do this BEFORE step 9
1. Firebase console → **Authentication → Users**. Copy the **User UID** for your account and your brother's.
2. Send both UIDs to Grok Bot. It runs `node tools/grant-founder.js <uid> <uid>` with the key from step 4,
   or you can run it yourself with: `FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node tools/grant-founder.js UID1 UID2`
3. Founders can never be downgraded by billing. Even if anything goes wrong reading your plan, the app lets you in.

## 6. Stripe (start in TEST mode, nothing real is charged)
1. Sign up at stripe.com (business type: individual / sole trader, UK).
2. Keep the **Test mode** switch ON (top right).
3. **Product catalogue → Add product**: name "OpTrack Pro". Add two prices: **£9 monthly** (recurring) and **£79 yearly** (recurring).
   Copy each price's ID (starts `price_`).
4. **Developers → API keys**: copy the **Secret key** (starts `sk_test_`).
5. **Settings → Billing → Customer portal**: turn it on; allow cancel and switch plan.
6. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your site>/.netlify/functions/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - After saving, copy the **Signing secret** (starts `whsec_`).
7. Netlify env (all secret):
   - `STRIPE_SECRET_KEY` = sk_test_…
   - `STRIPE_PRICE_MONTHLY` = price_… (the £9 one)
   - `STRIPE_PRICE_YEARLY` = price_… (the £79 one)
   - `STRIPE_WEBHOOK_SECRET` = whsec_…
8. Test: with gating on (step 9) on the dev site, use card `4242 4242 4242 4242`, any future date, any CVC.
9. Going real later: repeat 3–7 with Test mode OFF, and add `STRIPE_ALLOW_LIVE` = `1`. The code refuses live keys without it, as a safety catch.

## 7. Domain (when the name's final; candidates optrack.app / getoptrack.com)
1. Buy it (Netlify → **Domains → Add or register a domain** is simplest, or Namecheap/Cloudflare).
2. Netlify → your site → **Domain management → Add a domain**, then follow its DNS instructions (Netlify DNS does it automatically). HTTPS turns on by itself.
3. Firebase console → **Authentication → Settings → Authorised domains → Add domain** (needed for Google sign-in).
4. Netlify env: `ALLOWED_ORIGINS` = `https://optrack.app,https://www.optrack.app` (your domain), so the price feeds answer it.
5. Tell Grok Bot the domain so it updates `siteUrl` in brand.js. The old `wheelhouse-tracker.netlify.app` address keeps working.
6. Stripe webhook: update its URL to the new domain.

## 8. Analytics (optional, cookie-free, no banner needed)
Pick one:
- **Plausible** (paid, about £7/month): sign up at plausible.io, add your domain, then tell Grok Bot. It sets `analytics: { provider: 'plausible', domain: 'optrack.app' }`.
- **GoatCounter** (free for personal use): sign up at goatcounter.com, choose a code (e.g. `optrack`), then tell Grok Bot. It sets `provider: 'goatcounter', goatcounter: 'https://optrack.goatcounter.com/count'`.

## 9. Turn on Free/Pro
1. Check steps 3–6 are done and that you two show as founders (Settings shows "Plan: Pro (founder)" once gating is on).
2. In `app/brand.js` set `plans.gating: true` (Grok Bot can do it). Try it on dev first.
3. To change what's free or paid, edit `plans.paidFeatures` and `plans.free` in brand.js. Prices are `priceMonthly` / `priceYearly` there (and in Stripe).
