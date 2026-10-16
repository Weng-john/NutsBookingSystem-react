import { useSyncExternalStore } from "react";

// 深色 / 淺色主題。
// 第一次進站跟隨系統設定；使用者手動切換後才寫入 localStorage，之後以他的選擇為準。
// (index.html 開頭有一段相同邏輯的 script，在畫面繪製前先套用，避免閃白)

const STORAGE_KEY = "theme";
const listeners = new Set();
const systemQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : null;
  } catch {
    return null;
  }
}

let current = readSaved() || (systemQuery?.matches ? "dark" : "light");

function apply() {
  document.body.classList.toggle("dark", current === "dark");
  listeners.forEach((listener) => listener());
}
apply();

// 使用者還沒手動選過時，系統設定改變就跟著變
systemQuery?.addEventListener?.("change", (e) => {
  if (readSaved()) return;
  current = e.matches ? "dark" : "light";
  apply();
});

export function toggleTheme() {
  current = current === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // 無法寫入 localStorage 時，這次切換仍然生效，只是重新整理後不會記住
  }
  apply();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 目前的主題："light" 或 "dark" */
export function useTheme() {
  return useSyncExternalStore(subscribe, () => current);
}
