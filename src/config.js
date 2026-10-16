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
    SAFE: "#2b8251",    // 安全 (綠色)
    WARNING: "#e08a2c", // 警告 (橘色)
    URGENT: "#cf3f34"   // 緊急 (紅色)
  }
};
// 「我的考試」左側的分頁：依考生需不需要動手來分 (哪一筆報名屬於哪一組，規則在 features/booking/utils 的 reservationGroup)。
// 底下可以再依確切的狀態分成第二層分頁 (statuses，id 對應 utils 的 reservationStatusKey)；
// optional 的只在有項目時才顯示
export const reserveGroups = [
  {
    id: "todo", label: "待處理", icon: "fa-circle-exclamation", message: "",
    statuses: [
      { id: "unpaid", label: "未繳費", message: "點選報名以上傳繳費證明" },
      { id: "payment_rejected", label: "付款審核未通過", message: "付款資訊有誤，點選報名重新上傳證明" },
      { id: "rejected", label: "報名審核不通過", message: "點選報名以修改資料後重新送出" },
      { id: "cancelled", label: "場次已取消", message: "點選報名改期，或取消並申請退費", optional: true },
    ],
  },
  {
    id: "waiting", label: "審核中", icon: "fa-hourglass-half", message: "",
    statuses: [
      { id: "reviewing", label: "報名審核中", message: "學苑審核報名資料中；點選報名可修改資料、改期或取消" },
      { id: "payment_review", label: "繳費審核中", message: "學苑核對繳費證明中，審核完成前無法改期或取消" },
    ],
  },
  { id: "ready", label: "已完成報名", icon: "fa-circle-check", message: "點選報名可加入行事曆、列印確認單、改期或取消" },
  {
    id: "history", label: "歷史紀錄", icon: "fa-clock-rotate-left", message: "",
    statuses: [
      { id: "taken", label: "已應考", message: "點選報名查看成績" },
      { id: "absent", label: "缺考", message: "", optional: true },
      { id: "cancelled", label: "已取消", message: "" },
      { id: "expired", label: "已過期", message: "沒有完成審核或繳費就過了考試時間" },
    ],
  },
];
export const adminReserveStatus = [
  { id: "reviewing", label: "待審核報名", badge: "info", icon: "fa-hourglass-half" },
  { id: "unpaid", label: "待付款", badge: "warning", icon: "fa-credit-card" },
  { id: "payment_review", label: "待審核付款", badge: "primary", icon: "fa-money-check-dollar" },
  { id: "rejected", label: "未通過審核", badge: "danger", icon: "fa-circle-xmark" },
  // 已開考、已繳費的報名，考後在這裡登記出席與成績
  { id: "results", label: "成績登記", badge: "results", icon: "fa-award" },
  // 已繳費的考生取消報名時提出的退費申請 (只有管理員看得到這個分頁)
  { id: "refund", label: "退費申請", badge: "refund", icon: "fa-hand-holding-dollar" },
];
