// ========================================
// Image Saver Pro - Background Service Worker
// ========================================

const FORMATS = [
  { id: "png",  label: "PNG  (โปร่งใส, คุณภาพสูง)",  mimeType: "image/png",  ext: "png"  },
  { id: "jpg",  label: "JPG  (ขนาดเล็ก, รูปทั่วไป)",  mimeType: "image/jpeg", ext: "jpg"  },
  { id: "webp", label: "WebP (เว็บไซต์, สมดุล)",        mimeType: "image/webp", ext: "webp" },
  { id: "bmp",  label: "BMP  (ไม่บีบอัด, ขนาดใหญ่)",   mimeType: "image/bmp",  ext: "bmp"  },
  { id: "avif", label: "AVIF (ล่าสุด, คุณภาพสูงสุด)", mimeType: "image/avif", ext: "avif" },
];

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Remove old menus first
  chrome.contextMenus.removeAll(() => {
    // Parent menu
    chrome.contextMenus.create({
      id: "imageSaverParent",
      title: "💾 บันทึกรูปภาพเป็น...",
      contexts: ["image"],
    });

    // Sub-menu for each format
    FORMATS.forEach((fmt) => {
      chrome.contextMenus.create({
        id: `saveAs_${fmt.id}`,
        parentId: "imageSaverParent",
        title: fmt.label,
        contexts: ["image"],
      });
    });

    // Separator + copy URL option
    chrome.contextMenus.create({
      id: "separator1",
      parentId: "imageSaverParent",
      type: "separator",
      contexts: ["image"],
    });

    chrome.contextMenus.create({
      id: "copyImageUrl",
      parentId: "imageSaverParent",
      title: "📋 คัดลอก URL รูปภาพ",
      contexts: ["image"],
    });

    chrome.contextMenus.create({
      id: "viewImageInfo",
      parentId: "imageSaverParent",
      title: "ℹ️ ดูข้อมูลรูปภาพ",
      contexts: ["image"],
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const { menuItemId, srcUrl, pageUrl } = info;

  if (menuItemId === "copyImageUrl") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (url) => navigator.clipboard.writeText(url),
      args: [srcUrl],
    });
    return;
  }

  if (menuItemId === "viewImageInfo") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showImageInfo,
      args: [srcUrl],
    });
    return;
  }

  // Handle format conversions
  const format = FORMATS.find((f) => `saveAs_${f.id}` === menuItemId);
  if (format) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: convertAndDownload,
      args: [srcUrl, format.mimeType, format.ext, format.id],
    });
  }
});

// ========================================
// Functions injected into page context
// ========================================

function showImageInfo(imageUrl) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const info = [
      `📐 ขนาด: ${img.naturalWidth} × ${img.naturalHeight} px`,
      `🔗 URL: ${imageUrl.length > 80 ? imageUrl.substring(0, 80) + "..." : imageUrl}`,
      `📄 ประเภทไฟล์: ${imageUrl.split(".").pop().split("?")[0].toUpperCase() || "ไม่ทราบ"}`,
    ].join("\n");
    alert("🖼️ ข้อมูลรูปภาพ\n\n" + info);
  };
  img.onerror = () => alert("ไม่สามารถโหลดข้อมูลรูปภาพได้");
  img.src = imageUrl;
}

function convertAndDownload(imageUrl, mimeType, ext, formatId) {
  // Show loading toast
  const toast = document.createElement("div");
  toast.id = "imageSaverToast";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: "rgba(30,30,30,0.95)",
    color: "#fff",
    padding: "14px 22px",
    borderRadius: "12px",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    zIndex: "2147483647",
    boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
    transition: "opacity 0.4s ease",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    maxWidth: "340px",
  });
  toast.innerHTML = `<span style="font-size:20px">⏳</span> กำลังแปลงและบันทึก <b>${ext.toUpperCase()}</b>...`;
  document.body.appendChild(toast);

  const hideToast = (msg, icon = "✅") => {
    toast.innerHTML = `<span style="font-size:20px">${icon}</span> ${msg}`;
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 2200);
  };

  // Fetch image and draw to canvas for conversion
  fetch(imageUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");

        // White background for JPG (no transparency support)
        if (formatId === "jpg" || formatId === "bmp") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(blobUrl);

        // Get quality setting
        const quality = formatId === "jpg" ? 0.92 : formatId === "webp" ? 0.90 : undefined;

        canvas.toBlob(
          (outputBlob) => {
            if (!outputBlob) {
              hideToast("ไม่รองรับรูปแบบนี้ในเบราว์เซอร์นี้ 😢", "❌");
              return;
            }
            const outUrl = URL.createObjectURL(outputBlob);

            // Generate filename from original URL
            const originalName = imageUrl
              .split("/").pop()
              .split("?")[0]
              .replace(/\.[^/.]+$/, "") || "image";
            const safeName = originalName.replace(/[^a-zA-Z0-9_\-ก-๙]/g, "_").substring(0, 60);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
            const filename = `${safeName}_${timestamp}.${ext}`;

            const a = document.createElement("a");
            a.href = outUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => URL.revokeObjectURL(outUrl), 1000);
            hideToast(`บันทึกสำเร็จ! <b>${filename}</b>`, "✅");
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        hideToast("โหลดรูปภาพไม่ได้ (CORS blocked) ❌", "❌");
      };

      img.src = blobUrl;
    })
    .catch((err) => {
      hideToast(`เกิดข้อผิดพลาด: ${err.message}`, "❌");
    });
}
