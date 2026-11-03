import { GAS_BASE, STORAGE_KEYS, TOKEN_EXPIRED, REDIRECT_URI } from "./config";

/* =========================================
    👋 系統喚醒 (Handshake) API
   ========================================= */

const PING_COOLDOWN = 10 * 60 * 1000;
let pingPromise = null; // 用來鎖定正在進行中的 Ping，防止重複發送

export const ensureGASAwake = async () => {
  let lastPing = 0;
  try { lastPing = Number(localStorage.getItem(STORAGE_KEYS.LAST_PING)); } catch { /* 無法使用儲存空間時仍可喚醒 */ }
  const elapsed = Date.now() - lastPing;
  if (lastPing && elapsed >= 0 && elapsed < PING_COOLDOWN) return true;
  if (pingPromise) return pingPromise;
  pingPromise = (async () => {
    try {
      await sendToGAS("ping");
      try { localStorage.setItem(STORAGE_KEYS.LAST_PING, String(Date.now())); } catch { /* 不影響 API */ }
      return true;
    } catch {
      return false;
    } finally { pingPromise = null; }
  })();
  return pingPromise;
};

/** 背景喚醒與正式請求分開進行，不延遲頁面查詢 */
export const pingGASAPI = () => ensureGASAwake();

/* =========================================
    🛠️ 內部輔助與狀態管理
   ========================================= */

let isRedirectingToLogin = false;

const formatDate = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const date = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
};

const formatTime = (dateObj) => {
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * 依底色的亮度回傳深色或白色文字，確保月曆上各科目的色塊都看得清楚
 * (科目顏色由後端提供，深淺不一定)
 */
const readableTextColor = (hex) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return "#1f2a30";
  const value = parseInt(match[1], 16);
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 0.225 是深色字與白字對比度相等的亮度，比它亮就用深色字
  return luminance > 0.225 ? "#1f2a30" : "#FFFFFF";
};

/**
 * 處理 Token 失效的統一入口
 */
const handleUnauthorized = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;

  console.warn("驗證失效：執行自動登出並重新導向至登入頁面...");

  // 呼叫統一登出函式 (設定 isAutoLogout = true)
  logoutUser(true);

  // 3 秒後解除鎖定
  setTimeout(() => {
    isRedirectingToLogin = false;
  }, 3000);
};

/**
 * 統一的登出處理函式
 * @param {boolean} isAutoLogout - 是否為系統自動登出 (用來略過 confirm 視窗)
 */
export const logoutUser = (isAutoLogout = false) => {
  // 如果是使用者手動點擊，則跳出確認視窗
  if (!isAutoLogout) {
    if (!window.confirm("確定要登出嗎？")) return;
  }

  // 1. 清除所有相關的 LocalStorage 狀態
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE);

  // 2. 禁用 Google 自動登入
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }

  // 3. 重新導向至登入頁面 (硬跳轉能確保前端框架的狀態被完全清空)
  window.location.href = REDIRECT_URI;
};

/**
 * 計算預約狀態
 * tone 是狀態的色調名稱，畫面用 .tone-<名稱> 上色 (顏色定義在 index.css，深淺模式各一組)
 */
const calculateStatus_ = (res, exam) => {
  if (String(res.reservationStatus).toLowerCase() === "cancelled") {
    return { id: "cancelled", color: "#8b959d", tone: "muted", text: "報名已取消", badge: "secondary" };
  }
  if (!exam) {
    return { id: "unknown", color: "#8b959d", tone: "muted", text: "未知場次 / 已刪除", badge: "secondary" };
  }

  if (["cancelled", "canceled"].includes(String(exam.status).toLowerCase())) return { id: "cancelled", color: "#8b959d", tone: "muted", text: "場次已取消，可提出退費申請", badge: "secondary" };

  const now = new Date();
  const examDate = new Date(exam.startTime);
  const isExpired = examDate < now;

  const rStatus = String(res.reviewStatus).trim().toUpperCase();
  const isApproved = rStatus === "TRUE" || rStatus === "APPROVED" || rStatus === "1";

  const pStatus = String(res.paymentStatus).trim().toUpperCase();
  const isPaid = pStatus === "TRUE" || pStatus === "PAID" || pStatus === "1";
  const isPaymentReview = pStatus === "PENDING" || pStatus === "REVIEWING";

  const hasComment = !!String(res.comment || "").trim();

  // 付款審核未通過：報名已通過、付款未完成、且有退件原因
  if (hasComment && isApproved && !isPaid && !isPaymentReview) {
    return {
      id: "payment_rejected",
      color: "#cf3f34", tone: "danger",
      text: isExpired ? "付款審核未通過 / 已過期" : "付款審核未通過",
      badge: isExpired ? "expired" : "danger"
    };
  }

  // 報名審核未通過：報名尚未通過、且有退件原因
  if (hasComment && !isApproved) {
    return {
      id: "rejected",
      color: "#cf3f34", tone: "danger",
      text: isExpired ? "報名審核未通過 / 已過期" : "報名審核未通過",
      badge: isExpired ? "expired" : "danger"
    };
  }

  if (isPaid) {
    return isExpired
      ? { id: "history", color: "#8b959d", tone: "muted", text: "已結束 / 已過期", badge: "expired" }
      : { id: "paid", color: "#2b8251", tone: "success", text: "已繳費", badge: "success" };
  }

  if (isPaymentReview) {
    return isExpired
      ? { id: "history", color: "#8b959d", tone: "muted", text: "繳費審核中 / 已過期", badge: "expired" }
      : { id: "payment_review", color: "#2f6fb2", tone: "info", text: "繳費審核中", badge: "primary" };
  }

  if (isApproved) {
    return isExpired
      ? { id: "history", color: "#8b959d", tone: "muted", text: "未繳費 / 已過期", badge: "expired" }
      : { id: "unpaid", color: "#e08a2c", tone: "warning", text: "待繳費", badge: "warning" };
  }

  return isExpired
    ? { id: "history", color: "#8b959d", tone: "muted", text: "預約失效 / 已過期", badge: "expired" }
    : { id: "reviewing", color: "#8a6f61", tone: "pending", text: "審核中", badge: "info" };
};

/* =========================================
    🚀 核心請求函式 (包含自動偵測 Invalid Token)
   ========================================= */

const READ_ROUTES = new Set([
  "ping", "me", "getExams", "getSubjects", "getRooms", "getReservations", "getMyReservationsWithDetails",
  "getAllReservationsAdmin", "getExamsAdmin", "listUsers", "getExamGuidelines", "getPaymentProof",
  "getMyReservationRequests", "getReservationRequestsAdmin", "getReservationReport", "getAuditLogs",
  "getMyNotifications", "getNotificationPreferences", "getNotificationRules", "getNotificationDeliveryLogs",
]);
const pendingReads = new Map();
const apiError = (message, code, status) => Object.assign(new Error(message), { code, ...(status ? { status } : {}) });

async function requestGAS(route, bodyData) {
  if (!GAS_BASE) throw apiError("服務尚未完成連線設定，請聯絡學苑。", "CONFIGURATION_ERROR");
  const sentToken = bodyData.idToken;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(apiError("連線等候過久。若剛送出資料，請先重新整理確認結果，再決定是否重送。", "TIMEOUT"));
      controller.abort();
    }, route === "ping" ? 8000 : 45000);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let response;
      try {
        response = await fetch(`${GAS_BASE}?route=${encodeURIComponent(route)}`, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ ...bodyData, route }), signal: controller.signal,
        });
      } catch {
        throw apiError("無法連線至伺服器，請檢查網路後再試。若剛送出資料，請先重新整理確認結果。", "NETWORK_ERROR");
      }
      if (!response.ok) throw apiError("伺服器暫時無法處理請求，請稍後再試。", "HTTP_ERROR", response.status);
      let resData;
      try { resData = await response.json(); }
      catch { throw apiError("伺服器回應異常，請稍後再試；若持續發生，請聯絡學苑。", "INVALID_RESPONSE"); }
      if (!resData || typeof resData.ok !== "boolean" || (resData.ok && !Object.prototype.hasOwnProperty.call(resData, "data"))) throw apiError("伺服器回應格式不完整，請聯絡學苑。", "INVALID_RESPONSE");
      if (!resData.ok) {
        const unauthorized = resData.code === "UNAUTHORIZED" || (!resData.code && /^(Invalid token|Token expired|Missing idToken|Audience mismatch|Invalid issuer)/i.test(resData.error || ""));
        if (unauthorized) {
          if (!sentToken) throw apiError("這項功能尚未在伺服器啟用，請聯絡學苑。", "NOT_FOUND");
          // 舊請求的回應不能登出後來重新登入的帳號。
          if (localStorage.getItem(STORAGE_KEYS.TOKEN) === sentToken) handleUnauthorized();
          throw apiError(TOKEN_EXPIRED, "UNAUTHORIZED");
        }
        const message = typeof resData.error === "string" && /[\u3400-\u9fff]/.test(resData.error) ? resData.error : "操作未完成，請重新整理後再試；若持續發生，請聯絡學苑。";
        throw apiError(message, resData.code || "REQUEST_FAILED");
      }
      return resData;
    })()]);
  } finally { clearTimeout(timer); }
}

export const sendToGAS = (route, bodyData = {}) => {
  // 只合併同一身分、同一內容的進行中查詢；完成後不保留個資或過期資料。
  if (!READ_ROUTES.has(route)) return requestGAS(route, bodyData);
  const key = JSON.stringify([route, bodyData]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const request = requestGAS(route, bodyData).finally(() => pendingReads.delete(key));
  pendingReads.set(key, request);
  return request;
};

/* =========================================
    📖 資料讀取類 API
   ========================================= */

// 取得使用者個人資料
export async function fetchMeAPI(token) {
  const response = await sendToGAS("me", { idToken: token });
  return response.data;
}

export const fetchReservationsAPI = async () => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const response = await sendToGAS("getExams", token ? { idToken: token } : {});
  const rawExams = response.data || [];

  return rawExams.map(exam => {
    const startDateObj = new Date(exam.startTime);
    const dateStr = formatDate(startDateObj);
    const timeStr = formatTime(startDateObj);

    // console.log(exam);

    let endTimeStr = "";
    if (exam.endTime) {
      const endDateObj = new Date(exam.endTime);
      endTimeStr = formatTime(endDateObj);
    }

    const isFull = exam.numHasReserved >= exam.numPeopleLimit;

    return {
      id: exam.examID,
      subjectID: exam.subjectID,
      startTimeISO: exam.startTime,
      endTimeISO: exam.endTime,
      registrationDeadline: exam.registrationDeadline,
      paymentDeadline: exam.paymentDeadline,
      address: exam.address,
      roomPhone: exam.roomPhone,
      title: exam.title,
      subjectName: exam.subjectName,
      date: dateStr,
      startTime: timeStr,
      endTime: endTimeStr,
      capacity: exam.numPeopleLimit,
      roomID: exam.roomID,
      location: exam.location,
      registeredCount: exam.numHasReserved,
      fee: exam.fee,
      createdBy: exam.createdBy,
      color: isFull ? "#EEEEEE" : (exam.color || "#E3F2FD"),
      textColor: isFull ? "#9E9E9E" : readableTextColor(exam.color || "#E3F2FD"),
      status: exam.status,           // Open, Draft, Cancelled
      hasRegistered: exam.hasRegistered,
    };
  });
};

export const fetchSubjectsAPI = async () => {
  const response = await sendToGAS("getSubjects");
  return (response.data?.subjects || []).map(subject => typeof subject === "object" ? subject.subjectName : subject);
};

export const fetchSubjectsRawAPI = async () => {
  const response = await sendToGAS("getSubjects");
  // console.log(response);
  return response.data.subjects || [];
};

/* =========================================
   🏢 教室/考場管理 API
   ========================================= */

// 取得所有地點/教室 (getRooms)
export const fetchRoomsAPI = async () => {
  const response = await sendToGAS("getRooms");

  // 盡可能涵蓋各種回傳格式
  const rooms =
    response?.data?.rooms ??
    response?.rooms ??
    response?.data ??
    [];

  return Array.isArray(rooms) ? rooms : [];
};

export const addRoomAPI = async (roomData) => {
  return await sendToGAS("addRoom", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...roomData
  });
};

export const updateRoomAPI = async (roomData) => {
  return await sendToGAS("updateRoom", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...roomData
  });
};

export const deleteRoomAPI = async (payload) => {
  const isObject = typeof payload === 'object' && payload !== null;
  return await sendToGAS("deleteRoom", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    roomID: isObject ? payload.roomID : payload,
    captchaToken: isObject ? payload.captchaToken : undefined
  });
};

/* =========================================
    📝 預約與提交類 API
   ========================================= */

export const submitReservationAPI = async (payload) => {
  return await sendToGAS("submitReservation", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    bookingData: payload
  });
};

export const submitPaymentProofAPI = async (payload) => {
  return await sendToGAS("submitPaymentProof", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};

/**
 * 訂閱 Draft 考試開放通知
 * @param {Object} payload { examID: string, email: string }
 */
export const subscribeNoticeAPI = async (payload) => {
  return await sendToGAS("subscribeNotice", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};

export const updateReservationAPI = async (payload) => {
  return await sendToGAS("updateReservation", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    updateData: payload
  });
};

/* =========================================
    👤 會員資料類 API
   ========================================= */

export const fetchUserReservationsAPI = async () => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (!token) return [];
  const response = await sendToGAS("getReservations", { idToken: token });
  return response.data?.data || [];
};

export const fetchMyReservationsWithDetailsAPI = async () => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return [];

    const response = await sendToGAS("getMyReservationsWithDetails", { idToken: token });
    const rawData = response.data.data || [];
    // console.log(rawData);

    const result = rawData.map(res => ({
      ...res,
      additional: ["TRUE", "1"].includes(String(res.additional).trim().toUpperCase()),
      statusInfo: calculateStatus_(res, res.examInfo)
    }));

    return result.sort((a, b) => new Date(a.reservedAt) - new Date(b.reservedAt));
  } catch (error) {
    console.error("fetchMyReservationsWithDetailsAPI Error:", error);
    throw error;
  }
};

// 更新個人資料 (包含大頭貼同步)
export async function updateProfileAPI(payload) {
  const response = await sendToGAS("updateProfile", payload);
  return response.data;
}

/* =========================================
    🗑️ Account Deletion (User Self Delete)
   ========================================= */

export const deleteMeAPI = async (captchaToken) => {
  return await sendToGAS("deleteMe", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    captchaToken,
  });
};

/* =========================================
    ⚙️ 管理員 API (Admin)
   ========================================= */

export const addSubjectAPI = async (subjectName, captchaToken) => {
  return await sendToGAS("addSubject", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    subjectName,
    captchaToken,
  });
};

export const deleteSubjectAPI = async (subjectID, captchaToken) => {
  return await sendToGAS("deleteSubject", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    subjectID,
    captchaToken,
  });
};


/**
 * 取得系統內所有的預約紀錄 (管理員專用)
 */
export const fetchAllReservationsAdminAPI = async () => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return [];

    // 呼叫管理員專屬的路由
    const response = await sendToGAS("getAllReservationsAdmin", { idToken: token });
    const rawData = response.data?.data || response.data || [];

    // 使用原本共用的 calculateStatus_ 計算狀態
    const result = rawData.map(res => ({
      ...res,
      additional: ["TRUE", "1"].includes(String(res.additional).trim().toUpperCase()),
      statusInfo: calculateStatus_(res, res.examInfo)
    }));

    // 依據預約時間，由新到舊排序
    return result.sort((a, b) => new Date(b.reservedAt) - new Date(a.reservedAt));
  } catch (error) {
    console.error("fetchAllReservationsAdminAPI Error:", error);
    throw error;
  }
};

/**
 * 更新預約或繳費的審核狀態 (管理員專用)
 * @param {Object} payload { reserveID, action: 'approve' | 'reject', type: 'registration' | 'payment', comment: string }
 */
export const updateReservationStatusAPI = async (payload) => {
  return await sendToGAS("updateReservationStatus", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};

/* =========================================
    📝 考試管理 API (Admin/Teacher)
   ========================================= */

// 取得所有考試清單 (原始資料格式)
export const fetchExamsRawAPI = async () => {
  const response = await sendToGAS("getExamsAdmin", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
  });
  // console.log(`Exam data:${response.data}`);
  return response.data || [];
};

// 新增考試
export const addExamAPI = async (examData) => {
  return await sendToGAS("addExam", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...examData
  });
};

// 刪除考試
export const deleteExamAPI = async (payload) => {
  const isObject = typeof payload === 'object' && payload !== null;

  return await sendToGAS("deleteExam", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    examID: isObject ? payload.examID : payload,
    captchaToken: isObject ? payload.captchaToken : undefined
  });
};

// 更新考試資訊
export const updateExamAPI = async (examData) => {
  return await sendToGAS("updateExam", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...examData
  });
};

/* =========================================
    👥 User Management API (Admin)
   ========================================= */

export const listUsersAPI = async ({ query = "", role = "" } = {}) => {
  return await sendToGAS("listUsers", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    query,
    role,
  });
};

export const setUserRoleAPI = async (targetEmail, role, captchaToken) => {
  return await sendToGAS("setUserRole", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
    role,
    captchaToken,
  });
};

export const setUserMembershipAPI = async (targetEmail, membership, captchaToken) => {
  return await sendToGAS("setUserMembership", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
    membership,
    captchaToken,
  });
};

export const adminDeleteUserAPI = async (targetEmail, captchaToken) => {
  return await sendToGAS("adminDeleteUser", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
    captchaToken,
  });
};

/* =========================================
    🔐 認證與 Google SDK 封裝
   ========================================= */

export const loginAPI = async (idToken) => {
  const res = await sendToGAS("auth", { idToken });
  // console.log(res);
  return res.data;
};

export const initGoogleAuthSDK = (clientId, callback) => {
  if (!window.google?.accounts?.id) {
    throw new Error("Google GIS SDK not loaded");
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      // 成功取得新 Token 後，更新本地儲存並清除重導向鎖定
      localStorage.setItem(STORAGE_KEYS.TOKEN, response.credential);
      isRedirectingToLogin = false;
      callback(response.credential);
    },
    use_fedcm_for_prompt: false,
  });
};

/* =========================================
    ✉️ 信件通知 API
   ========================================= */

/**
 * 發送繳費提醒信給報名者
 * @param {Object} payload { reserveID: string, targetEmail: string, subject: string, content: string }
 */
export const sendPaymentReminderAPI = async (payload) => {
  return await sendToGAS("sendPaymentReminder", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};

/**
 * 聯絡管理員信件 API (User -> Admin)
 * @param {Object} payload { subject: string, content: string }
 */
export const sendContactEmailAPI = async (payload) => {
  return await sendToGAS("sendContactEmail", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};

/**
 * 管理員發送信件給特定使用者 API (Admin -> User)
 * @param {Object} payload { targetEmail: string, subject: string, content: string }
 */
export const sendAdminEmailAPI = async (payload) => {
  return await sendToGAS("sendAdminEmail", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    ...payload
  });
};
