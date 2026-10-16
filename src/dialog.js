// 取代瀏覽器原生 confirm() / alert() 的對話框。
// 畫面由 components/dialogHost.jsx 負責；這裡只管佇列，任何地方 (包含非元件的程式) 都能呼叫。
//
//   if (!(await confirmDialog("確定要刪除嗎？"))) return;
//   notify("新增成功！");

let queue = [];
let nextId = 1;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener());

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getQueue = () => queue;

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
 * 提示訊息 (取代 alert)。不會擋住後面的程式執行；需要等使用者按下時可以 await。
 * options: { title, tone: "success" | "danger" | "warning" | "info" }
 */
export function notify(message, options = {}) {
  const text = String(message);
  let tone = "info";
  if (/失敗|錯誤|無法|逾時|失效/.test(text)) tone = "danger";
  else if (/成功|已為您|已送出|已登記/.test(text)) tone = "success";
  else if (/請先|尚未|不能|不可|已取消|已經關閉|已關閉|已滿|注意/.test(text)) tone = "warning";
  return open("notice", message, { tone, ...options });
}
