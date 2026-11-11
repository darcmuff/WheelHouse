# NOTES.md — OpTrack (repo WheelHouse)

Read NOTES.md first at start of future jobs; keep current; dev only until Marc explicitly approves main.

Notes written 2026-11-08, updated 2026-11-09. No earlier NOTES.md. This is the product source for OpTrack (formerly WheelHouse), the options-wheel tracker (wheels, LEAPs/PMCC, P&L). Live site: https://optrack.app. App shell is `app/`. Go-live checklist is SETUP.md. Payments live in `netlify/functions/` (`checkout.js`, `stripe-webhook.js`). Tests are plain Node under `tests/` (they extract functions from `app/index.html`). Service-worker cache on this branch is `optrack-v188` (`app/sw.js`).

## Current state (checked in git on 2026-11-09)

- `main` matches `dev` after the 2026-11-09 merge Marc requested. It includes the quiet service-worker refresh (sw v158), the Captured mark fix (sw v159) and the password show/hide (sw v160).
- `dev` through `d2d29d7` (2026-11-06, sw v158): a new service worker shows "New version — Refresh when you're ready" instead of auto-reload. Refresh reloads only when tapped (`app/index.html`, `tests/authboot.test.js`).
- `dev` then fixes open-leg Captured (sw v159). The buy-back is the Cboe quote for that exact OCC contract, brought forward to the live stock with that quote's delta and gamma. It is not clamped to 15% of the delayed premium, and a spot gap over 4% is not a reason to keep the old mid. If the quote is not a two-sided market, the greek has the wrong sign, or the spot gap is over 12%, Captured and the card Profit say "no quote" instead of a stale number. Outside the regular session the mid is shown unadjusted, because the option spot and the stock price are not the same moment. Contract matching is exact on expiry, call/put and strike (SPX may use the SPXW root; a shorter prefix such as F vs FCX must not match).
- `dev` adds a show/hide control on the password fields (sw v160). Sign in and create account share `#auth-password`. Delete account uses `#delete-password`, shown only for a password login. Landing and `/start` have no password field; they link to the app.
- `dev` moves wheel-card and open LEAP-card Add trade above the trade rows (sw v161). `main` is still the v160 merge until Marc asks again.
- `dev` enlarges the signed-in top-bar wordmark and shows a Pro badge under the end of “Track” only for an entitlement with `plan: pro` or `founder` (sw v162). Free accounts and the demo do not show it. A failed entitlement read still unlocks features but does not show the badge. The wordmark is Nunito Black (weight 900), skewed −9° so the letters lean right, at the 1.5rem size (sw v178). The Pro badge stays upright under the end of Track. The same wordmark is on the landing, start and sign-in headers. The font file is `app/nunito-900.woff2` (latin, weight 900 only).
- `dev` insets the wheel and LEAP Add trade buttons to the table padding and fills them orange (sw v163).
- `dev` replaces the Wheel-tab ticker box with a New wheel button that becomes a white “Ticker or company” field and looks up symbols through `/.netlify/functions/symbol` (Finnhub search, sw v164). A plain ticker still creates the wheel if the lookup fails. Free caps stay on `quickAddRotation`.
- `dev` no longer suggests or auto-links rolls (sw v171). A close and an open stay separate. Saved `rollId` and `rolledFrom` values still show. The Wheel and LEAPs tabs have a one-time tip and a Select button so you can total any trades. The landing page leads with that.
- `dev` keeps a manual Mark as roll checkbox, off by default, on Add trade, the paste form, and the SmartScan review (sw v172). Tick it to choose which trade on that wheel or LEAP it rolls from, or, for a two-leg confirmation, to link those two legs. Nothing is chosen for you.
- `dev` sizes the trade table from the text in each column, so a large PPD such as $1,001.84/d cannot run into Captured, and the spare width is shared across the data columns. Edit stays only as wide as the button, at the right (sw v181).
- `dev` drops the Activity toolbar New rotation button. The CSV buttons stay. New wheel on the Wheel tab is unchanged (sw v182).
- `dev` puts Marc’s line under the landing hero headline: “There’s no such thing as a roll, grow up!” The calmer headline stays above it (sw v183).
- `dev` lets Activity filter by cash-secured puts, covered calls, and LEAPs (and Other, when a trade is none of those). The total is the same cash-in minus cash-out sum as the select card, fees already inside each trade total (sw v184).
- `dev` draws To strike, the Captured buy-back price, and the PPD day count in the same size and dark colour as the other trade-table figures (sw v185). On a desktop every trade-table column shares the spare width, so the left side is not packed and the right side is not stretched (sw v188). A closed cash-secured put shows the price it was bought back at, full size and dark, next to the kept percent (`16% · at $2.10`).
- `dev` lets you long-press a trade row on a phone or tablet, or right-click it, to select it (sw v186). A mouse hold does not select. A trackpad two-finger click is a right-click and selects. Ctrl-click still works. The desktop tip says “Right-click to select trades” and hides for good once you select a trade or dismiss it. The Select button next to Add trade is gone.
- `dev` shows a selected-trade summary in a floating card, not a bottom bar (sw v173). It lists the net, collected, paid, fees, a per-ticker split, contracts, and each selected trade. A click outside the rows and the card, Escape, or the close mark clears the selection. The card is fixed and does not narrow the page (sw v174).
- `dev` refreshes open LEAP and option marks on login and on the same minute timer as wheel quotes, and saves the new price and date (sw v168). A quote that cannot be fetched stays off Home and shows on the LEAP card. Every Needs you / Data Health row explains what is wrong, why, and how to fix it, and can be dismissed until that issue changes.
- `dev` turns the New wheel pill into the text field in the same spot (sw v169). Suggestions are US stocks and ETFs only. A built-in list of the most traded names (Tesla first for “t” and “tes”) shows at once, then Finnhub fills in underneath.
- `app/brand.js`: `supportEmail` is still `''`. `plans.gating` is `true` (free caps: 2 open wheel tickers, 1 open LEAP). Prices in brand config are £9 monthly / £79 yearly.
- `app/legal.html` still shows the DRAFT banner (for Marc to read and approve; not lawyer-reviewed). The page says last updated 1 November 2026.
- Stripe code refuses live secret keys unless `STRIPE_ALLOW_LIVE=1` (`netlify/lib/stripe.js`). A 2026-11-06 working note said Stripe was live then. The Stripe dashboard, webhook, and Netlify env are external; this file does not assert them.
- Founder Pro (never downgraded) is a Firestore `entitlements/{uid}` write via `tools/grant-founder.js` (see SETUP.md). Not confirmed from git. Do not put UIDs or keys in this file.
- In-repo cookie-free analytics stays off (`analytics.provider` is `''` in `app/brand.js`). A 2026-11-07 working note said app tracking and Netlify Analytics were disabled then. The Netlify toggle is not in git; do not assert it from the repo.
- Other remote branches exist (`onboarding`, `overhaul`, `skunkworks`). This notes commit does not touch them.

## What's next

Source-backed only. Not a new roadmap.

- SETUP.md is still open in code: set `supportEmail` (landing, legal, and settings read it); Marc approves legal and the DRAFT banner comes off; the founder grant is an operator step before treating Pro as applied.
- SETUP.md §3–4 (publish `firestore.rules`, Firebase service account in Netlify) are operator steps. Do not assume they are done.
- `tests/README.md` lists parser edge cases as not yet fixed: a paste dated today can be classed as past and steal the `entered` slot; "Jul 10 Put" (date before type) is blocked by the rx2b lookahead. Robinhood type-before-date is unaffected.
- `tests/README.md` still says `datahealth.test.js` is "to be ported", but that file exists and describes a ported `runDataHealth` suite. Treat the README line as stale unless a later check shows otherwise.

## Working agreement

Land work on `dev`. Do not merge `main` until Marc explicitly approves. No secrets or customer details in this file. The simulation snapshot is a different repo (`darcmuff/wheelhouse-sim`); do not treat it as this tree.
