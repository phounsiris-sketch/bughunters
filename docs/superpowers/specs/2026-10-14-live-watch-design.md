# Live score watch (v91)
Goal: an iPad (or any group member's device) shows the running live score full screen, landscape, in real time. Host phone writes `liveGames/{uid}`; members read. No change to how counting works. Rule added to firestore.rules (publish by hand). Test: /tmp/watch_test.js (debounce, practice not shared, unshare, banner, watch render).
