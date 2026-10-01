/* ============================================================
   storage.js — Image handling for QR codes and receipts.
   Images are resized in the browser and stored as data URLs in
   Firestore, so no Firebase Storage bucket (paid plan) is needed.
   ============================================================ */

/**
 * Resize an image file and return it as a JPEG/PNG data URL.
 * @param {File}     file     — image file from an <input type="file">
 * @param {number}   maxSize  — longest side in pixels
 * @param {function} callback — callback(error, dataUrl)
 */
function resizeImageToDataUrl(file, maxSize, callback) {
  if (!file || !/^image\//.test(file.type)) {
    callback(new Error("Please choose an image file"));
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () { callback(new Error("Could not read the image")); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { callback(new Error("Could not open the image")); };
    img.onload = function () {
      var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // JPEG keeps photos small; Firestore documents are limited to 1 MB
      callback(null, canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/** QR codes need to stay sharp enough to scan */
function readQrImage(file, callback) {
  resizeImageToDataUrl(file, 600, callback);
}

/** Receipts only need to be readable */
function readReceiptImage(file, callback) {
  resizeImageToDataUrl(file, 1000, callback);
}

/** Profile photo: centre-cropped square, 256 px */
function readAvatarImage(file, callback) {
  if (!file || !/^image\//.test(file.type)) { callback(new Error("Please choose an image file")); return; }
  var reader = new FileReader();
  reader.onerror = function () { callback(new Error("Could not read the image")); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { callback(new Error("Could not open the image")); };
    img.onload = function () {
      var side = Math.min(img.width, img.height);
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      callback(null, canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
