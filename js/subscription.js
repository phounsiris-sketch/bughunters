/* ============================================================
   subscription.js — MOCK subscription step after registration
   A new account is asked to choose a plan and pay before the app opens.
   This is a demo: nothing is charged, "Pay" just marks the account as
   paid on this phone (localStorage) and opens the app. Replace payMock()
   with a real payment provider later.
   Depends on: auth.js (currentUser, _enterApp), i18n.js, icons.js
   ============================================================ */

var SUB_PLANS = [
  { id: "month", price: 30000, per: "subPerMonth" },
  { id: "year", price: 300000, per: "subPerYear", best: true }
];
var subPick = "year";
var subMethod = "onepay";

function _subKey(kind, uid) { return "godsmash_" + kind + "_" + uid; }
function _subGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function _subSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

/** New accounts must go through the paywall once */
function subMarkNeeded(uid) { if (uid) _subSet(_subKey("needsub", uid), "1"); }
function subNeeded(uid) { return !!uid && _subGet(_subKey("needsub", uid)) === "1"; }
function subActive(uid) { return !!uid && !!_subGet(_subKey("sub", uid)); }

/** Show the paywall instead of the app when this account still has to subscribe. true = shown */
function subGate() {
  if (!currentUser || !subNeeded(currentUser.uid)) return false;
  showPaywall();
  return true;
}

function showPaywall() {
  ["login-page", "profile-page", "verify-page"].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = "none"; });
  var box = document.getElementById("sub-page");
  if (!box) return;
  box.style.display = "block";
  var authC = document.getElementById("auth-container"), appC = document.getElementById("app-container");
  if (authC) authC.style.display = "";
  if (appC) appC.style.display = "none";
  if (typeof hideSplash === "function") hideSplash();
  renderPaywall();
}

function subSetPlan(id) { subPick = id; renderPaywall(); }
function subSetMethod(id) { subMethod = id; renderPaywall(); }

function renderPaywall() {
  var box = document.getElementById("sub-page");
  if (!box) return;
  var plan = SUB_PLANS.filter(function (p) { return p.id === subPick; })[0] || SUB_PLANS[0];
  var feats = [["vote", "subF1"], ["scoreboard", "subF2"], ["ranking", "subF3"], ["wallet", "subF4"], ["globe", "subF5"]];
  var html = '<div class="sub-hero"><div class="sub-logo">' + icon("medal", 34) + '</div><h2>' + t("subTitle") + '</h2><p>' + t("subSub") + '</p></div>';
  html += '<div class="sub-plans">' + SUB_PLANS.map(function (p) {
    var on = p.id === subPick;
    return '<button type="button" class="sub-plan' + (on ? ' on' : '') + '" onclick="subSetPlan(\'' + p.id + '\')">' + (p.best ? '<span class="sub-best">' + t("subBest") + '</span>' : '') +
      '<b>' + t(p.id === "month" ? "subMonthly" : "subYearly") + '</b><span class="sub-price">' + fmtShort(p.price) + ' ₭</span><small>' + t(p.per) + '</small>' +
      '<span class="sub-radio' + (on ? ' on' : '') + '">' + (on ? icon("check", 14) : '') + '</span></button>';
  }).join("") + '</div>';
  html += '<div class="sub-feats">' + feats.map(function (f) { return '<div>' + icon(f[0], 18) + '<span>' + t(f[1]) + '</span></div>'; }).join("") + '</div>';
  html += '<div class="sub-methods">' + [["onepay", "wallet", "subOnePay"], ["card", "card", "subCard"], ["bank", "bill", "subBank"]].map(function (m) {
    return '<button type="button" class="sub-method' + (subMethod === m[0] ? ' on' : '') + '" onclick="subSetMethod(\'' + m[0] + '\')">' + icon(m[1], 20) + '<span>' + t(m[2]) + '</span></button>';
  }).join("") + '</div>';
  html += '<button class="btn-primary" onclick="subPayMock()">' + icon("check", 18) + ' ' + t("subPay").replace("{price}", fmtShort(plan.price) + ' ₭') + '</button>';
  html += '<div class="sub-demo">' + icon("warning", 14) + ' ' + t("subDemo") + '</div>';
  html += '<button class="link-btn" onclick="logoutUser()">' + t("useAnotherAccount") + '</button>';
  box.innerHTML = html;
}

/** MOCK payment: no money moves. Marks this account as subscribed and opens the app. */
function subPayMock() {
  if (!currentUser) return;
  _subSet(_subKey("sub", currentUser.uid), JSON.stringify({ plan: subPick, method: subMethod, paidAt: Date.now(), mock: true }));
  _subSet(_subKey("needsub", currentUser.uid), null);
  var box = document.getElementById("sub-page");
  if (box) box.style.display = "none";
  showToast(t("subDone") + " ✔");
  _enterApp();
}

/** One line for Settings */
function subStatusText() {
  if (!currentUser) return "";
  var s = null; try { s = JSON.parse(_subGet(_subKey("sub", currentUser.uid)) || "null"); } catch (e) {}
  if (!s) return t("subNone");
  return t("subActiveDemo").replace("{plan}", t(s.plan === "year" ? "subYearly" : "subMonthly"));
}
