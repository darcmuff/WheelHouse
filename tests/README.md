# WheelHouse regression tests

Automated checks that confirm past fixes still work after new changes.
No frameworks, no installs — plain Node.

## Run

```
node tests/smartscan.test.js
```

Exit code 0 = all pass. Any FAIL line prints what it got vs what it wanted.

## How it works

Tests do **not** contain copies of app code. `extract.js` reads
`app/index.html`, pulls the named functions out of the live source, and the
scenarios run against that. Edit the app and the tests automatically test the
new code — they can never silently go stale.

Scenario dates are computed relative to today at runtime (e.g. "expiry = 10
days from now"), so the suite keeps passing regardless of when it's run.

## Suites

| File | Covers | Scenarios |
|---|---|---|
| `smartscan.test.js` | `parseSmartText` date/quantity parsing: rx2b month-first fix, rx1 phantom-date lookbehind fix, all broker date formats | 11 |
| `datahealth.test.js` | `runDataHealth` lifecycle scenarios — **to be ported in the `openOptionLegs` session** | (30 planned) |

## Known parser edge cases (documented, not yet fixed)

- Pastes made **on** expiry day: a date equal to today classifies as past,
  which can steal the `entered` slot (strict `d>today` in the classifier).
- Date-before-type phrasing ("Jul 10 Put"): rx2b's lookahead blocks the
  singular put/call word. Robinhood formats type-before-date, so unaffected.
