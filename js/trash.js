/* ============================================================
   trash.js — Recently deleted (30 days) + Undo.
   Deleting moves the document into trash/{id}:
     { collection, docId, data, label, kind, deletedBy, deletedAt }
   or, for one QR image, { collection, docId, field, value, ... }.
   Restore writes it back (normal Firestore rules apply) and removes
   the trash entry. The push sender purges entries older than 30 days.
   ============================================================ */

var TRASH_DAYS = 30;
var TRASH_KINDS = {               // kind -> icon
  session: "sessions", poll: "polls", court: "court",
  shuttle: "shuttle", player: "users", qr: "qr"
};

function _trashEntry(kind, collection, docId, label) {
  return { kind: kind, collection: collection, docId: docId, label: label,
    deletedBy: currentUser.uid, deletedAt: Date.now() };
}

/** Move one document to the trash; shows an Undo toast. Resolves with the trash id. */
function trashDoc(kind, collection, docId, label) {
  var ref = fsdb.collection(collection).doc(docId);
  return ref.get().then(function (doc) {
    if (!doc.exists) throw new Error(t("noData"));
    var entry = _trashEntry(kind, collection, docId, label);
    entry.data = doc.data();
    var tref = fsdb.collection("trash").doc();
    var batch = fsdb.batch();
    batch.set(tref, entry);
    batch.delete(ref);
    return batch.commit().then(function () {
      showUndoToast(t("movedToTrash").replace("{name}", label), tref.id);
      return tref.id;
    });
  });
}

/** Move one field (e.g. one QR image) to the trash */
function trashField(kind, collection, docId, field, label) {
  var ref = fsdb.collection(collection).doc(docId);
  return ref.get().then(function (doc) {
    var value = doc.exists ? doc.get(field) : null;
    if (!value) throw new Error(t("noData"));
    var entry = _trashEntry(kind, collection, docId, label);
    entry.field = field;
    entry.value = value;
    var tref = fsdb.collection("trash").doc();
    var upd = {};
    upd[field] = null;
    var batch = fsdb.batch();
    batch.set(tref, entry);
    batch.set(ref, upd, { merge: true });
    return batch.commit().then(function () {
      showUndoToast(t("movedToTrash").replace("{name}", label), tref.id);
      return tref.id;
    });
  });
}

/** Put a trashed item back where it was */
function restoreTrash(trashId, quiet) {
  var tref = fsdb.collection("trash").doc(trashId);
  return tref.get().then(function (doc) {
    if (!doc.exists) throw new Error(t("noData"));
    var e = doc.data();
    var ref = fsdb.collection(e.collection).doc(e.docId);
    var batch = fsdb.batch();
    if (e.field) {
      var upd = {};
      upd[e.field] = e.value;
      batch.set(ref, upd, { merge: true });
    } else {
      batch.set(ref, e.data);
    }
    batch.delete(tref);
    return batch.commit().then(function () {
      if (e.collection === "qrcodes" && typeof _qrCache !== "undefined") delete _qrCache[e.docId];
      if (!quiet) showToast(t("restored").replace("{name}", e.label) + " ✔");
      if (typeof currentPage !== "undefined") {
        if (currentPage === "trash") loadTrash();
        else if (typeof renderSettings === "function" && /settings|profile|config/.test(currentPage)) renderSettings();
      }
      return e;
    });
  });
}

function deleteTrashForever(trashId) {
  if (!confirm(t("deleteForeverConfirm"))) return;
  fsdb.collection("trash").doc(trashId).delete()
    .then(function () { showToast(t("delete") + " ✔"); loadTrash(); })
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Undo toast ---------- */
var _undoTimer = null;
function showUndoToast(msg, trashId) {
  var el = document.getElementById("undoToast");
  if (!el) return showToast(msg);
  el.innerHTML = '<span>' + escapeHtml(msg) + '</span><button onclick="undoLast(\'' + trashId + '\')">' + t("undo") + '</button>';
  el.classList.add("show");
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(function () { el.classList.remove("show"); }, 8000);
}

function undoLast(trashId) {
  var el = document.getElementById("undoToast");
  if (el) el.classList.remove("show");
  restoreTrash(trashId).then(function (e) {
    if (e && e.collection === "sessions" && typeof showSessionDetail === "function") showSessionDetail(e.docId);
  }).catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Recently deleted page ---------- */
function loadTrash() {
  var box = document.getElementById("trashContent");
  if (!box) return;
  setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("recentlyDeleted") }]);
  box.innerHTML = '<div class="empty-state">' + t("loading") + '</div>';
  var q = fsdb.collection("trash");
  if (!isSuperAdmin()) q = q.where("deletedBy", "==", currentUser.uid);
  q.get().then(function (snap) {
    var items = [];
    snap.forEach(function (d) { items.push(Object.assign({ id: d.id }, d.data())); });
    items.sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    box.innerHTML = _renderTrash(items);
  }).catch(function (error) {
    box.innerHTML = '<div class="empty-state">' + escapeHtml(_permError(error)) + '</div>';
  });
}

function _renderTrash(items) {
  var html = '<div class="card"><div class="card-title">' + icon("trash", 14) + ' ' + t("recentlyDeleted") + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' +
    t(isSuperAdmin() ? "trashHintSuper" : "trashHint").replace("{n}", TRASH_DAYS) + '</div>';
  if (!items.length) html += '<div class="empty-state" style="padding:16px">' + t("trashEmpty") + '</div>';
  items.forEach(function (e) {
    var left = Math.max(0, Math.ceil((e.deletedAt + TRASH_DAYS * 86400e3 - Date.now()) / 86400e3));
    html += '<div class="trash-row">' +
      '<span class="trash-icon">' + icon(TRASH_KINDS[e.kind] || "trash", 18) + '</span>' +
      '<span class="trash-info"><b>' + escapeHtml(e.label || e.docId) + '</b>' +
      '<small>' + t("trashKind_" + e.kind) + ' · ' + t("deletedByWhen").replace("{name}", getUserName(e.deletedBy)).replace("{when}", _timeAgo(e.deletedAt)) +
      ' · ' + t("daysLeft").replace("{n}", left) + '</small></span>' +
      '<span class="trash-actions">' +
      '<button class="edit-btn" onclick="restoreTrash(\'' + e.id + '\').catch(function(er){showToast(_permError(er))})">' + t("restore") + '</button>' +
      '<button class="delete-btn icon-btn" aria-label="' + t("deleteForever") + '" onclick="deleteTrashForever(\'' + e.id + '\')">' + icon("trash", 16) + '</button>' +
      '</span></div>';
  });
  return html + '</div>';
}
