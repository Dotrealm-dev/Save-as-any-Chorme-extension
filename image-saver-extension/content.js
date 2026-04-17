// content.js - Loaded on all pages
// This file is intentionally minimal; all logic runs via scripting.executeScript
// so it has full access to page DOM without CSP restrictions.

// Optional: add subtle hover indicator on images
document.addEventListener("mouseover", (e) => {
  if (e.target.tagName === "IMG") {
    e.target.title = e.target.title || "คลิกขวา → บันทึกรูปภาพเป็น...";
  }
});
