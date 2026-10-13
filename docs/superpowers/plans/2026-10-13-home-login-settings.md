# Plan: Home + sign-in + sign-out confirm (v63)

1. `js/i18n.js`: first-run language Lao; new `home*`, `navHome`, `confirmSignOut`, `showPw/hidePw`, `loginInviteHint` keys (en + la; Lao is unreviewed).
2. `index.html`: viewport; `page-home`; center nav opens Home; password Show/Hide; invite hint; `js/home.js` script.
3. `js/auth.js` `togglePw()`; `js/groups.js` pending invite; `js/settings.js` sign-out confirm.
4. `js/router.js`: `home` page, `GROUP_PAGES`, nav highlight, landing page; `js/app.js` refresh + v63; `sw.js` v63 + `home.js` precache.
5. `js/home.js` + CSS.
6. Checks: `node --check` all JS; stub test of the card builders (`/tmp/home_test.js` style); every `t("...")` key in home.js exists in en and la.
7. Release: branch only; merge on the owner's OK.
