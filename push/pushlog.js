/* v274: the in-app push log. One doc per push sent to a user, written by the sender (admin SDK) at
   userPrivate/{uid}/pushLog/{autoId}. Pure helpers, no Firebase here (tests load this file). */

/** What kind of push this is, from the link the sender already puts on it */
function pushKind(link) {
  const h = String(link || "").replace(/^[^#]*/, "");
  if (/^#session=/.test(h)) return "session";
  if (h === "#payments") return "payment";
  if (h === "#polls") return "poll";
  if (h === "#public") return "game";
  if (h === "#buddies") return "invite";
  if (h === "#settings" || /^#group=/.test(h)) return "group";
  return "other";
}

/** The doc to store. `at` and `expireAt` come from the caller (server timestamp / Timestamp) so this stays pure.
    res = { successCount, failureCount, firstError } for the devices of that user. */
function pushLogDoc(m, res, at, expireAt) {
  const link = String(m.link || "").replace(/^[^#]*/, "").slice(0, 120);
  const ok = res.successCount > 0;
  return {
    at, expireAt, kind: pushKind(m.link),
    title: String(m.title || "").slice(0, 160), body: String(m.body || "").slice(0, 400),
    link, ok, err: ok ? "" : String(res.firstError || "failed").slice(0, 80)
  };
}

module.exports = { pushKind, pushLogDoc };
