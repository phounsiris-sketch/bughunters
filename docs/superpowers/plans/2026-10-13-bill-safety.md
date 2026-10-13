# Plan: bill safety (v69)
1. `js/sessions.js`: `_keepPaidMarks`, `_billPreview`, `saveSessionCosts` uses both; `setTransferSettled` confirm; `settleTransfers` field-path update.
2. `js/app.js`: modal Save label restored on close. i18n (en + la), CSS. 3. Checks: `node --check`; test of `_keepPaidMarks` and `settleTransfers` (`/tmp/bill_test.js` style). 4. Branch only, stacked on v68.
