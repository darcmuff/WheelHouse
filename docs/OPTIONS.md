# Options positions (non-wheel)

Regular option positions live in their own Firestore collection, separate from wheel trades:

```
users/{uid}/optlegs/{legId}
```

The wheel collections (`wheels`, `trades`) are not changed. No migration is needed; existing data is untouched.

## Firestore rules (one-time, in the Firebase console)

There is no rules file in this repo. If your rules list collections explicitly, add `optlegs` next to `wheels` and `trades`:

```
match /users/{uid}/optlegs/{legId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

If you already have a wildcard rule like `match /users/{uid}/{document=**}`, nothing needs changing.
Until the rule exists, the Options tab shows a warning and the wheel app keeps working normally.

## Leg document

| field | type | notes |
|---|---|---|
| id, groupId | string | legs sharing `groupId` form one multi-leg position (spread, condor, roll chain) |
| underlying | string | e.g. `AAPL` |
| type | `C` / `P` | |
| side | `long` / `short` | |
| strike, qty | number | qty = contracts (×100 shares) |
| expiry, entryDate | `YYYY-MM-DD` | |
| entryPrice | number | premium per share |
| fees | number | opening fees |
| status | `open` / `closed` / `expired` / `assigned` | |
| closePrice, closeDate, closeFees | | set when closed |
| mark, markSrc, markAt | | `markSrc`: `cboe` (15-min delayed) or `manual` |
| iv, delta, theta | number / null | from Cboe, or computed locally (Black-Scholes) from IV or the mark |
| wheelId | string / null | optional attach-to-rotation; display only, never added to wheel P&L |
| rolledFrom, notes | | |

## Live marks

`netlify/functions/optchain.js` tries Cboe public delayed quotes first, then the Finnhub option chain with the existing `FINNHUB_KEY` (skipped silently if unauthorised or failing).
The browser can't call Cboe directly (no CORS header). If the proxy fails, manual marks are used and greeks are computed locally.

## Poor man's covered calls (short calls against a LEAP)

- **Sell call** on any open LEAP card opens a form (SmartScan paste or manual) for a sell-to-open call. SmartScan reuses `leapScan` via `pmccScan`, which accepts sold calls and refuses bought calls, closes and puts with a clear message.
- Stored in `optlegs` like any leg: `side:'short'`, `type:'C'`, own `groupId`, and `parentLeapId` = the LEAP's id. Rolls keep `parentLeapId` and set `rolledFrom`. If the LEAP itself is rolled, its shorts follow via the LEAP's `rolledFrom` chain.
- Never touches wheel trades or rotations; not in the Trade Log or wheel export. Included in the Options CSV export (`parentLeapId`, `rolledFrom` columns).
- Card strip: current short (strike, expiry, DTE, P&L from the live mark), premium collected (sum of realised on closed shorts + net credit on open ones, i.e. net of buybacks and fees), adjusted LEAP cost = LEAP cost − premium collected, collapsible history.
- Actions: Buy back (close), Roll (close + open new in one step, via the existing close/roll modal), Expired (worthless).
- Warnings: short strike < LEAP strike + net debit per share; short expiry after LEAP expiry; open short contracts > LEAP contracts.
- An orphaned short (its LEAP deleted) falls back to "Other options" and raises a data-health warning.
