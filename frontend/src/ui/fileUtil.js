/* ==========================================================================
   fileUtil.js — Base64 Data URL and Blob Utilities
   Dynamic SRF Management Portal v2.0
   ========================================================================== */

/**
 * Converts a base64 data URL to a binary Blob object.
 * @param {string} dataurl
 * @returns {Blob|null}
 */
export function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  if (!dataurl.startsWith('data:')) {
    return null;
  }
  try {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('Failed to convert dataURL to Blob:', e);
    return null;
  }
}

/**
 * Converts a base64 data URL to an Object URL (blob:...).
 * Returns the original string if it's not a data URL or conversion fails.
 * @param {string} dataurl
 * @returns {string}
 */
export function dataURLtoObjectURL(dataurl) {
  if (!dataurl) return '';
  if (!dataurl.startsWith('data:')) return dataurl;
  const blob = dataURLtoBlob(dataurl);
  if (!blob) return dataurl;
  return URL.createObjectURL(blob);
}
