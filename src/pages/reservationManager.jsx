import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchAllReservationsAdminAPI,
  updateReservationStatusAPI,
  sendPaymentReminderAPI,
} from "../api";
import { adminReserveStatus, REGISTRATION_DEADLINE_DAYS, DEADLINE_CONFIG } from "../config";
import { confirmDialog, notify } from "../dialog";
import StatusTabs from "../components/statusTabs";
import PaymentProof from "../features/booking/PaymentProof.jsx";
import RequestProcessModal from "../features/booking/RequestProcess.jsx";
import ResultEntryModal from "../features/booking/ResultEntry.jsx";
import { examStarted, isOpenRequest, isTrue, requestFromReservation, requestStatuses, requestTones, resultSummary } from "../features/booking/utils";

// 可以登記成績的報名：已繳費、沒有取消、考試已經開始
const canRecordResult = (res) => res.reservationStatus !== "cancelled" && isTrue(res.paymentStatus) && examStarted(res);

const safeText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
};

const getUserPhone = (res) => res.phone || res.phoneNumber || "-";
const getUserEmail = (res) => res.email || res.userEmail || res.memberEmail || "-";
const getPaymentInfo = (res) => {
  const pd = res.paymentData || {};
  const rawImageUrl = pd.imageUrl || res.paymentProofUrl || res.paymentImageUrl || res.paymentInfo?.imageUrl || res.payment?.imageUrl || res.proofUrl || "";

  return {
    transactionID: pd.transactionID || "-",
    method: pd.paymentMethod || res.paymentMethod || res.paymentInfo?.paymentMethod || res.payment?.paymentMethod || "-",
    amount: pd.amount === "" || pd.amount == null ? Number(res.amountDue ?? res.examInfo?.fee ?? 0) : Number(pd.amount),
    fileName: pd.filename || res.fileName || res.paymentFileName || res.paymentInfo?.fileName || res.payment?.fileName || "-",
    uploadedAt: pd.createdAt || res.paymentUploadedAt || res.updatedAt || res.paymentInfo?.uploadedAt || res.payment?.uploadedAt || "",
    // 只接受 http(s) 連結，避免 javascript: 等惡意網址被管理員點開
    imageUrl: /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : "",
  };
};

const formatDateTime = (timeStr) => {
  if (!timeStr) return "時間未定";
  const date = new Date(timeStr);
  if (Number.isNaN(date.getTime())) return "時間未定";

  return `${date.toLocaleDateString("zh-TW")} ${date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
};

const getDurationHours = (start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, Math.floor((e - s) / (1000 * 60 * 60)));
};

export default function ReservationManager() {
  const { user, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState("reviewing");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- 篩選器狀態 ---
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [tempContactQuery, setTempContactQuery] = useState("");

  const [openFilterMenu, setOpenFilterMenu] = useState(null);

  // modal
  const [selectedReservation, setSelectedReservation] = useState(null);
  // 退費申請分頁點選的那一件申請
  const [refundRequest, setRefundRequest] = useState(null);
  // 成績登記分頁點選的那一筆報名
  const [resultTarget, setResultTarget] = useState(null);
  const [reviewAction, setReviewAction] = useState("approve");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 寄信提醒 Modal 狀態
  const [reminderReservation, setReminderReservation] = useState(null);
  const [reminderForm, setReminderForm] = useState({ subject: "", content: "" });

  const isTeacher = useMemo(
    () => user?.role === "admin" || user?.role === "teacher",
    [user]
  );

  const activeTabInfo = useMemo(
    () => adminReserveStatus.find((tab) => tab.id === activeTab) || adminReserveStatus[0],
    [activeTab]
  );

  // 退費只有管理員能處理 (後端也只把退款帳戶給管理員)，老師不顯示這個分頁
  const tabs = useMemo(
    () => (user?.role === "admin" ? adminReserveStatus : adminReserveStatus.filter((tab) => tab.id !== "refund")),
    [user]
  );
  const isRefundTab = activeTab === "refund";
  const isResultTab = activeTab === "results";

  const availableSubjects = useMemo(() => {
    const names = reservations.map(r => r.examInfo?.subjectName).filter(Boolean);
    return [...new Set(names)];
  }, [reservations]);

  const availableRooms = useMemo(() => {
    const filteredRes = subjectFilter
      ? reservations.filter(r => r.examInfo?.subjectName === subjectFilter)
      : reservations;
    const rooms = filteredRes.map(r => r.examInfo?.location).filter(Boolean);
    return [...new Set(rooms)];
  }, [reservations, subjectFilter]);

  const fetchReservations = useCallback(async () => {
    setSubmit(false); // ✅ 確保一開始拉取資料時關閉 Submit 狀態
    setIsRefreshing(true);
    setLoadingText("正在取得預約資料...");
    setGlobalLoading(true);

    try {
      const data = await fetchAllReservationsAdminAPI();
      setReservations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("fetchAllReservationsAdminAPI error:", error);
      notify("讀取預約資料失敗：" + error.message);
    } finally {
      setGlobalLoading(false);
      setIsRefreshing(false);
      setLoadingText("");
    }
  }, [setGlobalLoading, setLoadingText, setSubmit]);

  useEffect(() => {
    if (user && !isTeacher) {
      notify("權限不足，將返回首頁");
      navigate("/");
      return;
    }
    if (user && isTeacher) {
      fetchReservations();
    }
  }, [user, isTeacher, navigate, fetchReservations]);

  useEffect(() => {
    setTempContactQuery(contactQuery);
  }, [contactQuery]);

  useEffect(() => {
    const closeMenu = () => setOpenFilterMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const handleApplyContactSearch = () => {
    setContactQuery(tempContactQuery.trim());
    setOpenFilterMenu(null);
  };

  // 各分頁的筆數 (只計尚未開考的場次，不受欄位篩選影響)
  const tabCounts = useMemo(() => {
    const now = new Date();
    const counts = {};
    reservations.forEach((res) => {
      // 退費申請不受開考時間限制：考試過了也要能退
      if (res.request?.type === "refund" && isOpenRequest(res.request)) counts.refund = (counts.refund || 0) + 1;
      // 成績登記的數字是「還沒登記」的筆數
      if (canRecordResult(res) && !res.attendance) counts.results = (counts.results || 0) + 1;
      if (!res.examInfo?.examStartTime || new Date(res.examInfo.examStartTime) <= now) return;
      const badge = res.statusInfo?.badge;
      counts[badge] = (counts[badge] || 0) + 1;
    });
    return counts;
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    const now = new Date();

    let filtered = activeTabInfo.id === "refund"
      ? reservations.filter((res) => res.request?.type === "refund" && isOpenRequest(res.request))
      : activeTabInfo.id === "results" ? reservations.filter(canRecordResult)
      : reservations.filter((res) => {
        if (!res.examInfo?.examStartTime) return false;
        return new Date(res.examInfo.examStartTime) > now && res.statusInfo?.badge === activeTabInfo.badge;
      });

    // 退費申請的件數不多，而且不能漏看，所以不套用科目／考場／日期篩選 (這些篩選預設會選第一個科目與考場)
    const useColumnFilters = activeTabInfo.id !== "refund";

    if (useColumnFilters && subjectFilter) {
      filtered = filtered.filter((res) => res.examInfo?.subjectName === subjectFilter);
    }

    if (useColumnFilters && roomFilter) {
      filtered = filtered.filter((res) => res.examInfo?.location === roomFilter);
    }

    if (useColumnFilters && dateFilter) {
      filtered = filtered.filter((res) => {
        if (!res.examInfo?.examStartTime) return false;
        const examDateObj = new Date(res.examInfo.examStartTime);
        if (Number.isNaN(examDateObj.getTime())) return false;
        const pad = n => n < 10 ? '0' + n : n;
        const examDateStr = `${examDateObj.getFullYear()}-${pad(examDateObj.getMonth() + 1)}-${pad(examDateObj.getDate())}`;
        return examDateStr === dateFilter;
      });
    }

    if (contactQuery) {
      const lower = contactQuery.toLowerCase();
      filtered = filtered.filter((res) => {
        const fullname = `${res.lastname || ""}${res.firstname || ""}`;
        const fullnameWithSpace = `${res.lastname || ""} ${res.firstname || ""}`;
        const email = getUserEmail(res);
        const phone = getUserPhone(res);
        const reserveID = res.reserveID || "";

        return [fullname, fullnameWithSpace, email, phone, reserveID]
          .join("|||")
          .toLowerCase()
          .includes(lower);
      });
    }

    // 成績登記：還沒登記的排前面，其次是最近考的
    if (activeTabInfo.id === "results") {
      return filtered.sort((a, b) => (a.attendance ? 1 : 0) - (b.attendance ? 1 : 0) || new Date(b.examInfo?.examStartTime || 0) - new Date(a.examInfo?.examStartTime || 0));
    }

    return filtered.sort((a, b) => new Date(a.reservedAt || 0) - new Date(b.reservedAt || 0));
  }, [reservations, activeTabInfo, subjectFilter, dateFilter, roomFilter, contactQuery]);

  // 篩選預設為「全部」，避免側欄總數與清單因預選第一個科目／考場而不一致。
  const hasColumnFilters = Boolean(subjectFilter || roomFilter || dateFilter || contactQuery);
  const showClearButton = hasColumnFilters;

  const openReviewModal = (res) => {
    const badge = res.statusInfo?.badge;
    if (badge !== "info" && badge !== "primary") return;

    setSelectedReservation(res);
    console.log(res);
    setReviewAction("approve");
    setReviewComment("");
  };

  const openReminderModal = (res) => {
    const examDate = new Date(res.examInfo?.examStartTime);
    const deadlineDate = new Date(res.paymentDeadline || examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000);
    const timeDiff = deadlineDate.getTime() - new Date().getTime();
    const daysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
    const deadlineDateStr = `${deadlineDate.getFullYear()}-${String(deadlineDate.getMonth() + 1).padStart(2, "0")}-${String(deadlineDate.getDate()).padStart(2, "0")}`;

    const subjectName = res.examInfo?.subjectName || "未知考試";
    const examTimeStr = formatDateTime(res.examInfo?.examStartTime);
    const location = res.examInfo?.location || "未註明地點";
    const roomPhone = res.examInfo?.roomPhone ? ` (電話: ${res.examInfo.roomPhone})` : "";
    const fullName = `${safeText(res.lastname, "")}${safeText(res.firstname, "")}`;
    const fee = Math.max(0, Number(res.amountDue || 0) - Number(res.paidAmount || 0));

    setReminderForm({
      subject: `【繳費提醒】${subjectName} 報名繳費通知`,
      content: `您好 ${fullName}，\n\n您報名的「${subjectName}」即將到達繳費期限。\n\n【報名資訊】\n報名序號：${res.reserveID}\n考試時間：${examTimeStr}\n考場地點：${location}${roomPhone}\n報名費用：${fee} 元\n\n繳費期限為：${deadlineDateStr} (距離今天剩餘 ${daysLeft} 天)。\n\n請盡快登入系統完成付款，並上傳繳費證明。\n若您已完成付款，請忽略此信，謝謝！`
    });
    setReminderReservation(res);
  };

  const closeModal = () => {
    setSelectedReservation(null);
    setReviewAction("approve");
    setReviewComment("");
  };

  const closeReminderModal = () => {
    setReminderReservation(null);
    setReminderForm({ subject: "", content: "" });
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    const confirmedAmount = new FormData(e.currentTarget).get("confirmedAmount");
    if (!selectedReservation) return;

    const currentBadge = selectedReservation.statusInfo?.badge;
    const type = currentBadge === "primary" ? "payment" : "registration";

    if (reviewAction === "reject" && !reviewComment.trim()) {
      notify("選擇不通過時，請填寫未通過原因。");
      return;
    }

    const confirmText =
      reviewAction === "approve"
        ? `確定要通過這筆${type === "payment" ? "付款" : "報名"}申請嗎？`
        : `確定要退回這筆${type === "payment" ? "付款" : "報名"}申請嗎？`;

    if (!(await confirmDialog(confirmText))) return;

    // ✅ 呼叫全域驗證
    const token = await requestCaptcha();
    if (!token) return;

    setIsSubmitting(true);
    setSubmit(true); // ✅ 開啟全域 Submit 狀態
    setLoadingText("正在送出審核結果...");
    setGlobalLoading(true);

    try {
      await updateReservationStatusAPI({
        reserveID: selectedReservation.reserveID,
        action: reviewAction,
        type,
        comment: reviewAction === "reject" ? reviewComment.trim() : "",
        confirmedAmount,
        token // ✅ 傳遞 Token
      });

      notify(reviewAction === "approve" ? "審核通過成功！" : "退件成功！");
      closeModal();
      await fetchReservations(); // ✅ 等待資料重新抓取完畢，Loading 畫面才會消失
    } catch (error) {
      console.error("updateReservationStatusAPI error:", error);
      notify("送出審核結果失敗：" + error.message);
    } finally {
      setIsSubmitting(false);
      setSubmit(false); // ✅ 關閉 Submit
      setGlobalLoading(false);
      setLoadingText("");
    }
  };

  const handleSendReminder = async (e) => {
    e.preventDefault();
    if (!reminderReservation) return;

    if (!(await confirmDialog("確定要發送這封繳費提醒信嗎？"))) return;

    // ✅ 呼叫全域驗證
    const token = await requestCaptcha();
    if (!token) return;

    setIsSubmitting(true);
    setSubmit(true); // ✅ 開啟全域 Submit 狀態
    setLoadingText("正在發送信件...");
    setGlobalLoading(true);

    try {
      await sendPaymentReminderAPI({
        reserveID: reminderReservation.reserveID,
        targetEmail: getUserEmail(reminderReservation),
        subject: reminderForm.subject,
        content: reminderForm.content,
        token // ✅ 傳遞 Token
      });

      notify("提醒信件已排入發送佇列。");
      closeReminderModal();
    } catch (error) {
      console.error("sendPaymentReminderAPI error:", error);
      notify("發送信件失敗：" + error.message);
    } finally {
      setIsSubmitting(false);
      setSubmit(false); // ✅ 關閉 Submit
      setGlobalLoading(false);
      setLoadingText("");
    }
  };

  if (!user || !isTeacher) return null;

  // 手動更新處理
  const handleRefresh = async () => {
    await fetchReservations();
  };

  return (
    <div className="manager-wrapper">
      <div className="manager-container">
        {/* 左側：狀態切換 */}
        <div className="centered-form side-panel add-panel" title="篩選預約狀態">
          <h3>預約審核</h3>

          <StatusTabs
            tabs={tabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            getCount={(tab) => tabCounts[tab.badge] || 0}
          />
        </div>

        {/* 右側：列表 */}
        <div className="centered-form side-panel list-panel" title="預約詳細內容">
          <div className="list-panel-header">

            {/* 👉 將標題和重新整理按鈕包在一個 div 內 */}
            <div className="list-title-row">
              <h3>{activeTabInfo.label}</h3>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`btn-refresh ${isRefreshing ? "is-loading" : ""}`}
                title="重新整理"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                  <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                </svg>
              </button>
            </div>

            {/* 清除篩選按鈕 */}
            {showClearButton && (
              <button
                className="clear-filter-btn"
                onClick={() => {
                  setSubjectFilter("");
                  setRoomFilter("");
                  setDateFilter("");
                  setContactQuery("");
                  setTempContactQuery("");
                }}
              >
                清除篩選
              </button>
            )}
          </div>

          <div className={`list-header-row reservation-column ${isRefundTab ? "no-filters" : ""}`}>
            {/* 1. 科目篩選 */}
            <div
              className="header-cell subject-col filterable"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilterMenu(openFilterMenu === "subject" ? null : "subject");
              }}
            >
              考試科目
              <i
                className={`fa-solid fa-filter ${subjectFilter ? "active" : ""}`}
              ></i>

              {openFilterMenu === "subject" && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={subjectFilter}
                    onChange={(e) => {
                      setSubjectFilter(e.target.value);
                      setRoomFilter("");
                      setOpenFilterMenu(null);
                    }}
                  >
                    <option value="">全部科目</option>
                    {availableSubjects.map((subName) => (
                      <option key={subName} value={subName}>
                        {subName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 2. 時間篩選 */}
            <div
              className="header-cell time-col filterable"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilterMenu(openFilterMenu === "date" ? null : "date");
              }}
            >
              時間
              <i
                className={`fa-solid fa-filter ${dateFilter ? "active" : ""}`}
              ></i>

              {openFilterMenu === "date" && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => {
                      setDateFilter(e.target.value);
                      setOpenFilterMenu(null);
                    }}
                  />
                </div>
              )}
            </div>

            {/* 3. 地點篩選 */}
            <div
              className="header-cell room-col filterable"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilterMenu(openFilterMenu === "room" ? null : "room");
              }}
            >
              地點
              <i
                className={`fa-solid fa-filter ${roomFilter ? "active" : ""}`}
              ></i>

              {openFilterMenu === "room" && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={roomFilter}
                    onChange={(e) => {
                      setRoomFilter(e.target.value);
                      setOpenFilterMenu(null);
                    }}
                  >
                    <option value="">全部地點</option>
                    {availableRooms.map((roomName) => (
                      <option key={roomName} value={roomName}>
                        {roomName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 4. 聯絡資訊篩選 */}
            <div
              className="header-cell contact-col filterable"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilterMenu(openFilterMenu === "contact" ? null : "contact");
              }}
            >
              聯絡資訊
              <i
                className={`fa-solid fa-filter ${contactQuery ? "active" : ""}`}
              ></i>

              {openFilterMenu === "contact" && (
                <div
                  className="header-filter-dropdown filter-search"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={tempContactQuery}
                    onChange={(e) => setTempContactQuery(e.target.value)}
                    placeholder="姓名, Email, 序號..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyContactSearch();
                    }}
                  />
                  <button onClick={handleApplyContactSearch} className="btn-primary" type="button">
                    搜尋
                  </button>
                </div>
              )}
            </div>

            <div className="header-cell">狀態</div>
          </div>

          <div className="scroll-area reserved-content">
            {filteredReservations.length === 0 ? (
              <div className="empty-state">
                <i className="fa-regular fa-folder-open"></i>
                <p>{hasColumnFilters ? "目前的篩選條件沒有符合項目" : `目前沒有${activeTabInfo.label}的項目`}</p>
                {hasColumnFilters && <button type="button" className="btn-primary" onClick={() => {
                  setSubjectFilter(""); setRoomFilter(""); setDateFilter(""); setContactQuery(""); setTempContactQuery("");
                }}>清除篩選，查看全部</button>}
              </div>
            ) : (
              <ul className="modern-list manager-list">
                {filteredReservations.map((res) => {
                  const { reserveID, additional, examInfo, statusInfo, comment } = res;

                  const subjectName = examInfo?.subjectName || "未知考試";
                  const location = examInfo?.location || "未註明地點";
                  const examTimeStr = formatDateTime(examInfo?.examStartTime);
                  const duration = getDurationHours(examInfo?.examStartTime, examInfo?.examEndTime);
                  const fullName = `${safeText(res.lastname, "")}${safeText(res.firstname, "")}` || "-";
                  const email = getUserEmail(res);
                  const phone = getUserPhone(res);

                  // 報名審核、付款審核、待付款皆允許點擊
                  const isClickable = isRefundTab || isResultTab || statusInfo?.badge === "info" || statusInfo?.badge === "primary" || statusInfo?.badge === "warning";
                  // 退費申請分頁的顏色與標籤跟著申請的進度，其他分頁跟著報名狀態
                  const [resultText, resultTone] = resultSummary(res);
                  const tone = isRefundTab ? requestTones[res.request?.status] || "muted"
                    : isResultTab ? (res.attendance ? resultTone : "pending")
                      : statusInfo?.tone || "muted";

                  // 計算待付款的剩餘天數
                  let daysLeftElement = null;
                  if ((statusInfo?.badge === "warning" || statusInfo?.badge === "info") && examInfo?.examStartTime) {
                    const examDate = new Date(examInfo.examStartTime);
                    const deadlineDate = new Date(res.paymentDeadline || examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000);
                    const daysLeft = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));

                    let deadlineLevel = "safe"; // 對應 CSS 的 .deadline-safe / -warning / -urgent
                    if (daysLeft <= DEADLINE_CONFIG.URGENT_DAYS) deadlineLevel = "urgent";
                    else if (daysLeft <= DEADLINE_CONFIG.WARNING_DAYS) deadlineLevel = "warning";

                    daysLeftElement = (
                      <span className={`additional-tag deadline-${deadlineLevel}`}>
                        <i className="fa-regular fa-clock"></i>
                        剩餘 {Math.max(0, daysLeft)} 天
                      </span>
                    );
                  }

                  return (
                    <li
                      key={reserveID}
                      className={`list-item tone-${tone} ${isClickable ? "clickable" : ""}`}
                      onClick={() => {
                        if (isRefundTab) {
                          setRefundRequest(requestFromReservation(res));
                        } else if (isResultTab) {
                          setResultTarget(res);
                        } else if (statusInfo?.badge === "info" || statusInfo?.badge === "primary") {
                          openReviewModal(res);
                        } else if (statusInfo?.badge === "warning") {
                          openReminderModal(res);
                        }
                      }}
                      title={
                        isRefundTab ? "點擊處理退費申請"
                          : isResultTab ? "點擊登記成績"
                          : statusInfo?.badge === "info" ? "點擊審核報名"
                          : statusInfo?.badge === "primary" ? "點擊審核付款"
                            : statusInfo?.badge === "warning" ? "點擊發送繳費提醒"
                              : ""
                      }
                    >
                      <div className="item-info">
                        <div className="text-group reservation-column">
                          <div className="subject-info">
                            <span className="name">{subjectName}</span>
                            <span className="reserve-id-label">
                              #{reserveID}
                            </span>
                          </div>

                          <div className="time-info">
                            <i className="fa-regular fa-calendar-check"></i>
                            <div className="time-text">
                              <span>{examTimeStr}</span>
                              {duration > 0 && <span> ({duration} 小時)</span>}
                            </div>
                          </div>

                          <div className="location-info">
                            <span>
                              <i
                                className="fa-solid fa-location-dot"
                              ></i>
                              {location}
                            </span>
                          </div>

                          <div className="personal-info">
                            <div className="personal-info-div">
                              <span>
                                <i
                                  className="fa-solid fa-user"
                                ></i>
                                {fullName}
                              </span>
                              <span >
                                <i
                                  className="fa-solid fa-envelope"
                                ></i>
                                {email}
                              </span>
                              <span >
                                <i
                                  className="fa-solid fa-phone"
                                ></i>
                                {phone}
                              </span>
                            </div>
                          </div>

                          {statusInfo?.badge === "danger" && comment && (
                            <div className="rejection-box">
                              <i className="fa-solid fa-circle-exclamation"></i>
                              {comment}
                            </div>
                          )}

                          <div className="item-actions status-tags">
                            {additional && (
                              <span className="additional-tag">
                                <i className="fa-solid fa-certificate"></i>需證書
                              </span>
                            )}

                            {daysLeftElement}

                            <span className="reviewStatus">
                              {isRefundTab ? `退費${requestStatuses[res.request?.status] || "申請"}` : isResultTab ? (res.attendance ? resultText : "待登記成績") : statusInfo?.text}
                              {isClickable && (
                                <i className={statusInfo?.badge === "warning" ? "fa-solid fa-envelope" : "fa-solid fa-pen-to-square"}></i>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 審核 Modal */}
      {selectedReservation &&
        createPortal(
          <ReviewModal
            reservation={selectedReservation}
            reviewAction={reviewAction}
            setReviewAction={setReviewAction}
            reviewComment={reviewComment}
            setReviewComment={setReviewComment}
            onClose={closeModal}
            onSubmit={handleSubmitReview}
            isSubmitting={isSubmitting}
          />,
          document.body
        )}

      {/* 處理退費申請 */}
      {refundRequest && (
        <RequestProcessModal request={refundRequest} onClose={() => setRefundRequest(null)} onDone={fetchReservations} />
      )}

      {/* 登記成績 */}
      {resultTarget && (
        <ResultEntryModal reservation={resultTarget} onClose={() => setResultTarget(null)} onDone={fetchReservations} />
      )}

      {/* 寄信提醒 Modal */}
      {reminderReservation &&
        createPortal(
          <div className="modal-overlay" onClick={closeReminderModal}>
            <div className="modal-content exam-form-modal reminder-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close" aria-label="關閉" title="關閉" onClick={closeReminderModal}>&times;</button>
              <h3>發送繳費提醒信</h3>
              <p className="modal-subtitle">系統已自動為您帶入繳費與考試資訊，您可以直接修改內容後送出。</p>

              <form onSubmit={handleSendReminder} className="exam-form">
                <div className="form-group">
                  <label>收件人</label>
                  <input type="text" value={getUserEmail(reminderReservation)} disabled className="input-disabled" />
                </div>
                <div className="form-group">
                  <label>主旨</label>
                  <input type="text" value={reminderForm.subject} onChange={(e) => setReminderForm({ ...reminderForm, subject: e.target.value })} required disabled={isSubmitting} />
                </div>
                <div className="form-group">
                  <label>信件內容</label>
                  <textarea
                    rows={12}
                    value={reminderForm.content}
                    onChange={(e) => setReminderForm({ ...reminderForm, content: e.target.value })}
                    required
                    disabled={isSubmitting}
                    className="reminder-textarea"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeReminderModal} disabled={isSubmitting}>取消</button>
                  <button type="submit" className="btn-confirm" disabled={isSubmitting}>
                    {isSubmitting ? "發送中..." : "確認發送"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// 付款審核 Modal
function ReviewModal({
  reservation,
  reviewAction,
  setReviewAction,
  reviewComment,
  setReviewComment,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const isPaymentReview = reservation.statusInfo?.badge === "primary";
  const paymentInfo = getPaymentInfo(reservation);

  const subjectName = reservation.examInfo?.subjectName || "未知考試";
  const examTimeStr = formatDateTime(reservation.examInfo?.examStartTime);
  const location = reservation.examInfo?.location || "未註明地點";
  const fullName = `${safeText(reservation.lastname, "")}${safeText(reservation.firstname, "")}` || "-";
  const isReject = reviewAction === "reject";

  // 審核表單 (報名審核與付款審核共用)
  const reviewForm = (
    <form onSubmit={onSubmit} className="exam-form review-form">
      {isPaymentReview && reviewAction === "approve" && <div className="form-group"><label htmlFor="confirmed-payment-amount">實際確認收款金額（請核對付款證明）</label><input id="confirmed-payment-amount" name="confirmedAmount" type="number" min="1" step="1" required defaultValue={paymentInfo.amount || ""} disabled={isSubmitting} /></div>}
      <div className="form-group">
        <label>審核結果</label>
        <select
          value={reviewAction}
          onChange={(e) => setReviewAction(e.target.value)}
          disabled={isSubmitting}
        >
          <option value="approve">通過</option>
          <option value="reject">不通過</option>
        </select>
      </div>

      <div className="form-group">
        <label>
          未通過原因
          {isReject && <span className="required-mark"> *</span>}
        </label>
        <textarea
          rows={3}
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
          placeholder="請輸入未通過原因"
          required={isReject}
          disabled={isSubmitting}
        />
      </div>

      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
          取消
        </button>
        {/* 退件是影響報名者的操作，按鈕改用警示色並寫明動作 */}
        <button type="submit" className={`btn-confirm ${isReject ? "btn-danger" : ""}`} disabled={isSubmitting}>
          {isSubmitting ? "送出中..." : isReject ? "確認退件" : "確認通過"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content exam-form-modal ${isPaymentReview ? "review-modal-wide" : "review-modal-narrow"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="關閉" title="關閉" onClick={onClose}>&times;</button>
        <h3 className="review-modal-title">{isPaymentReview ? "審核付款資訊" : "審核報名資訊"}</h3>

        <div className={isPaymentReview ? "review-modal-layout" : "review-modal-layout-block"}>

          {/* 報名資訊與審核表單 */}
          <div className="review-modal-main">
            <div className="modal-info-block info-grid">
              <p><strong>報名序號</strong><span>{safeText(reservation.reserveID)}</span></p>
              <p><strong>考試科目</strong><span>{subjectName}</span></p>
              <p><strong>考試時間</strong><span>{examTimeStr}</span></p>
              <p><strong>考場地點</strong><span>{location}</span></p>
            </div>

            <div className="modal-info-block applicant-highlight info-grid">
              <p><strong>報考人姓名</strong><span>{fullName}</span></p>
              <p><strong>聯絡電話</strong><span>{getUserPhone(reservation)}</span></p>
              <p><strong>電子郵件</strong><span>{getUserEmail(reservation)}</span></p>
              <p><strong>Certiport 帳號</strong><span>{safeText(reservation.certiportAccount)}</span></p>
              <p><strong>考試語言</strong><span>{safeText(reservation.language, "預設語言")}</span></p>
              <p><strong>加值方案</strong><span>{reservation.additional ? "有加購" : "無"}</span></p>
            </div>

            {reviewForm}
          </div>

          {/* 付款明細與付款證明 (僅在付款審核時出現) */}
          {isPaymentReview && (
            <div className="payment-detail-block">
              <h4>付款明細</h4>

              <div className="info-grid">
                <p><strong>交易序號</strong><span>{paymentInfo.transactionID}</span></p>
                <p><strong>付款方式</strong><span>{paymentInfo.method}</span></p>
                <p><strong>應付金額</strong><span>{paymentInfo.amount !== "-" ? `${paymentInfo.amount}` : "未提供"}</span></p>
                <p><strong>付款時間</strong><span>{paymentInfo.uploadedAt ? formatDateTime(paymentInfo.uploadedAt) : "-"}</span></p>
                <p className="info-grid-wide"><strong>檔案名稱</strong><span>{paymentInfo.fileName}</span></p>
              </div>

              <PaymentProof reserveID={reservation.reserveID} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
