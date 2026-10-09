// 1. 系統參數設定
export const EXPIRED_HOURS = 1; // 設定閒置幾小時登出
export const SESSION_DURATION_MS = EXPIRED_HOURS * 60 * 60 * 1000;
export const TOKEN_EXPIRED = "token expired";
export const REDIRECT_URI = window.location.origin + "/booking";
export const IS_DEV = import.meta.env.MODE === "development";

// 2. API 與第三方服務
const GAS_ID = import.meta.env.VITE_GAS_ID;
const GAS_MODE = import.meta.env.VITE_GAS_MODE;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
export const GAS_BASE = `https://script.google.com/macros/s/${GAS_ID}/${GAS_MODE}`;

// 3. LocalStorage Key 管理
export const STORAGE_KEYS = {
  USER: "user",
  TOKEN: "idToken",
  LAST_ACTIVE: "lastActive",
  LAST_PING: "gas_last_ping_time",
};
export const OAUTH_NONCE_KEY = "oauth_nonce"; // sessionStorage：Google 登入的 nonce

// --- 其他參數設定： ---
export const CERTIPORT_FEE = 100;
export const USER_MEMBERSHIP = ["basic", "premium"];
export const EXAM_LANGUAGE = ["繁體中文", "English"];
export const REGISTRATION_DEADLINE_DAYS = 3; // 預約截止時間 (距離預約日幾天前)
export const DEADLINE_CONFIG = {
  WARNING_DAYS: 4, // 剩餘 4 天為警告
  URGENT_DAYS: 2,  // 剩餘 2 天為緊急
  COLORS: {
    SAFE: "#46A66F",    // 安全 (綠色)
    WARNING: "#F09438", // 警告 (橘色)
    URGENT: "#d9534f"   // 緊急 (紅色)
  }
};
export const reserveStatus = [
  { id: "reviewing", label: "報名審核中", badge: "info", icon: "fa-hourglass-half", message: "點擊以修改報名資料" },
  { id: "unpaid", label: "未繳費", badge: "warning", icon: "fa-credit-card", message: "點擊以上傳繳費證明" },
  { id: "payment_review", label: "繳費審核中", badge: "primary", icon: "fa-money-check-dollar", message: "" },
  { id: "paid", label: "繳費完成", badge: "success", icon: "fa-check-circle", message: "點擊以查看報考資訊" },
  { id: "rejected", label: "報名審核不通過", badge: "danger", icon: "fa-times-circle", message: "點擊以修改報名資料" },
  { id: "payment_rejected", label: "付款審核未通過", badge: "danger", icon: "fa-circle-xmark", message: "付款資訊有誤，請重新上傳證明" },
  { id: "history", label: "已過期", icon: "fa-clock-rotate-left", badge: "history", message: "" },
];
export const adminReserveStatus = [
  { id: "reviewing", label: "待審核報名", badge: "info", icon: "fa-hourglass-half" },
  { id: "unpaid", label: "待付款", badge: "warning", icon: "fa-credit-card" },
  { id: "payment_review", label: "待審核付款", badge: "primary", icon: "fa-money-check-dollar" },
  { id: "rejected", label: "未通過審核", badge: "danger", icon: "fa-circle-xmark" },
];