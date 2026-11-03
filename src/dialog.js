// 取代瀏覽器原生 confirm() / alert() 的對話框。
// 畫面由 components/dialogHost.jsx 負責；這裡只管佇列，任何地方 (包含非元件的程式) 都能呼叫。
//
//   if (!(await confirmDialog("確定要刪除嗎？"))) return;
//   notify("新增成功！");

let queue = [];
let nextId = 1;
const listeners = new Set();
let toastQueue = [];
let nextToastId = 1;
const toastListeners = new Set();

const emit = () => listeners.forEach((listener) => listener());
const emitToasts = () => toastListeners.forEach((listener) => listener());

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getQueue = () => queue;

export function subscribeToasts(listener) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export const getToasts = () => toastQueue;

export function dismissToast(id) {
  const nextQueue = toastQueue.filter((toast) => toast.id !== id);
  if (nextQueue.length === toastQueue.length) return;
  toastQueue = nextQueue;
  emitToasts();
}

/** 關閉目前最上層的對話框，並把結果回傳給呼叫的人 */
export function closeCurrent(result) {
  const [current, ...rest] = queue;
  if (!current) return;
  queue = rest;
  emit();
  current.resolve(result);
}

// 原本的訊息開頭常帶 ⚠️ ✅ 這類符號，對話框自己有圖示，所以拿掉
const stripLeadingSymbols = (text) => String(text ?? "").replace(/^(?:\s|⚠️|✅|❌|💡|✨|👉)+/u, "");

function open(kind, message, options) {
  const text = stripLeadingSymbols(message);
  return new Promise((resolve) => {
    queue = [...queue, { id: nextId++, kind, message: text, ...options, resolve }];
    emit();
  });
}

/**
 * 再確認對話框，回傳 Promise<boolean>。
 * options: { title, confirmText, cancelText, tone: "danger" | "warning" | "info" }
 * 沒指定 tone 時，訊息提到刪除、退回會自動用警示色。
 */
export function confirmDialog(message, options = {}) {
  const isDestructive = /刪除|退回/.test(String(message));
  return open("confirm", message, {
    tone: isDestructive ? "danger" : "info",
    confirmText: /刪除/.test(String(message)) ? "刪除" : "確定",
    ...options,
  });
}

/**
 * 成功與一般提示以 snackbar 呈現；警告與錯誤保留對話框。
 * options: { title, tone: "success" | "danger" | "warning" | "info", duration }
 */
export function notify(message, options = {}) {
  const text = String(message);
  let tone = "info";
  if (/失敗|錯誤|無法|逾時|失效/.test(text)) tone = "danger";
  else if (/成功|已為您|已送出|已登記/.test(text)) tone = "success";
  else if (/請先|尚未|不能|不可|已取消|已經關閉|已關閉|已滿|注意/.test(text)) tone = "warning";
  tone = options.tone || tone;

  if (tone === "success" || tone === "info") {
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : 5000;
    const toast = {
      id: nextToastId++,
      message: stripLeadingSymbols(text),
      tone,
      title: options.title,
      duration,
    };
    toastQueue = [...toastQueue.filter((item) => item.message !== toast.message), toast].slice(-3);
    emitToasts();
    return Promise.resolve(true);
  }

  return open("notice", message, { tone, ...options });
}
