import React, { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { subscribe, getQueue, closeCurrent } from "../dialog";

const TONE_ICONS = {
  danger: "fa-triangle-exclamation",
  warning: "fa-circle-exclamation",
  success: "fa-circle-check",
  info: "fa-circle-question",
};

const DEFAULT_TITLES = {
  confirm: { danger: "請再次確認", warning: "請確認", info: "請確認" },
  notice: { danger: "發生問題", warning: "請注意", success: "完成", info: "提示" },
};

// 再確認與提示對話框的畫面。整個網站只需要在 MainLayout 放一個。
export default function DialogHost() {
  const queue = useSyncExternalStore(subscribe, getQueue);
  const dialog = queue[0];

  // Esc 等同取消
  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeCurrent(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  if (!dialog) return null;

  const isConfirm = dialog.kind === "confirm";
  const tone = dialog.tone || "info";
  // 提示訊息用 info 色調時，圖示改成「i」比問號合適
  const icon = !isConfirm && tone === "info" ? "fa-circle-info" : TONE_ICONS[tone];
  const title = dialog.title || DEFAULT_TITLES[dialog.kind][tone];

  return createPortal(
    <div className="dialog-overlay" onClick={() => closeCurrent(false)}>
      <div
        className={`dialog-box ${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-icon"><i className={`fa-solid ${icon}`}></i></div>
        <h3 id="dialog-title" className="dialog-title">{title}</h3>
        {/* 多行訊息 (例如列出刪除後的影響) 靠左對齊比較好讀 */}
        <p className={`dialog-message ${dialog.message.includes("\n") ? "multiline" : ""}`}>{dialog.message}</p>

        <div className="dialog-actions">
          {isConfirm && (
            <button type="button" className="dialog-btn secondary" onClick={() => closeCurrent(false)}>
              {dialog.cancelText || "取消"}
            </button>
          )}
          {/* key 讓每個對話框的主要按鈕都重新取得焦點，可以直接按 Enter */}
          <button
            key={dialog.id}
            type="button"
            className={`dialog-btn ${tone === "danger" && isConfirm ? "danger" : "primary"}`}
            onClick={() => closeCurrent(true)}
            autoFocus
          >
            {isConfirm ? (dialog.confirmText || "確定") : "知道了"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
