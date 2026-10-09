import { GAS_BASE, STORAGE_KEYS, TOKEN_EXPIRED, REDIRECT_URI } from "./config";

/* =========================================
    👋 系統喚醒 (Handshake) API
   ========================================= */

const PING_COOLDOWN = 10 * 60 * 1000;
let pingPromise = null; // 用來鎖定正在進行中的 Ping，防止重複發送

export const ensureGASAwake = async () => {
  const lastPing = localStorage.getItem(STORAGE_KEYS.LAST_PING);
  const now = Date.now();

  // 1. 檢查是否在指定的Cooldown時間內，如果是，直接放行
  if (lastPing && (now - parseInt(lastPing, 10)) < PING_COOLDOWN) {
    return true;
  }

  // 2. 如果已經有一個 Ping 正在處理中，讓其他 Request 一起等待這個 Promise 完成
  if (pingPromise) {
    return pingPromise;
  }

  // 3. 建立一個新的 Ping 請求
  pingPromise = (async () => {
    try {
      console.log("⏳ GAS 喚醒中 (Handshake)...");
      const url = `${GAS_BASE}?route=ping`;

      // 注意：這裡直接用 fetch，不透過 sendToGAS，避免無限迴圈
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ route: "ping" }), // 加上 body 雙重保險
      });

      if (!response.ok) throw new Error("Ping failed");

      // 喚醒成功，更新 LocalStorage 時間
      localStorage.setItem(STORAGE_KEYS.LAST_PING, Date.now().toString());
      console.log("GAS 喚醒成功！放行後續請求。");
      return true;

    } catch (error) {
      console.warn("GAS 喚醒異常 (可能冷啟動超時)，仍將嘗試放行後續請求:", error);
      // 即使 Ping 失敗（可能只是 Timeout），我們依然回傳 true 放行後續的真實 API，
      // 讓真實 API 去承擔真正的錯誤處理。
      return true;
    } finally {
      // 執行完畢後清除 Promise 鎖，讓下次冷卻時間過後可以重新 Ping
      pingPromise = null;
    }
  })();

  return pingPromise;
};

/**
 * 用於喚醒休眠中的 GAS 服務 (Cold Start Mitigation)
 */
export const pingGASAPI = async () => {
  try {
    // 使用現有的 sendToGAS，不帶任何參數與 Token
    const response = await sendToGAS("ping");
    console.log("GAS Handshake Success:", response.message);
    return true;
  } catch (error) {
    // 喚醒失敗不需要丟出 Error 給 UI，靜默處理即可
    console.warn("GAS Handshake Failed (Might be cold starting):", error);
    return false;
  }
};

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
 */
const calculateStatus_ = (res, exam) => {
  if (!exam) {
    return { id: "unknown", color: "#9e9e9e", text: "未知場次 / 已刪除", badge: "secondary" };
  }

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
      color: "#d9534f",
      text: isExpired ? "付款審核未通過 / 已過期" : "付款審核未通過",
      badge: isExpired ? "expired" : "danger"
    };
  }

  // 報名審核未通過：報名尚未通過、且有退件原因
  if (hasComment && !isApproved) {
    return {
      id: "rejected",
      color: "#d9534f",
      text: isExpired ? "報名審核未通過 / 已過期" : "報名審核未通過",
      badge: isExpired ? "expired" : "danger"
    };
  }

  if (isPaid) {
    return isExpired
      ? { id: "history", color: "#9E9E9E", text: "已結束 / 已過期", badge: "expired" }
      : { id: "paid", color: "#46A66F", text: "已繳費", badge: "success" };
  }

  if (isPaymentReview) {
    return isExpired
      ? { id: "history", color: "#9E9E9E", text: "繳費審核中 / 已過期", badge: "expired" }
      : { id: "payment_review", color: "#0275d8", text: "繳費審核中", badge: "primary" };
  }

  if (isApproved) {
    return isExpired
      ? { id: "history", color: "#9E9E9E", text: "未繳費 / 已過期", badge: "expired" }
      : { id: "unpaid", color: "#F09438", text: "待繳費", badge: "warning" };
  }

  return isExpired
    ? { id: "history", color: "#9E9E9E", text: "預約失效 / 已過期", badge: "expired" }
    : { id: "reviewing", color: "#907567", text: "審核中", badge: "info" };
};

/* =========================================
    🚀 核心請求函式 (包含自動偵測 Invalid Token)
   ========================================= */

const sendToGAS = async (route, bodyData = {}) => {
  // ✨ 新增：在發送真實請求前，確保 GAS 是醒著的 (排除 ping 自己)
  if (route !== "ping") {
    await ensureGASAwake();
  }

  try {
    const url = `${GAS_BASE}?route=${route}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ route, ...bodyData }), // 確保 route 有進 body
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const resData = await response.json();

    // 自動偵測 Token 是否無效
    if (!resData.ok) {
      if (resData.error && (resData.error.includes("Invalid token") || resData.error.includes("Token expired"))) {
        handleUnauthorized();
        throw new Error(TOKEN_EXPIRED);
      }
      throw new Error(resData.error || "GAS API Error");
    }
    // console.log(resData);
    return resData;
  } catch (error) {
    console.error(`API Error (${route}):`, error);
    throw error;
  }
};

/* =========================================
    📖 資料讀取類 API
   ========================================= */

// 取得使用者個人資料
export async function fetchMeAPI(token) {
  const res = await fetch(`${GAS_BASE}?route=me`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ idToken: token }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "讀取資料失敗");

  return data;
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
      textColor: isFull ? "#9E9E9E" : "#FFFFFF",
      status: exam.status,           // Open, Draft, Cancelled
      hasRegistered: exam.hasRegistered,
    };
  });
};

export const fetchSubjectsAPI = async () => {
  const response = await sendToGAS("getSubjects");
  // console.log(response);
  if (Array.isArray(response.subjects)) {
    if (response.subjects.length > 0 && typeof response.subjects[0] === 'object') {
      return response.subjects.map(s => s.subjectName);
    }
    return response.subjects;
  }
  return [];
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
  return response.data || [];
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
  const res = await fetch(`${GAS_BASE}?route=updateProfile`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "更新資料失敗");

  return data;
}

/* =========================================
    🗑️ Account Deletion (User Self Delete)
   ========================================= */

export const deleteMeAPI = async () => {
  return await sendToGAS("deleteMe", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
  });
};

/* =========================================
    ⚙️ 管理員 API (Admin)
   ========================================= */

export const addSubjectAPI = async (subjectName) => {
  return await sendToGAS("addSubject", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    subjectName: subjectName
  });
};

export const deleteSubjectAPI = async (subjectID) => {
  return await sendToGAS("deleteSubject", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    subjectID: subjectID
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

export const setUserRoleAPI = async (targetEmail, role) => {
  return await sendToGAS("setUserRole", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
    role,
  });
};

export const setUserMembershipAPI = async (targetEmail, membership) => {
  return await sendToGAS("setUserMembership", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
    membership,
  });
};

export const adminDeleteUserAPI = async (targetEmail) => {
  return await sendToGAS("adminDeleteUser", {
    idToken: localStorage.getItem(STORAGE_KEYS.TOKEN),
    targetEmail,
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