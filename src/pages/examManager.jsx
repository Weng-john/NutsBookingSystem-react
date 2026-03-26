import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
// (移除原有 ReCAPTCHA 和 config 導入)
import {
  fetchExamsRawAPI,
  fetchSubjectsRawAPI,
  fetchRoomsAPI,
  addExamAPI,
  deleteExamAPI,
  updateExamAPI
} from "../api";

// --- 設定參數：隱藏過期超過 N 天的考試 ---
const EXPIRED_DAYS_LIMIT = 30;

// 產生 10 分鐘為單位的時間選項
const generateTimeOptions = () => {
  const options = [];
  for (let h = 6; h < 22; h++) {
    for (let m = 0; m < 60; m += 10) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  options.push("22:00");
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// 考場多選元件
const RoomMultiSelect = React.memo(function RoomMultiSelect({
  rooms,
  selectedRoomIDs,
  roomMap,
  disabled,
  onToggleRoom,
  onRemoveRoom
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleDropdown = () => {
    if (disabled) return;
    setShowDropdown((prev) => !prev);
  };

  return (
    <div className="input-field">
      <label>考試場地</label>
      <div className="custom-multi-select" ref={containerRef}>
        <div className={`select-trigger ${disabled ? "disabled" : ""}`} onClick={handleToggleDropdown}>
          <div className="select-tags-container">
            {selectedRoomIDs.length === 0 ? (
              <span className="placeholder-text">點擊選擇場地</span>
            ) : (
              selectedRoomIDs.map((roomID) => (
                <span key={roomID} className="selected-tag">
                  {roomMap[roomID] || roomID}
                  <button type="button" className="remove-tag-btn" onClick={(e) => { e.stopPropagation(); onRemoveRoom(roomID); }} disabled={disabled}>&times;</button>
                </span>
              ))
            )}
          </div>
          <span className="dropdown-arrow">▼</span>
        </div>
        {showDropdown && (
          <div className="custom-dropdown-menu">
            {rooms.length === 0 ? (
              <div className="dropdown-item">無場地資料</div>
            ) : (
              rooms.map((loc) => {
                const isSelected = selectedRoomIDs.includes(loc.roomID);
                return (
                  <div key={loc.roomID} className={`dropdown-item ${isSelected ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleRoom(loc.roomID); }}>
                    <span>{loc.placeName}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function ExamManager() {
  // 從 Context 解構出 requestCaptcha
  const { user, globalLoading, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext();
  const navigate = useNavigate();

  // --- 資料清單 State ---
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);

  // --- 篩選器 State ---
  const [filters, setFilters] = useState({ subjectID: "", targetDate: "", roomID: "" });
  const [openFilterMenu, setOpenFilterMenu] = useState(null);

  // --- 新增表單狀態 ---
  const [formData, setFormData] = useState({
    subjectID: "", examDate: "", startTime: "", endTime: "", roomIDs: [], fee: 0, status: "Draft"
  });

  // --- 編輯的狀態 (移除了冗餘的 targetExamID) ---
  const [editingExamID, setEditingExamID] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const isTeacher = useMemo(() => user?.role === "admin" || user?.role === "teacher", [user]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.subjectID, s.subjectName])), [subjects]);
  const roomMap = useMemo(() => Object.fromEntries(rooms.map((r) => [r.roomID, r.placeName])), [rooms]);

  // 1. 取得初始資料
  const fetchInitialData = useCallback(async () => {
    setLoadingText("正在取得系統資料...");
    setSubmit(false); // 👈 確保取得資料時，強制關閉 isSubmit 狀態
    setGlobalLoading(true);

    try {
      const [examsData, subjectsData, roomsData] = await Promise.all([
        fetchExamsRawAPI(),
        fetchSubjectsRawAPI(),
        fetchRoomsAPI()
      ]);

      if (Array.isArray(examsData)) setExams(examsData);

      if (Array.isArray(subjectsData)) {
        setSubjects(subjectsData);
        if (subjectsData.length > 0) {
          const firstSubjectID = subjectsData[0].subjectID;
          setFormData((prev) => ({
            ...prev,
            subjectID: prev.subjectID || firstSubjectID
          }));
          setFilters((prev) => ({
            ...prev,
            subjectID: prev.subjectID || firstSubjectID
          }));
        }
      }

      if (Array.isArray(roomsData)) {
        setRooms(roomsData);
        setFormData((prev) => ({
          ...prev,
          roomIDs: prev.roomIDs.length === 0 && roomsData.length > 0
            ? [roomsData[0].roomID]
            : prev.roomIDs
        }));
      }
    } catch (err) {
      console.error("Fetch error:", err);
      alert("讀取資料失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setLoadingText("");
      // 注意：這裡不需要額外設 setSubmit(false)，因為上面一開始已經設好了
    }
  }, [setGlobalLoading, setLoadingText, setSubmit]); // 👈 依賴陣列記得補上 setSubmit

  useEffect(() => {
    if (user && !isTeacher) { alert("權限不足，將返回首頁"); navigate("/"); return; }
    if (user && isTeacher) fetchInitialData();
  }, [user, isTeacher, navigate, fetchInitialData]);

  useEffect(() => {
    const closeMenu = () => setOpenFilterMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const handleAddChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleEditChange = (e) => setEditFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const toggleRoomSelection = useCallback((roomID) => {
    setFormData((prev) => {
      const isSelected = prev.roomIDs.includes(roomID);
      return {
        ...prev,
        roomIDs: isSelected
          ? prev.roomIDs.filter((id) => id !== roomID)
          : [...prev.roomIDs, roomID]
      };
    });
  }, []);

  const removeRoomTag = useCallback((roomID) => {
    setFormData((prev) => ({
      ...prev,
      roomIDs: prev.roomIDs.filter((id) => id !== roomID)
    }));
  }, []);

  // 2. 新增考試
  async function handleAdd(e) {
    e.preventDefault();
    if (!formData.subjectID || formData.roomIDs.length === 0 || !formData.examDate || !formData.startTime || !formData.endTime) {
      return alert("請完整填寫必填欄位！");
    }
    if (formData.startTime >= formData.endTime) return alert("結束時間必須晚於開始時間！");
    if (!window.confirm("確定要新增這筆考試場次嗎？")) return;

    setLoadingText("正在新增考試場次...");
    setSubmit(true); setGlobalLoading(true);
    try {
      const res = await addExamAPI({
        subjectID: formData.subjectID,
        roomIDs: formData.roomIDs,
        examStartTime: `${formData.examDate}T${formData.startTime}:00`,
        examEndTime: `${formData.examDate}T${formData.endTime}:00`,
        fee: Number(formData.fee),
        status: formData.status
      });
      if (res.ok) {
        alert("✅ 新增成功！");
        setFormData((prev) => ({ ...prev, startTime: "", endTime: "" }));
        await fetchInitialData();
      } else alert("❌ 新增失敗：" + (res.message || "未知錯誤"));
    } catch (err) {
      alert("⚠️ 系統錯誤，新增失敗：" + err.message);
    } finally {
      setGlobalLoading(false); setSubmit(false); setLoadingText("");
    }
  }

  // 3. 刪除考試 (整合全局 ReCAPTCHA Promise)
  async function handleDeleteClick(examID) {
    if (!window.confirm(`確定要刪除這筆考試嗎？\nID為 ${examID}\n注意：這將會同步刪除該場次所有的預約、留言與繳費紀錄！`)) return;

    // 呼叫全局驗證並等待結果
    const captchaToken = await requestCaptcha();

    // 如果 token 存在代表使用者驗證成功並點擊了「確認送出」
    if (captchaToken) {
      await executeDelete(examID, captchaToken);
    }
  }

  const executeDelete = async (examID, captchaToken) => {
    setLoadingText("正在刪除場次 ...");
    setSubmit(true);
    setGlobalLoading(true);
    try {
      const res = await deleteExamAPI({ examID, captchaToken });

      if (res.ok) {
        alert("場次刪除成功！");
        await fetchInitialData();
      } else {
        alert("刪除失敗：" + (res.message || "無法刪除該場次"));
      }
    } catch (err) {
      alert("⚠️ 系統錯誤，刪除失敗：" + err.message);
    } finally {
      setGlobalLoading(false);
      setSubmit(false);
      setLoadingText("");
    }
  };

  // 4. 編輯相關邏輯
  const startEditing = (exam) => {
    setEditingExamID(exam.examID);
    setEditFormData({
      examDate: exam.examStartTime.split("T")[0],
      startTime: exam.examStartTime.split("T")[1].substring(0, 5),
      endTime: exam.examEndTime.split("T")[1].substring(0, 5),
      fee: exam.fee,
      status: exam.status,
    });
  };

  const cancelEditing = () => {
    setEditingExamID(null);
    setEditFormData({});
  };

  // 將 attemptSaveEdit 轉為 async，呼叫全域驗證
  const attemptSaveEdit = async (exam) => {
    const safeStartTime = typeof exam.examStartTime === "string" ? exam.examStartTime : "";
    const safeEndTime = typeof exam.examEndTime === "string" ? exam.examEndTime : "";

    const origDate = safeStartTime.includes("T") ? safeStartTime.split("T")[0] : "";
    const origStart = safeStartTime.includes("T") ? safeStartTime.split("T")[1].substring(0, 5) : "";
    const origEnd = safeEndTime.includes("T") ? safeEndTime.split("T")[1].substring(0, 5) : "";

    const isChanged =
      origDate !== editFormData.examDate ||
      origStart !== editFormData.startTime ||
      origEnd !== editFormData.endTime ||
      exam.fee !== Number(editFormData.fee) ||
      exam.status !== editFormData.status;

    if (!isChanged) {
      cancelEditing();
      return;
    }

    if (editFormData.startTime >= editFormData.endTime) {
      return alert("結束時間必須晚於開始時間！");
    }

    // 呼叫全局驗證並等待結果
    const captchaToken = await requestCaptcha();

    if (captchaToken) {
      await executeUpdate(captchaToken);
    }
  };

  const executeUpdate = async (captchaToken) => {
    setLoadingText("正在更新考試資料...");
    setSubmit(true); setGlobalLoading(true);
    try {
      const res = await updateExamAPI({
        examID: editingExamID,
        examStartTime: `${editFormData.examDate}T${editFormData.startTime}:00`,
        examEndTime: `${editFormData.examDate}T${editFormData.endTime}:00`,
        fee: Number(editFormData.fee),
        status: editFormData.status,
        captchaToken
      });
      if (res.ok) {
        alert("✅ 更新成功！");
        cancelEditing();
        await fetchInitialData();
      } else alert("❌ 更新失敗：" + (res.message || "未知錯誤"));
    } catch (err) {
      alert("⚠️ 系統錯誤，更新失敗：" + err.message);
    } finally {
      setGlobalLoading(false); setSubmit(false); setLoadingText("");
    }
  };

  // --- 列表過濾 ---
  const filteredExams = useMemo(() => {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - EXPIRED_DAYS_LIMIT);

    return exams.filter((exam) => {
      const examDateObj = new Date(exam.examStartTime);
      if (examDateObj < thresholdDate) return false;

      if (filters.subjectID && exam.subjectID !== filters.subjectID) return false;
      const examDateStr = exam.examStartTime?.split("T")[0] || "";
      if (filters.targetDate && examDateStr !== filters.targetDate) return false;
      if (filters.roomID && exam.roomID !== filters.roomID) return false;

      return true;
    }).sort((a, b) => new Date(a.examStartTime) - new Date(b.examStartTime));
  }, [exams, filters]);

  if (!user || !isTeacher) return null;

  return (
    <div className="manager-wrapper">
      <div className="manager-container">

        {/* 左側：新增區塊 */}
        <div className="centered-form side-panel add-panel exam-panel">
          <h3>新增考試場次</h3>
          <form onSubmit={handleAdd} className="modern-form">
            <div className="input-field">
              <label>對應科目 </label>
              <select name="subjectID" value={formData.subjectID} onChange={handleAddChange} required disabled={globalLoading}>
                <option value="" disabled>請選擇科目</option>
                {subjects.map((sub) => <option key={sub.subjectID} value={sub.subjectID}>{sub.subjectName}</option>)}
              </select>
            </div>

            <RoomMultiSelect
              rooms={rooms} selectedRoomIDs={formData.roomIDs} roomMap={roomMap} disabled={globalLoading}
              onToggleRoom={toggleRoomSelection} onRemoveRoom={removeRoomTag}
            />

            <div className="input-field">
              <label>考試日期 </label>
              <input type="date" name="examDate" value={formData.examDate} onChange={handleAddChange} required disabled={globalLoading} />
            </div>

            <div className="split-group">
              <div className="input-field">
                <label>開始時間 </label>
                <select name="startTime" value={formData.startTime} onChange={handleAddChange} required disabled={globalLoading}>
                  <option value="" disabled>開始</option>
                  {TIME_OPTIONS.map((t) => <option key={`start-${t}`} value={t}>{t}</option>)}
                </select>
              </div>
              <span className="time-separator">至</span>
              <div className="input-field">
                <label>結束時間 </label>
                <select name="endTime" value={formData.endTime} onChange={handleAddChange} required disabled={globalLoading}>
                  <option value="" disabled>結束</option>
                  {TIME_OPTIONS.map((t) => <option key={`end-${t}`} value={t}>{t}</option>)}
                </select>
              </div>
            </div>


            <div className="split-group">
              <div className="input-field">
                <label>費用</label>
                <input type="number" name="fee" min="0" value={formData.fee} onChange={handleAddChange} required disabled={globalLoading} />
              </div>
              <div className="input-field">
                <label>考試狀態</label>
                <select name="status" value={formData.status} onChange={handleAddChange} required disabled={globalLoading}>
                  <option value="Open">Open</option>
                  <option value="Draft">Draft</option>
                  <option value="Closed">Closed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="button-container">
              <button type="submit" className="btn-primary full-width" disabled={globalLoading}>
                {globalLoading ? "處理中..." : "確認新增"}
              </button>
            </div>
          </form>
        </div>

        {/* 右側：列表區塊 */}
        <div className="centered-form side-panel list-panel">
          <div className="list-title-row" style={{ marginBottom: "16px" }}>
            <h3>現有場次清單</h3>
            {(filters.targetDate || filters.roomID || !filters.subjectID) && (
              <button className="clear-filter-btn" onClick={() => setFilters({ subjectID: subjects[0]?.subjectID || "", targetDate: "", roomID: "" })}>
                清除篩選
              </button>
            )}
          </div>

          <div className="list-header-row">
            <div className="header-cell subject-col" onClick={(e) => { e.stopPropagation(); setOpenFilterMenu(openFilterMenu === 'subject' ? null : 'subject'); }}>
              科目 <i className="fa-solid fa-filter" style={{ color: filters.subjectID ? "#d9534f" : "#ccc" }}></i>
              {openFilterMenu === 'subject' && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select value={filters.subjectID} onChange={(e) => { setFilters(p => ({ ...p, subjectID: e.target.value })); setOpenFilterMenu(null); }}>
                    {subjects.map(s => <option key={s.subjectID} value={s.subjectID}>{s.subjectName}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="header-cell time-col" onClick={(e) => { e.stopPropagation(); setOpenFilterMenu(openFilterMenu === 'date' ? null : 'date'); }}>
              考試時間 <i className="fa-solid fa-filter" style={{ color: filters.targetDate ? "#d9534f" : "#ccc" }}></i>
              {openFilterMenu === 'date' && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <input type="date" value={filters.targetDate} onChange={(e) => { setFilters(p => ({ ...p, targetDate: e.target.value })); setOpenFilterMenu(null); }} />
                </div>
              )}
            </div>

            <div className="header-cell room-col" onClick={(e) => { e.stopPropagation(); setOpenFilterMenu(openFilterMenu === 'room' ? null : 'room'); }}>
              地點 <i className="fa-solid fa-filter" style={{ color: filters.roomID ? "#d9534f" : "#ccc" }}></i>
              {openFilterMenu === 'room' && (
                <div className="header-filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <select value={filters.roomID} onChange={(e) => { setFilters(p => ({ ...p, roomID: e.target.value })); setOpenFilterMenu(null); }}>
                    <option value="">全部地點</option>
                    {rooms.map(r => <option key={r.roomID} value={r.roomID}>{r.placeName}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="header-cell reserved-col">報名狀態</div>
            <div className="header-cell status-col">費用/狀態</div>
            <div className="header-cell action-col">操作</div>
          </div>

          <div className="scroll-area exam-content">
            {filteredExams.length === 0 && !globalLoading ? (
              <p className="empty-text">找不到符合條件的考試場次</p>
            ) : (
              <ul className="modern-list manager-list">
                {filteredExams.map((exam) => {
                  const isEditing = editingExamID === exam.examID;
                  const displaySubjectName = subjectMap[exam.subjectID] || "未知科目";

                  const safeStartTime = typeof exam.examStartTime === "string" ? exam.examStartTime : "";
                  const safeEndTime = typeof exam.examEndTime === "string" ? exam.examEndTime : "";

                  const origDate = safeStartTime.includes("T") ? safeStartTime.split("T")[0] : "未指定日期";
                  const origStart = safeStartTime.includes("T") ? safeStartTime.split("T")[1].substring(0, 5) : "--:--";
                  const origEnd = safeEndTime.includes("T") ? safeEndTime.split("T")[1].substring(0, 5) : "--:--";

                  const locationDisplay = exam.roomID ? (roomMap[exam.roomID] || exam.roomID) : "未指定";

                  return (
                    <li key={exam.examID} className={`list-item ${isEditing ? 'editing-mode' : ''}`}>
                      <div className="text-group">

                        <div className="subject-col">
                          <span className="name">{displaySubjectName}</span>
                          {exam.examID}
                        </div>

                        <div className="time-col">
                          {isEditing ? (
                            <div className="inline-edit-group">
                              <input type="date" name="examDate" value={editFormData.examDate} onChange={handleEditChange} className="edit-input" />
                              <div className="inline-time-selects">
                                <select name="startTime" value={editFormData.startTime} onChange={handleEditChange} className="edit-input">
                                  {TIME_OPTIONS.map(t => <option key={`estart-${t}`} value={t}>{t}</option>)}
                                </select>
                                <span>-</span>
                                <select name="endTime" value={editFormData.endTime} onChange={handleEditChange} className="edit-input">
                                  {TIME_OPTIONS.map(t => <option key={`eend-${t}`} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="time-display">
                              <i className="fa-regular fa-clock clock-icon"></i>
                              <div className="time-text">
                                <span className="date-part">{origDate}</span>
                                <span className="range-part">{origStart} - {origEnd}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="room-col">
                          <div className="sub-detail" title={locationDisplay}><i className="fa-solid fa-location-dot"></i> {locationDisplay}</div>
                        </div>

                        <div className="reserved-col">
                          <div className="sub-detail"><i className="fa-solid fa-user-check"></i> 已報名: {exam.numHasReserved || 0}</div>
                          <div className="sub-detail">
                            <i className="fa-solid fa-users-line"></i> 人數上限: {exam.numPeopleLimit || 0}
                          </div>
                        </div>

                        <div className="status-col">
                          {isEditing ? (
                            <div className="inline-edit-group">
                              <div className="edit-row"><i className="fa-solid fa-sack-dollar"></i> <input type="number" name="fee" value={editFormData.fee} onChange={handleEditChange} className="edit-input short-num" /></div>
                              <div className="edit-row"><i className="fa-solid fa-tag"></i>
                                <select name="status" value={editFormData.status} onChange={handleEditChange} className="edit-input">
                                  <option value="Open">Open</option>
                                  <option value="Draft">Draft</option>
                                  <option value="Closed">Closed</option>
                                  <option value="Cancelled">Cancelled</option>
                                </select>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="sub-detail"><i className="fa-solid fa-sack-dollar"></i> ${exam.fee}</div>
                              <div className="sub-detail"><i className="fa-solid fa-tag"></i> {exam.status}</div>
                            </>
                          )}
                        </div>

                        <div className="action-col">
                          {isEditing ? (
                            <>
                              <button className="btn-icon btn-save" onClick={() => attemptSaveEdit(exam)} title="儲存修改"><i className="fa-solid fa-check"></i></button>
                              <button className="btn-icon btn-cancel" onClick={cancelEditing} title="取消編輯"><i className="fa-solid fa-xmark"></i></button>
                            </>
                          ) : (
                            <>
                              <button className="btn-icon btn-edit" onClick={() => startEditing(exam)} title="編輯場次"><i className="fa-solid fa-pen"></i></button>
                              <button className="btn-icon btn-delete" onClick={() => handleDeleteClick(exam.examID)} title="刪除場次" disabled={globalLoading}>
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            </>
                          )}
                        </div>

                        <div className="inCharge" >
                          <i className="fa-solid fa-user-tie"></i>
                          <span>考試負責人：<strong className="in-charge-name">{exam.createdBy || "未指定"}</strong></span>
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
    </div>
  );
}