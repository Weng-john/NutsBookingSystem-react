import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchAllReservationsAdminAPI,
  updateReservationStatusAPI,
  sendPaymentReminderAPI,
} from "../api";
import { adminReserveStatus, REGISTRATION_DEADLINE_DAYS, CERTIPORT_FEE, DEADLINE_CONFIG } from "../config";

const safeText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
};

const getUserPhone = (res) => res.phone || res.phoneNumber || "-";
const getUserEmail = (res) => res.email || res.userEmail || res.memberEmail || "-";
const getPaymentInfo = (res) => {
  const pd = res.paymentData || {};
  console.log(res)

  return {
    transactionID: pd.transactionID || "-",
    method: pd.paymentMethod || res.paymentMethod || res.paymentInfo?.paymentMethod || res.payment?.paymentMethod || "-",
    amount: res.examInfo.fee + (res.additional ? CERTIPORT_FEE : 0),
    fileName: pd.filename || res.fileName || res.paymentFileName || res.paymentInfo?.fileName || res.payment?.fileName || "-",
    uploadedAt: pd.createdAt || res.paymentUploadedAt || res.updatedAt || res.paymentInfo?.uploadedAt || res.payment?.uploadedAt || "",
    imageUrl: pd.imageUrl || res.paymentProofUrl || res.paymentImageUrl || res.paymentInfo?.imageUrl || res.payment?.imageUrl || res.proofUrl || "",
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

  useEffect(() => {
    if (availableSubjects.length > 0 && !subjectFilter) {
      setSubjectFilter(availableSubjects[0]);
    }
  }, [availableSubjects, subjectFilter]);

  useEffect(() => {
    if (availableRooms.length > 0) {
      if (!availableRooms.includes(roomFilter)) {
        setRoomFilter(availableRooms[0]);
      }
    } else {
      setRoomFilter("");
    }
  }, [availableRooms, roomFilter]);

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
      alert("讀取預約資料失敗：" + error.message);
    } finally {
      setGlobalLoading(false);
      setIsRefreshing(false);
      setLoadingText("");
    }
  }, [setGlobalLoading, setLoadingText, setSubmit]);

  useEffect(() => {
    if (user && !isTeacher) {
      alert("權限不足，將返回首頁");
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

  const filteredReservations = useMemo(() => {
    const now = new Date();

    let filtered = reservations.filter((res) => {
      if (!res.examInfo?.examStartTime) return false;
      return new Date(res.examInfo.examStartTime) > now;
    });

    filtered = filtered.filter((res) => res.statusInfo?.badge === activeTabInfo.badge);

    if (subjectFilter) {
      filtered = filtered.filter((res) => res.examInfo?.subjectName === subjectFilter);
    }

    if (roomFilter) {
      filtered = filtered.filter((res) => res.examInfo?.location === roomFilter);
    }

    if (dateFilter) {
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

    return filtered.sort((a, b) => new Date(a.reservedAt || 0) - new Date(b.reservedAt || 0));
  }, [reservations, activeTabInfo, subjectFilter, dateFilter, roomFilter, contactQuery]);

  const isSubjectModified = availableSubjects.length > 0 && subjectFilter !== availableSubjects[0];
  const isRoomModified = availableRooms.length > 0 && roomFilter !== availableRooms[0];
  const showClearButton = dateFilter || contactQuery || isSubjectModified || isRoomModified;

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
    const deadlineDate = new Date(examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000);
    const timeDiff = deadlineDate.getTime() - new Date().getTime();
    const daysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
    const deadlineDateStr = `${deadlineDate.getFullYear()}-${String(deadlineDate.getMonth() + 1).padStart(2, "0")}-${String(deadlineDate.getDate()).padStart(2, "0")}`;

    const subjectName = res.examInfo?.subjectName || "未知考試";
    const examTimeStr = formatDateTime(res.examInfo?.examStartTime);
    const location = res.examInfo?.location || "未註明地點";
    const roomPhone = res.examInfo?.roomPhone ? ` (電話: ${res.examInfo.roomPhone})` : "";
    const fullName = `${safeText(res.lastname, "")}${safeText(res.firstname, "")}`;
    const fee = res.examInfo?.fee + (res.additional ? CERTIPORT_FEE : 0) || "未定";

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
    if (!selectedReservation) return;

    const currentBadge = selectedReservation.statusInfo?.badge;
    const type = currentBadge === "primary" ? "payment" : "registration";

    if (reviewAction === "reject" && !reviewComment.trim()) {
      alert("選擇不通過時，請填寫未通過原因。");
      return;
    }

    const confirmText =
      reviewAction === "approve"
        ? `確定要通過這筆${type === "payment" ? "付款" : "報名"}申請嗎？`
        : `確定要退回這筆${type === "payment" ? "付款" : "報名"}申請嗎？`;

    if (!window.confirm(confirmText)) return;

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
        token // ✅ 傳遞 Token
      });

      alert(reviewAction === "approve" ? "審核通過成功！" : "退件成功！");
      closeModal();
      await fetchReservations(); // ✅ 等待資料重新抓取完畢，Loading 畫面才會消失
    } catch (error) {
      console.error("updateReservationStatusAPI error:", error);
      alert("送出審核結果失敗：" + error.message);
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

    if (!window.confirm("確定要發送這封繳費提醒信嗎？")) return;

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

      alert("提醒信件發送成功！");
      closeReminderModal();
    } catch (error) {
      console.error("sendPaymentReminderAPI error:", error);
      alert("發送信件失敗：" + error.message);
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

          <div className="status-vertical-menu">
            {adminReserveStatus.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-item-btn ${isActive ? "active" : ""}`}
                  style={{
                    backgroundColor: isActive ? "#594945" : "#eaeaea",
                    color: isActive ? "#fff" : "#594945",
                    boxShadow: isActive ? "0 4px 12px #59494575" : "none",
                    fontWeight: isActive ? "600" : "400",
                  }}
                >
                  <span>
                    <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
                  </span>
                  {isActive && <i className="fa-solid fa-chevron-right"></i>}
                </button>
              );
            })}
          </div>
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
                className="btn-refresh"
                style={{
                  cursor: isRefreshing ? 'not-allowed' : 'pointer',
                  transform: isRefreshing ? 'rotate(360deg)' : 'none',
                  transition: isRefreshing ? 'transform 1s linear infinite' : 'all 1s'
                }}
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
                  setSubjectFilter(availableSubjects[0] || "");
                  setDateFilter("");
                  setContactQuery("");
                  setTempContactQuery("");
                }}
              >
                清除篩選
              </button>
            )}
          </div>

          <div className="list-header-row reservation-column">
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
                className="fa-solid fa-filter"
                style={{ marginLeft: "6px", color: subjectFilter ? "#d9534f" : "#ccc" }}
              ></i>

              {openFilterMenu === "subject" && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={subjectFilter}
                    onChange={(e) => {
                      setSubjectFilter(e.target.value);
                      setOpenFilterMenu(null);
                    }}
                  >
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
                className="fa-solid fa-filter filter-icon"
                style={{ color: dateFilter ? "#d9534f" : "#ccc" }}
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
                className="fa-solid fa-filter filter-icon"
                style={{ color: roomFilter ? "#d9534f" : "#ccc" }}
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
                className="fa-solid fa-filter filter-icon"
                style={{ color: contactQuery ? "#d9534f" : "#ccc" }}
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
                <p>目前沒有{activeTabInfo.label}的項目</p>
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
                  const isClickable = statusInfo?.badge === "info" || statusInfo?.badge === "primary" || statusInfo?.badge === "warning";

                  // 計算待付款的剩餘天數
                  let daysLeftElement = null;
                  if ((statusInfo?.badge === "warning" || statusInfo?.badge === "info") && examInfo?.examStartTime) {
                    const examDate = new Date(examInfo.examStartTime);
                    const deadlineDate = new Date(examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000);
                    const daysLeft = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));

                    let tagColor = DEADLINE_CONFIG.COLORS.SAFE;
                    if (daysLeft <= DEADLINE_CONFIG.URGENT_DAYS) tagColor = DEADLINE_CONFIG.COLORS.URGENT;
                    else if (daysLeft <= DEADLINE_CONFIG.WARNING_DAYS) tagColor = DEADLINE_CONFIG.COLORS.WARNING;

                    daysLeftElement = (
                      <span className="additional-tag" style={{ color: tagColor, borderColor: tagColor, backgroundColor: `${tagColor}15` }}>
                        <i className="fa-regular fa-clock" style={{ marginRight: "4px", color: tagColor }}></i>
                        剩餘 {Math.max(0, daysLeft)} 天
                      </span>
                    );
                  }

                  return (
                    <li
                      key={reserveID}
                      className="list-item"
                      style={{
                        borderLeft: `8px solid ${statusInfo?.color || "#ccc"}`,
                        cursor: isClickable ? "pointer" : "default",
                        transition: "0.2s",
                      }}
                      onClick={() => {
                        if (statusInfo?.badge === "info" || statusInfo?.badge === "primary") {
                          openReviewModal(res);
                        } else if (statusInfo?.badge === "warning") {
                          openReminderModal(res);
                        }
                      }}
                      title={
                        statusInfo?.badge === "info" ? "點擊審核報名"
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
                            <i
                              className="fa-regular fa-calendar-check"
                              style={{ color: statusInfo?.color }}
                            ></i>
                            <div className="time-text">
                              <span>{examTimeStr}</span>
                              {duration > 0 && <span> ({duration} 小時)</span>}
                            </div>
                          </div>

                          <div className="location-info">
                            <span>
                              <i
                                className="fa-solid fa-location-dot icon-location"
                              ></i>
                              {location}
                            </span>
                          </div>

                          <div className="personal-info">
                            <div className="personal-info-div">
                              <span>
                                <i
                                  className="fa-solid fa-user icon-personal"
                                ></i>
                                {fullName}
                              </span>
                              <span >
                                <i
                                  className="fa-solid fa-envelope icon-personal"
                                ></i>
                                {email}
                              </span>
                              <span >
                                <i
                                  className="fa-solid fa-phone icon-personal"
                                ></i>
                                {phone}
                              </span>
                            </div>
                          </div>

                          {statusInfo?.badge === "danger" && comment && (
                            <div className="rejection-box" style={{ color: statusInfo.color }}>
                              <i
                                className="fa-solid fa-circle-exclamation"
                                style={{ marginRight: "6px", color: statusInfo.color }}
                              ></i>
                              {comment}
                            </div>
                          )}

                          <div className="item-actions status-tags">
                            {additional && (
                              <span className="additional-tag">
                                <i className="fa-solid fa-certificate" style={{ color: statusInfo.color }}></i>需證書
                              </span>
                            )}

                            {daysLeftElement}

                            <span
                              className="reviewStatus"
                              style={{
                                color: statusInfo?.color,
                                backgroundColor: `${statusInfo?.color || "#ccc"}15`,
                              }}
                            >
                              {statusInfo?.text}
                              {isClickable && (
                                <i
                                  className={statusInfo?.badge === "warning" ? "fa-solid fa-envelope" : "fa-solid fa-pen-to-square"}
                                  style={{ marginLeft: "6px", color: statusInfo?.color }}
                                >
                                </i>
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

      {/* 寄信提醒 Modal */}
      {reminderReservation &&
        createPortal(
          <div className="modal-overlay" onClick={closeReminderModal}>
            <div className="modal-content exam-form-modal reminder-modal" onClick={(e) => e.stopPropagation()}>
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
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content exam-form-modal ${isPaymentReview ? "review-modal-wide" : "review-modal-narrow"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="review-modal-title">{isPaymentReview ? "審核付款資訊" : "審核報名資訊"}</h3>

        <div className={isPaymentReview ? "review-modal-layout" : "review-modal-layout-block"}>

          {/* 左側：報名者基礎資訊與審核表單 */}
          <div className="review-modal-main">
            <div className="modal-info-block">
              <p><strong>報名序號：</strong> {safeText(reservation.reserveID)}</p>
              <p><strong>考試科目：</strong> {subjectName}</p>
              <p><strong>考試時間：</strong> {examTimeStr}</p>
              <p><strong>考場地點：</strong> {location}</p>
            </div>

            <div
              className="modal-info-block applicant-highlight"
            >
              <p><strong>報考人姓名：</strong> {fullName}</p>
              <p><strong>電子郵件：</strong> {getUserEmail(reservation)}</p>
              <p><strong>聯絡電話：</strong> {getUserPhone(reservation)}</p>
              <p><strong>考試語言：</strong> {safeText(reservation.language, "預設語言")}</p>
              <p><strong>Certiport 帳號：</strong> {safeText(reservation.certiportAccount)}</p>
              <p><strong>加值方案：</strong> {reservation.additional ? "有加購" : "無"}</p>
            </div>

            {isPaymentReview ? (
              <div className="payment-detail-block">
                <h4>付款明細</h4>

                {/* 詳細付款資訊 */}
                <p><strong>交易序號：</strong> {paymentInfo.transactionID}</p>
                <p><strong>付款方式：</strong> {paymentInfo.method}</p>
                <p>
                  <strong>應付金額：</strong> {paymentInfo.amount !== "-" ? `${paymentInfo.amount}` : "未提供"}
                </p>
                <p><strong>檔案名稱：</strong> {paymentInfo.fileName}</p>
                <p><strong>付款時間：</strong> {paymentInfo.uploadedAt ? formatDateTime(paymentInfo.uploadedAt) : "-"}</p>

                <p><strong>付款證明：</strong></p>
                {paymentInfo.imageUrl ? (
                  <div className="payment-proof-container">
                    <a href={paymentInfo.imageUrl} target="_blank" rel="noreferrer" title="點擊開啟原檔">
                      {paymentInfo.imageUrl.includes("drive.google.com") ? (
                        <div className="payment-proof-link">
                          <i className="fa-brands fa-google-drive"></i>
                          點擊查看 Google Drive 檔案
                        </div>
                      ) : (
                        <img
                          src={paymentInfo.imageUrl}
                          alt="付款證明"
                          className="payment-proof-img"
                        />
                      )}
                    </a>
                    <p className="payment-proof-hint">點擊上方連結/圖片即可在新分頁查看</p>
                  </div>
                ) : (
                  <div className="payment-no-image">
                    尚未上傳付款圖片
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit} className="exam-form review-form-section">
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
                    {reviewAction === "reject" && <span className="required-mark"> *</span>}
                  </label>
                  <textarea
                    rows={4}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="請輸入未通過原因"
                    required={reviewAction === "reject"}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="modal-actions modal-actions-mt">
                  <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
                    取消
                  </button>
                  <button type="submit" className="btn-confirm" disabled={isSubmitting}>
                    {isSubmitting ? "送出中..." : "確認送出"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 右側：付款證明圖片展示 (僅在付款審核時出現) */}
          {isPaymentReview && (
            <form onSubmit={onSubmit} className="exam-form review-modal-sidebar">
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
                  {reviewAction === "reject" && <span className="required-mark"> *</span>}
                </label>
                <textarea
                  rows={4}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="請輸入未通過原因"
                  required={reviewAction === "reject"}
                  disabled={isSubmitting}
                />
              </div>

              <div className="modal-actions modal-actions-mt">
                <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
                  取消
                </button>
                <button type="submit" className="btn-confirm" disabled={isSubmitting}>
                  {isSubmitting ? "送出中..." : "確認送出"}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}