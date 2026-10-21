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
