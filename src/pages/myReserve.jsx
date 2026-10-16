import React, { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOutletContext, useNavigate } from "react-router-dom";
import ReservationDetail from "../features/booking/ReservationDetail.jsx";
import PaymentProof from "../features/booking/PaymentProof.jsx";
import { fetchMyReservationsWithDetailsAPI, submitPaymentProofAPI, updateReservationAPI } from "../api";
import { examStarted, reservationGroup, reservationStatusKey, resultSummary } from "../features/booking/utils";
import { reserveGroups, EXAM_LANGUAGE, DEADLINE_CONFIG, REGISTRATION_DEADLINE_DAYS } from "../config";
import { confirmDialog, notify } from "../dialog";
import StatusTabs from "../components/statusTabs";

export default function MyReserve() {
  const { user, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState("todo");
  // 第二層分頁 (待處理、審核中底下的確切狀態)。空字串代表還沒選，會自動停在第一個有項目的
  const [activeStatus, setActiveStatus] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 繳費表單狀態
  const [paymentModalData, setPaymentModalData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("轉帳");
  const [paymentFile, setPaymentFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // 修改資料 / 重新報名表單狀態
  const [updateModalData, setUpdateModalData] = useState(null);
  const [updateFormData, setUpdateFormData] = useState({
    reserveID: "",
    examID: "",
    email: "",
    lastname: "",
    firstname: "",
    phone: "",
    subject: "",
    language: "",
    room: "",
    certiport: false,
    certiportAccount: ""
  });

  // 報名詳細資訊視窗 (點選任一筆報名開啟；修改資料、上傳繳費證明都從這裡進去)
  const [detailData, setDetailData] = useState(null);

  const activeTabInfo = useMemo(
    () => reserveGroups.find((t) => t.id === activeTab) || reserveGroups[0],
    [activeTab]
  );

  const fetchData = useCallback(
    async (isInitial = false) => {
      if (!user) return;

      setIsRefreshing(true);
      setSubmit(false);
      setLoadingText("正在取得報名記錄...");
      setGlobalLoading(true);

      try {
        const data = await fetchMyReservationsWithDetailsAPI();
        setReservations(data);

        if (isInitial) {
          // 進頁面時停在第一個有項目的分頁 (依分頁順序，待處理優先)
          const groups = new Set(data.map(reservationGroup));
          setActiveTab((reserveGroups.find((group) => groups.has(group.id)) || reserveGroups[0]).id);
        }
      } catch (err) {
        console.error("無法取得報名資料:", err);
      } finally {
        setGlobalLoading(false);
        setIsRefreshing(false);
        setLoadingText("");
      }
    },
    [user, setGlobalLoading, setLoadingText, setSubmit]
  );

  useEffect(() => {
    if (!user) navigate("/");
    else fetchData(true);
  }, [user, navigate, fetchData]);

  // 各分頁的筆數 (與下方清單的篩選條件一致)
  const tabCounts = useMemo(() => {
    const counts = {};
    reservations.forEach((res) => {
      const id = reservationGroup(res);
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }, [reservations]);

  // 第二層分頁與各自的筆數
  const statusTabs = useMemo(() => {
    const counts = {};
    reservations.forEach((res) => {
      if (reservationGroup(res) !== activeTab) return;
      const key = reservationStatusKey(res);
      counts[key] = (counts[key] || 0) + 1;
    });
    return (activeTabInfo.statuses || [])
      .map((status) => ({ ...status, count: counts[status.id] || 0 }))
      .filter((status) => !status.optional || status.count > 0);
  }, [reservations, activeTab, activeTabInfo]);

  // 目前的第二層分頁：使用者選的那個，沒選或已經不存在時停在第一個有項目的
  const currentStatus = statusTabs.find((status) => status.id === activeStatus)
    || statusTabs.find((status) => status.count > 0)
    || statusTabs[0]
    || null;

  const filteredReservations = useMemo(() => {
    const filtered = reservations.filter((res) =>
      reservationGroup(res) === activeTab && (!currentStatus || reservationStatusKey(res) === currentStatus.id));
    // 歷史紀錄把新的排前面
    return activeTab === "history" ? filtered.reverse() : filtered;
  }, [reservations, activeTab, currentStatus]);

  const tabMessage = currentStatus?.message || activeTabInfo.message;

  // --- 繳費處理邏輯 ---
  const handleFileChange = (e) => setPaymentFile(e.target.files[0] || null);

  const getBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!paymentFile) return notify("請先上傳繳費證明截圖！");

    const token = await requestCaptcha();
    if (!token) return;

    setIsUploading(true);
    setSubmit(true);
    setLoadingText("正在進行安全驗證與上傳繳費證明...");
    setGlobalLoading(true);

    try {
      const base64Str = await getBase64(paymentFile);
      const payload = {
        reserveID: paymentModalData.reserveID,
        paymentMethod,
        fileName: paymentFile.name,
        mimeType: paymentFile.type,
        base64: base64Str.split(",")[1],
        token
      };

      await submitPaymentProofAPI(payload);
      notify("繳費資訊送出成功！請靜候管理員審核。");
      setPaymentModalData(null);
      setPaymentFile(null);
      await fetchData(false);
    } catch (error) {
      console.error("上傳失敗:", error);
      notify("上傳失敗，請稍後再試。");
    } finally {
      setIsUploading(false);
      setSubmit(false);
      setGlobalLoading(false);
      setLoadingText("");
    }
  };

  // --- 修改資料 / 重新報名 處理邏輯 ---
  const handleUpdateFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUpdateFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!(await confirmDialog(`確定要提交 ${updateFormData.subject} 的修改資料嗎？`))) return;

    const token = await requestCaptcha();
    if (!token) return;

    setSubmit(true);
    setLoadingText("正在進行安全驗證與更新報名資料...");
    setGlobalLoading(true);

    try {
      await updateReservationAPI({
        reserveID: updateFormData.reserveID,
        examID: updateFormData.examID,
        lastname: updateFormData.lastname,
        firstname: updateFormData.firstname,
        phone: updateFormData.phone,
        language: updateFormData.language,
        location: updateFormData.room,
        certiport: updateFormData.certiport,
        certiportAccount: updateFormData.certiportAccount,
        token
      });

      notify("資料更新成功！請靜候審核。");
      setUpdateModalData(null);
      await fetchData(false);
    } catch (error) {
      notify(`更新失敗：${error.message}`);
    } finally {
      setSubmit(false);
      setLoadingText("");
      setGlobalLoading(false);
    }
  };

  // 從報名詳細資訊進入「上傳繳費證明」「修改報名資料」
  const openPayment = (res) => {
    setDetailData(null);
    setPaymentModalData(res);
  };

  const openUpdate = (res) => {
    setDetailData(null);
    setUpdateModalData(res);
    setUpdateFormData({
      reserveID: res.reserveID,
      examID: res.examInfo?.examID || "",
      email: user?.email || "",
      lastname: res.lastname || user?.lastname || "",
      firstname: res.firstname || user?.firstname || "",
      phone: res.phoneNumber || user?.phoneNumber || "",
      subject: res.examInfo?.subjectName || "未知考試",
      language: res.language || "繁體中文",
      room: res.examInfo?.location || "未註明地點",
      certiport: res.additional || false,
      certiportAccount: res.certiportAccount || ""
    });
  };

  if (!user) return null;
  // 歷史紀錄的報名都已結束，標籤顯示結果 (成績、缺考、已取消…) 而不是報名狀態
  const isClosedTab = activeTab === "history";

  const handleRefresh = async () => {
    await fetchData(false);
  };

  return (
    <div className="manager-wrapper">
      <div className="manager-container">
        {/* 左側：狀態切換面板 */}
        <div className="centered-form side-panel add-panel" title="篩選預約狀態">
          <h3>進度查詢</h3>
          <StatusTabs
            tabs={reserveGroups}
            activeId={activeTab}
            onSelect={(id) => {
              setActiveTab(id);
              setActiveStatus("");
            }}
            getCount={(tab) => tabCounts[tab.id] || 0}
          />
        </div>

        {/* 右側：列表區塊 */}
        <div className="centered-form side-panel list-panel" title="詳細內容">
          <div className="list-title-row">
            <h3>{activeTabInfo.label}</h3>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`btn-refresh ${isRefreshing ? "is-loading" : ""}`}
              title="重新整理"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path
                  fillRule="evenodd"
                  d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
                />
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
              </svg>
            </button>
          </div>

          {/* 第二層分頁：這一組裡各個確切的狀態 */}
          {statusTabs.length > 0 && (
            <StatusTabs
              variant="chips"
              label={`${activeTabInfo.label}的狀態`}
              tabs={statusTabs}
              activeId={currentStatus?.id}
              onSelect={setActiveStatus}
              getCount={(status) => status.count}
            />
          )}

          {tabMessage && <span className="tab-message">* {tabMessage}</span>}

          <div className="scroll-area reserved-content">
            {filteredReservations.length === 0 ? (
              <div className="empty-state">
                <i className="fa-regular fa-folder-open"></i>
                <p>目前沒有{currentStatus?.label || activeTabInfo.label}的項目</p>
              </div>
            ) : (
              <ul className="modern-list">
                {filteredReservations.map((res) => {
                  const { reserveID, language, additional, examInfo, statusInfo, comment } = res;
                  const subjectName = examInfo?.subjectName || "未知考試";
                  const location = examInfo?.location || "未註明地點";

                  const startTime = examInfo?.examStartTime ? new Date(examInfo.examStartTime) : null;
                  const endTime = examInfo?.examEndTime ? new Date(examInfo.examEndTime) : null;

                  const examTimeStr = startTime
                    ? `${startTime.toLocaleDateString("zh-TW")} ${startTime.toLocaleTimeString("zh-TW", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false
                    })}`
                    : "時間未定";

                  const duration =
                    endTime && startTime
                      ? Math.max(0, Math.floor((endTime - startTime) / (1000 * 60 * 60)))
                      : 0;

                  // 狀態色調 (對應 CSS 的 .tone-*) 與標籤文字
                  const [resultText, resultTone] = resultSummary(res);
                  const tone = isClosedTab ? resultTone : statusInfo?.tone || "muted";
                  const displayText = isClosedTab ? resultText : statusInfo?.text || "狀態未知";

                  const statusId = statusInfo?.id;

                  const isReviewing = statusId === "reviewing" && !isClosedTab;
                  const isUnpaid = statusId === "unpaid" && !isClosedTab;
                  const isRejected = statusId === "rejected" && !isClosedTab;
                  const isPaymentRejected = statusId === "payment_rejected" && !isClosedTab;

                  let daysLeftElement = null;
                  if ((isUnpaid || isPaymentRejected) && examInfo?.examStartTime) {
                    const examDate = new Date(examInfo.examStartTime);
                    const deadlineDate = new Date(res.paymentDeadline || examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000);
                    const daysLeft = Math.ceil(
                      (deadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24)
                    );

                    let deadlineLevel = "safe"; // 對應 CSS 的 .deadline-safe / -warning / -urgent
                    if (daysLeft <= DEADLINE_CONFIG.URGENT_DAYS) deadlineLevel = "urgent";
                    else if (daysLeft <= DEADLINE_CONFIG.WARNING_DAYS) deadlineLevel = "warning";

                    daysLeftElement = (
                      <span className={`additional-tag deadline-${deadlineLevel}`}>
                        <i className="fa-regular fa-clock"></i>
                        再 {daysLeft} 天繳費截止
                      </span>
                    );
                  }

                  return (
                    <li
                      key={reserveID}
                      className={`list-item tone-${tone} clickable`}
                      onClick={() => setDetailData(res)}
                      title="點擊查看報名詳細資訊"
                    >
                      <div className="item-info reserved-col">
                        <div className="text-group">
                          <div className="subject-info">
                            <span className="name">{subjectName}</span>
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
                              <i className="fa-solid fa-location-dot"></i>
                              {location}
                            </span>
                          </div>

                          <div className="language-info">
                            <span>
                              <i className="fa-solid fa-language"></i>
                              {language || "預設語言"}
                            </span>
                          </div>

                          {(isRejected || isPaymentRejected) && comment && (
                            <div className="rejection-box">
                              <i className="fa-solid fa-circle-exclamation"></i>
                              {comment}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="item-actions status-tags">
                        {additional && (
                          <span className="additional-tag">
                            <i className="fa-solid fa-certificate"></i>
                            需證書
                          </span>
                        )}

                        {daysLeftElement}

                        <span className="reviewStatus">
                          {displayText}
                          {(isUnpaid || isPaymentRejected) && <i className="fa-solid fa-upload"></i>}
                          {(isRejected || isReviewing) && <i className="fa-solid fa-pen"></i>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 繳費資訊 Modal */}
      {paymentModalData &&
        createPortal(
          <div className="modal-overlay" onClick={() => setPaymentModalData(null)}>
            <div className="modal-content exam-form-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close" aria-label="關閉" title="關閉" onClick={() => setPaymentModalData(null)}>&times;</button>
              <h3>{paymentModalData.statusInfo?.id === "payment_rejected" ? "重新上傳繳費資訊" : "上傳繳費資訊"}</h3>
              <div className="modal-info-block">
                <p>
                  您正在為 <strong>{paymentModalData.examInfo?.subjectName}</strong>
                  {paymentModalData.statusInfo?.id === "payment_rejected" ? " 重新提交繳費證明。" : " 提交繳費證明。"}
                </p>
                {paymentModalData.statusInfo?.id === "payment_rejected" && paymentModalData.paymentData && (
                  <div className="modal-info-block previous-proof">
                    <p>前一次上傳的繳費證明：</p>
                    <PaymentProof reserveID={paymentModalData.reserveID} />
                  </div>
                )}
                <p>{paymentModalData.paymentInstructions || "請聯絡學苑取得正式付款資訊；目前尚未設定匯款帳號。"}</p>
                <p>尚需繳費：NT$ {Math.max(0, Number(paymentModalData.amountDue || 0) - Number(paymentModalData.paidAmount || 0))}</p>
              </div>

              <form onSubmit={handleSubmitPayment} className="exam-form">
                <div className="form-group">
                  <label>繳費方式：</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required>
                    <option value="轉帳">銀行 / ATM 轉帳</option>
                    <option value="信用卡">信用卡</option>
                    <option value="Line Pay">Line Pay</option>
                    <option value="街口支付">街口支付</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>繳費證明截圖/照片：</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} required />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setPaymentModalData(null)}
                    disabled={isUploading}
                  >
                    取消
                  </button>
                  <button type="submit" className="btn-confirm" disabled={isUploading}>
                    {isUploading ? "送出中..." : "確認送出"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 修改資料 / 重新報名 Modal */}
      {updateModalData &&
        createPortal(
          <div className="modal-overlay" onClick={() => setUpdateModalData(null)}>
            <div className="modal-content exam-form-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close" aria-label="關閉" title="關閉" onClick={() => setUpdateModalData(null)}>&times;</button>
              <h3>修改報名資料</h3>

              {updateModalData.comment && updateModalData.statusInfo?.id === "rejected" && (
                <div className="modal-info-block rejected">
                  <p className="rejected-title">
                    <i className="fa-solid fa-circle-exclamation"></i> 退件原因：
                  </p>
                  <p>{updateModalData.comment}</p>
                </div>
              )}

              <form onSubmit={handleUpdateSubmit} className="exam-form">
                <div className="form-group">
                  <label>電子郵件</label>
                  <input type="email" name="email" className="input-disabled" value={updateFormData.email} disabled />
                </div>

                <div className="form-group">
                  <label>
                    Certiport帳號 <span className="required-mark">*</span>
                  </label>
                  <input
                    type="text"
                    name="certiportAccount"
                    value={updateFormData.certiportAccount}
                    onChange={handleUpdateFormChange}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label>
                      姓 (Last Name) <span className="required-mark">*</span>
                    </label>
                    <input
                      type="text"
                      name="lastname"
                      value={updateFormData.lastname}
                      onChange={handleUpdateFormChange}
                      required
                    />
                  </div>
                  <div className="form-group half">
                    <label>
                      名 (First Name) <span className="required-mark">*</span>
                    </label>
                    <input
                      type="text"
                      name="firstname"
                      value={updateFormData.firstname}
                      onChange={handleUpdateFormChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label>
                      電話 <span className="required-mark">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={updateFormData.phone}
                      onChange={handleUpdateFormChange}
                      required
                    />
                  </div>
                  <div className="form-group half">
                    <label>
                      考試語言 <span className="required-mark">*</span>
                    </label>
                    <select name="language" value={updateFormData.language} onChange={handleUpdateFormChange} required>
                      <option value="" disabled>
                        請選擇語言
                      </option>
                      {EXAM_LANGUAGE.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label>考試科目</label>
                    <input name="subject" value={updateFormData.subject} className="input-disabled" disabled />
                  </div>
                  <div className="form-group half">
                    <label>考場</label>
                    <input type="text" name="room" value={updateFormData.room} className="input-disabled" disabled />
                  </div>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      name="certiport"
                      checked={updateFormData.certiport}
                      onChange={handleUpdateFormChange}
                    />
                    <span>加購 Certiport Exam Replay 優惠加值方案</span>
                  </label>
                </div>

                <div className="modal-actions flex-w-100">
                  <button
                    type="button"
                    className="btn-contact-admin"
                    onClick={() => {
                      navigate("/contact", {
                        state: {
                          source: "myReserve",
                          reserveID: updateModalData.reserveID,
                          subjectName: updateModalData.examInfo?.subjectName || updateFormData.subject,
                          examTime: updateModalData.examInfo?.examStartTime
                        }
                      });
                    }}
                  >
                    聯絡管理員
                  </button>

                  <div className="flex-gap-1">
                    <button type="button" className="btn-cancel" onClick={() => setUpdateModalData(null)}>
                      取消
                    </button>
                    <button type="submit" className="btn-confirm">
                      確認修改並送出
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 報名詳細資訊：一筆報名的狀態、內容與所有操作 */}
      {detailData && (
        <ReservationDetail
          reservation={detailData}
          expired={examStarted(detailData)}
          onClose={() => setDetailData(null)}
          onEdit={() => openUpdate(detailData)}
          onPay={() => openPayment(detailData)}
          onChanged={() => fetchData(false)}
        />
      )}
    </div>
  );
}
