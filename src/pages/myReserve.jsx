import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useOutletContext, useNavigate } from "react-router-dom";
import { fetchMyReservationsWithDetailsAPI, submitPaymentProofAPI, updateReservationAPI } from "../api";
import { reserveStatus, EXAM_LANGUAGE, DEADLINE_CONFIG, REGISTRATION_DEADLINE_DAYS } from "../config";

const checkIsExpired = (res) => {
  const timeStr = res.examInfo?.examEndTime || res.examInfo?.examStartTime;
  if (!timeStr) return false;
  return new Date(timeStr) < new Date();
};

export default function MyReserve() {
  const { user, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState("reviewing");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 繳費表單狀態
  const [paymentModalData, setPaymentModalData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("轉帳");
  const [paymentFile, setPaymentFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const paymentFileInputRef = useRef(null);

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

  // 查看報名資訊狀態
  const [infoModalData, setInfoModalData] = useState(null);

  const activeTabInfo = useMemo(
    () => reserveStatus.find((t) => t.id === activeTab) || reserveStatus[0],
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
          const activeData = data.filter((r) => !checkIsExpired(r));
          const priorityIds = ["payment_rejected", "unpaid", "rejected", "payment_review"];
          let targetTabId = "reviewing";

          for (const id of priorityIds) {
            if (activeData.some((r) => r.statusInfo?.id === id)) {
              targetTabId = id;
              break;
            }
          }

          setActiveTab(targetTabId);
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

  const filteredReservations = useMemo(() => {
    const isHistoryTab = activeTab === "history";

    let filtered = reservations.filter((res) => {
      const statusId = res.statusInfo?.id;
      const isExpired = checkIsExpired(res);

      if (isHistoryTab) {
        return isExpired || statusId === "history";
      }

      if (isExpired) return false;
      return statusId === activeTab;
    });

    return isHistoryTab ? filtered.reverse() : filtered;
  }, [reservations, activeTab]);

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
    if (!paymentFile) return alert("請先上傳繳費證明截圖！");

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
      alert("繳費資訊送出成功！請靜候管理員審核。");
      setPaymentModalData(null);
      setPaymentFile(null);
      await fetchData(false);
    } catch (error) {
      console.error("上傳失敗:", error);
      alert("上傳失敗，請稍後再試。");
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
    if (!window.confirm(`確定要提交 ${updateFormData.subject} 的修改資料嗎？`)) return;

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

      alert("資料更新成功！請靜候審核。");
      setUpdateModalData(null);
      await fetchData(false);
    } catch (error) {
      alert(`更新失敗：${error.message}`);
    } finally {
      setSubmit(false);
      setLoadingText("");
      setGlobalLoading(false);
    }
  };

  if (!user) return null;
  const isHistoryTab = activeTab === "history";

  const handleRefresh = async () => {
    await fetchData(false);
  };

  return (
    <div className="manager-wrapper">
      <div className="manager-container">
        {/* 左側：狀態切換面板 */}
        <div className="centered-form side-panel add-panel" title="篩選預約狀態">
          <h3>進度查詢</h3>
          <div className="status-vertical-menu">
            {reserveStatus.map((tab) => {
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
                    fontWeight: isActive ? "600" : "400"
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

        {/* 右側：列表區塊 */}
        <div className="centered-form side-panel list-panel" title="詳細內容">
          <div className="list-title-row">
            <h3>{activeTabInfo.label} 的考試</h3>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn-refresh"
              style={{
                cursor: isRefreshing ? "not-allowed" : "pointer",
                transform: isRefreshing ? "rotate(360deg)" : "none",
                transition: isRefreshing ? "transform 1s linear infinite" : "all 1s"
              }}
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

          {activeTabInfo.message && <span className="tab-message">* {activeTabInfo.message}</span>}

          <div className="scroll-area reserved-content">
            {filteredReservations.length === 0 ? (
              <div className="empty-state">
                <i className="fa-regular fa-folder-open"></i>
                <p>目前沒有{activeTabInfo.label}的項目</p>
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

                  const displayColor = isHistoryTab ? "#999999" : statusInfo?.color || "#999999";
                  const displayText = isHistoryTab ? "已結束" : statusInfo?.text || "狀態未知";

                  const statusId = statusInfo?.id;

                  const isReviewing = statusId === "reviewing" && !isHistoryTab;
                  const isUnpaid = statusId === "unpaid" && !isHistoryTab;
                  const isRejected = statusId === "rejected" && !isHistoryTab;
                  const isPaymentRejected = statusId === "payment_rejected" && !isHistoryTab;
                  const isPaid = statusId === "paid" && !isHistoryTab;

                  const isClickable =
                    isReviewing || isUnpaid || isRejected || isPaymentRejected || isPaid;

                  let daysLeftElement = null;
                  if ((isUnpaid || isPaymentRejected) && examInfo?.examStartTime) {
                    const examDate = new Date(examInfo.examStartTime);
                    const deadlineDate = new Date(
                      examDate.getTime() - (REGISTRATION_DEADLINE_DAYS || 3) * 24 * 60 * 60 * 1000
                    );
                    const daysLeft = Math.ceil(
                      (deadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24)
                    );

                    let tagColor = DEADLINE_CONFIG.COLORS.SAFE;
                    if (daysLeft <= DEADLINE_CONFIG.URGENT_DAYS) tagColor = DEADLINE_CONFIG.COLORS.URGENT;
                    else if (daysLeft <= DEADLINE_CONFIG.WARNING_DAYS) tagColor = DEADLINE_CONFIG.COLORS.WARNING;

                    daysLeftElement = (
                      <span
                        className="additional-tag"
                        style={{
                          color: tagColor,
                          borderColor: tagColor,
                          backgroundColor: `${tagColor}15`,
                          marginLeft: "8px"
                        }}
                      >
                        <i className="fa-regular fa-clock" style={{ marginRight: "4px" }}></i>
                        再 {daysLeft} 天繳費截止
                      </span>
                    );
                  }

                  return (
                    <li
                      key={reserveID}
                      className="list-item"
                      style={{
                        borderLeft: `8px solid ${displayColor}`,
                        cursor: isClickable ? "pointer" : "default",
                        transition: "0.2s"
                      }}
                      onClick={() => {
                        if (isUnpaid || isPaymentRejected) {
                          setPaymentModalData(res);
                          return;
                        }

                        if (isRejected || isReviewing) {
                          setUpdateModalData(res);
                          setUpdateFormData({
                            reserveID: res.reserveID,
                            examID: res.examInfo?.examID || "",
                            email: user?.email || "",
                            lastname: res.lastname || user?.lastname || "",
                            firstname: res.firstname || user?.firstname || "",
                            phone: res.phoneNumber || user?.phoneNumber || "",
                            subject: subjectName,
                            language: res.language || "繁體中文",
                            room: location,
                            certiport: res.additional || false,
                            certiportAccount: res.certiportAccount || ""
                          });
                          return;
                        }

                        if (isPaid) {
                          setInfoModalData({ ...res, examTimeStr, subjectName, location });
                        }
                      }}
                      title={
                        isUnpaid || isPaymentRejected
                          ? "點擊上傳繳費證明"
                          : isRejected || isReviewing
                            ? "點擊修改報名資料"
                            : isPaid
                              ? "點擊查看報名資訊"
                              : ""
                      }
                    >
                      <div className="item-info reserved-col">
                        <div className="text-group">
                          <div className="subject-info">
                            <span className="name">{subjectName}</span>
                          </div>

                          <div className="time-info">
                            <i className="fa-regular fa-calendar-check" style={{ color: displayColor }}></i>
                            <div className="time-text">
                              <span>{examTimeStr}</span>
                              {duration > 0 && <span> ({duration} 小時)</span>}
                            </div>
                          </div>

                          <div className="location-info">
                            <span>
                              <i
                                className="fa-solid fa-location-dot"
                                style={{ color: isHistoryTab ? "#999" : "#d9534f" }}
                              ></i>
                              {location}
                            </span>
                          </div>

                          <div className="language-info">
                            <span>
                              <i
                                className="fa-solid fa-language"
                                style={{ color: isHistoryTab ? "#999" : "#5bc0de" }}
                              ></i>
                              {language || "預設語言"}
                            </span>
                          </div>

                          {(isRejected || isPaymentRejected) && comment && (
                            <div className="rejection-box" style={{ color: displayColor }}>
                              <i className="fa-solid fa-circle-exclamation" style={{ marginRight: "6px" }}></i>
                              {comment}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="item-actions status-tags">
                        {additional && (
                          <span
                            className="additional-tag"
                            style={{
                              color: isHistoryTab ? "#999" : undefined,
                              border: isHistoryTab ? "1px solid #999" : undefined
                            }}
                          >
                            <i
                              className="fa-solid fa-certificate"
                              style={{ color: isHistoryTab ? displayColor : "#e67e22" }}
                            ></i>
                            需證書
                          </span>
                        )}

                        {daysLeftElement}

                        <span
                          className="reviewStatus"
                          style={{
                            color: displayColor,
                            backgroundColor: isHistoryTab ? "#f5f5f5" : `${displayColor}15`
                          }}
                        >
                          {displayText}
                          {(isUnpaid || isPaymentRejected) && <i className="fa-solid fa-upload"></i>}
                          {(isRejected || isReviewing) && <i className="fa-solid fa-pen"></i>}
                          {isPaid && <i className="fa-solid fa-file-lines"></i>}
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
              <h3>{paymentModalData.statusInfo?.id === "payment_rejected" ? "重新上傳繳費資訊" : "上傳繳費資訊"}</h3>
              <div className="modal-info-block">
                <p>
                  您正在為 <strong>{paymentModalData.examInfo?.subjectName}</strong>
                  {paymentModalData.statusInfo?.id === "payment_rejected" ? " 重新提交繳費證明。" : " 提交繳費證明。"}
                </p>
                {paymentModalData.statusInfo?.id === "payment_rejected" && /^https?:\/\//i.test(paymentModalData.paymentData?.imageUrl || "") && (
                  <div className="modal-info-block" style={{ marginTop: "10px" }}>
                    <p style={{ marginBottom: "8px", fontWeight: 600 }}>前一次上傳的繳費證明：</p>
                    <a
                      href={paymentModalData.paymentData.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginBottom: "8px" }}
                    >
                      開啟原始圖片
                    </a>
                  </div>
                )}
                <p>匯款帳號：國泰世華(013) 1234-5678-9012 (請依實際修改)</p>
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
                  <input type="file" accept="image/*" onChange={handleFileChange} required />
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

      {/* 查看報名資訊 Modal */}
      {infoModalData &&
        createPortal(
          <div className="modal-overlay" onClick={() => setInfoModalData(null)}>
            <div className="modal-content exam-form-modal" onClick={(e) => e.stopPropagation()}>
              <h3>報名詳細資訊</h3>

              <div className="modal-info-block">
                <p>
                  <strong>考試科目：</strong> {infoModalData.subjectName}
                </p>
                <p>
                  <strong>考試時間：</strong> {infoModalData.examTimeStr}
                </p>
                <p>
                  <strong>考場地點：</strong> {infoModalData.location}
                </p>
              </div>

              <div className="modal-info-block info-highlight">
                <p>
                  <strong>報名序號：</strong> {infoModalData.reserveID}
                </p>
                <p>
                  <strong>報考人姓名：</strong> {infoModalData.lastname}
                  {infoModalData.firstname}
                </p>
                <p>
                  <strong>電子郵件：</strong> {user?.email || "未提供"}
                </p>
                <p>
                  <strong>聯絡電話：</strong> {infoModalData.phoneNumber}
                </p>
                <p>
                  <strong>考試語言：</strong> {infoModalData.language || "預設語言"}
                </p>
                <p>
                  <strong>Certiport 帳號：</strong> {infoModalData.certiportAccount}
                </p>
                <p>
                  <strong>加值方案：</strong> {infoModalData.additional ? "有加購" : "無"}
                </p>
                <p>
                  <strong>繳費狀態：</strong> <span className="paid-status">已繳費</span>
                </p>
              </div>

              <div className="modal-actions modal-actions-end">
                <button type="button" className="btn-cancel" onClick={() => setInfoModalData(null)}>
                  關閉視窗
                </button>

                {/* <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setUpdateModalData(infoModalData);
                    setUpdateFormData({
                      reserveID: infoModalData.reserveID,
                      examID: infoModalData.examInfo?.examID || "",
                      email: user?.email || "",
                      lastname: infoModalData.lastname || user?.lastname || "",
                      firstname: infoModalData.firstname || user?.firstname || "",
                      phone: infoModalData.phoneNumber || user?.phoneNumber || "",
                      subject: infoModalData.subjectName,
                      language: infoModalData.language || "繁體中文",
                      room: infoModalData.location,
                      certiport: infoModalData.additional || false,
                      certiportAccount: infoModalData.certiportAccount || ""
                    });
                    setInfoModalData(null);
                  }}
                >
                  修改資料
                </button> */}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}