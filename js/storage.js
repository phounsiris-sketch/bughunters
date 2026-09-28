/* ============================================================
   storage.js — Firebase Storage uploads (COMPAT API)
   Uses global `storage` from firebase-config.js
   ============================================================ */

/**
 * Upload a file to Firebase Storage with progress tracking
 * @param {string}   path     — full storage path
 * @param {File}     file     — File object from input
 * @param {function} callback — receives status objects:
 *   {status:'progress', progress: 0-100}
 *   {status:'error', error: Error}
 *   {status:'done', url: string}
 */
function uploadFile(path, file, callback) {
  var ref = storage.ref().child(path);
  var task = ref.put(file);

  task.on(
    "state_changed",
    function (snapshot) {
      var progress = Math.round(
        (snapshot.bytesTransferred / snapshot.totalBytes) * 100
      );
      callback({ status: "progress", progress: progress });
    },
    function (error) {
      callback({ status: "error", error: error });
    },
    function () {
      task.snapshot.ref.getDownloadURL().then(function (url) {
        callback({ status: "done", url: url });
      });
    }
  );
}

/**
 * Upload a QR code image
 * @param {string}   type     — 'court' or 'shuttle'
 * @param {File}     file     — image file
 * @param {function} callback — same signature as uploadFile
 */
function uploadQRImage(type, file, callback) {
  var timestamp = Date.now();
  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  var path = "qr/" + type + "_" + timestamp + "_" + safeName;
  uploadFile(path, file, callback);
}

/**
 * Upload a dinner receipt image
 * @param {string}   sessionId — Firestore session document id
 * @param {File}     file      — receipt image
 * @param {function} callback  — same signature as uploadFile
 */
function uploadDinnerReceipt(sessionId, file, callback) {
  var timestamp = Date.now();
  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  var path = "receipts/" + sessionId + "_" + timestamp + "_" + safeName;
  uploadFile(path, file, callback);
}
