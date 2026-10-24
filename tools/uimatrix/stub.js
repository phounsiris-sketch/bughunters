/* Firebase stand-in: every call works and returns empty data, nothing leaves the machine */
(function () {
  var empty = function () { return { exists: false, data: function () { return {}; }, docs: [], size: 0, empty: true, forEach: function () {}, docChanges: function () { return []; }, id: "x" }; };
  var P;
  var h = {
    get: function (_, k) {
      if (k === "then" || typeof k === "symbol") return undefined;
      if (k === "get") return function () { return Promise.resolve(empty()); };
      if (k === "onSnapshot") return function (a, b) { var cb = typeof a === "function" ? a : b; try { cb(empty()); } catch (e) {} return function () {}; };
      if (k === "onAuthStateChanged" || k === "onIdTokenChanged") return function () { return function () {}; };
      if (k === "currentUser") return null;
      if (/^is[A-Z]/.test(k)) return function () { return false; };
      if (k === "commit" || k === "set" || k === "update" || k === "delete" || k === "add") return function () { return Promise.resolve(); };
      return P;
    },
    apply: function () { return P; }
  };
  P = new Proxy(function () {}, h);
  window.firebase = P;
  window.__FB_STUB = true;
})();
