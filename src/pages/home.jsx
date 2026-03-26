import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import { STORAGE_KEYS, REGISTRATION_DEADLINE_DAYS, EXAM_LANGUAGE } from "../config";
import {
  fetchReservationsAPI,
  submitReservationAPI,
  fetchSubjectsRawAPI,
  fetchRoomsAPI,
  subscribeNoticeAPI
} from "../api";

// --- 常數定義 ---
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 確保 Storage Keys 讀寫一致
const STORAGE_KEY_SUBJECT = STORAGE_KEYS?.SUBJECT_FILTER || "savedSubjects";
const STORAGE_KEY_ROOM = STORAGE_KEYS?.ROOM_FILTER || "savedRooms";

// 格式化日期字串 YYYY-MM-DD
const getLocalDateString = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const date = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
};

export default function Home() {
  const navigate = useNavigate();
  const { user, setLoadingText, setGlobalLoading, setSubmit, requestCaptcha } = useOutletContext();

  // --- UI 與時間 State ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedDateStr, setExpandedDateStr] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState(null);

  // --- 資料清單 State ---
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [roomsList, setRoomsList] = useState([]);

  // --- 載入狀態 ---
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [isSubjectsLoading, setIsSubjectsLoading] = useState(false);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isAnyLoading = isRefreshing || isEventsLoading || isSubjectsLoading || isRoomsLoading;

  // --- 篩選器與下拉選單 State & Refs ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);

  const datePickerRef = useRef(null);
  const subjectRef = useRef(null);
  const roomRef = useRef(null);
  const cellRefs = useRef({});
  const popoverRef = useRef(null);

  // 初始化與同步 SessionStorage
  const [selectedSubjects, setSelectedSubjects] = useState(() => JSON.parse(sessionStorage.getItem(STORAGE_KEY_SUBJECT) || "[]"));
  const [selectedRooms, setSelectedRooms] = useState(() => JSON.parse(sessionStorage.getItem(STORAGE_KEY_ROOM) || "[]"));

  useEffect(() => sessionStorage.setItem(STORAGE_KEY_SUBJECT, JSON.stringify(selectedSubjects)), [selectedSubjects]);
  useEffect(() => sessionStorage.setItem(STORAGE_KEY_ROOM, JSON.stringify(selectedRooms)), [selectedRooms]);

  // 表單資料
  const [formData, setFormData] = useState({
    email: "", lastname: "", firstname: "", phone: "",
    subject: "", language: "", room: "", certiport: false, certiportAccount: ""
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // --- API 呼叫邏輯 ---
  const loadSubjects = async () => {
    setIsSubjectsLoading(true);
    try {
      const subs = await fetchSubjectsRawAPI();
      if (Array.isArray(subs)) setSubjectsList(subs);
    } catch (error) { console.error("科目載入失敗:", error); }
    finally { setIsSubjectsLoading(false); }
  };

  const loadRooms = async (forceReset = false) => {
    setIsRoomsLoading(true);
    try {
      const rooms = await fetchRoomsAPI();
      if (Array.isArray(rooms)) {
        setRoomsList(rooms);
        if (rooms.length > 0 && (forceReset || selectedRooms.length === 0)) {
          setSelectedRooms([rooms[0].roomID]);
        }
      }
    } catch (error) { console.error("考場載入失敗:", error); }
    finally { setIsRoomsLoading(false); }
  };

  const loadCalendarEvents = async () => {
    setIsEventsLoading(true);
    try {
      const events = await fetchReservationsAPI();
      // console.log(events)
      if (Array.isArray(events)) setCalendarEvents(events);
    }
    catch (error) { console.error("預約狀況載入失敗:", error); }
    finally { setIsEventsLoading(false); }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSubmit(false); // 確保取得資料時關閉 Submit 狀態
    setSelectedSubjects([]);
    setSelectedRooms([]);
    await Promise.all([
      loadCalendarEvents(),
      loadSubjects(),
      loadRooms(true)
    ]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    const initLoad = () => {
      setSubmit(false); // 確保取得初始資料時關閉 Submit 狀態
      loadSubjects();
      loadRooms();
      loadCalendarEvents();
    };
    initLoad();

    const handlePageShow = (e) => e.persisted && initLoad();
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) setShowDatePicker(false);
      if (subjectRef.current && !subjectRef.current.contains(e.target)) setShowSubjectDropdown(false);
      if (roomRef.current && !roomRef.current.contains(e.target)) setShowRoomDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFilter = (e, item, type) => {
    e.stopPropagation();
    const setFn = type === 'subject' ? setSelectedSubjects : setSelectedRooms;
    setFn(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  // --- Popover 位置計算 ---
  useEffect(() => {
    if (!expandedDateStr) return;
    const calculatePosition = () => {
      const cellEl = cellRefs.current[expandedDateStr];
      if (!cellEl) return;

      const rect = cellEl.getBoundingClientRect();
      const { innerWidth: winW, innerHeight: winH } = window;
      const gap = 8;

      let left = Math.max(gap, rect.right + gap + 220 > winW ? rect.left - 220 - gap : rect.right + gap);
      const isBottomHalf = rect.top > (winH / 2);

      setPopoverPosition({
        position: 'fixed', zIndex: 100, display: 'flex', flexDirection: 'column', left: `${left}px`,
        top: isBottomHalf ? 'auto' : `${rect.top}px`,
        bottom: isBottomHalf ? `${Math.max(gap, winH - rect.bottom)}px` : 'auto',
        maxHeight: isBottomHalf ? `${winH - (winH - rect.bottom) - gap * 2}px` : `${winH - rect.top - gap}px`
      });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [expandedDateStr]);

  // --- 日曆資料計算 ---
  const { calendarCells, weeksCount } = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const todayStr = getLocalDateString(new Date());

    const deadlineObj = new Date();
    deadlineObj.setDate(deadlineObj.getDate() + REGISTRATION_DEADLINE_DAYS);
    const deadlineStr = getLocalDateString(deadlineObj);

    const filteredEvents = calendarEvents.filter(r =>
      (selectedSubjects.length === 0 || selectedSubjects.includes(r.subjectName) || selectedSubjects.includes(r.title)) &&
      (selectedRooms.length === 0 || selectedRooms.includes(r.roomID))
    );

    const cells = Array.from({ length: firstDay }, (_, i) => ({ type: "empty", id: `empty-${i}` }));

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getLocalDateString(new Date(year, month, d));
      cells.push({
        type: "day", day: d, dateStr,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
        isDeadlineClosed: dateStr >= todayStr && dateStr <= deadlineStr,
        events: filteredEvents.filter(r => r.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime))
      });
    }

    return { calendarCells: cells, weeksCount: Math.ceil(cells.length / 7) };
  }, [year, month, calendarEvents, selectedSubjects, selectedRooms]);

  const getRoomLabel = (roomID) => roomsList.find(l => l.roomID === roomID)?.placeName || roomID;

  // --- 互動事件處理 ---
  const handleEventClick = async (e, evt, isDayDisabled) => {
    e.stopPropagation();

    if (isDayDisabled) return;

    if (!localStorage.getItem(STORAGE_KEYS.TOKEN)) {
      if (window.confirm("需登入會員才可查看詳細資訊或進行報名。\n是否前往登入頁面？")) navigate("/login");
      return;
    }

    const currentStatus = (evt.status || "Open").toUpperCase();

    // ✨ 邏輯 1：如果是 Canceled 狀態，跳出警告並阻擋開啟表單
    if (currentStatus === "CANCELLED" || currentStatus === "CANCELED") {
      alert("⚠️ 考試已取消");
      return;
    }

    // ✨ 邏輯 2：如果是 Draft 狀態，詢問是否要接收通知
    if (currentStatus === "DRAFT") {
      const wantsNotification = window.confirm("💡 此考試目前尚未開放報名。\n當考試轉為「開放報名」時，是否希望接收 Email 通知？");
      if (wantsNotification) {
        setLoadingText("正在為您登記通知...");
        setSubmit(true);
        setGlobalLoading(true);
        try {
          await subscribeNoticeAPI({ examID: evt.id, email: user?.email });
          alert("✅ 已為您登記！開放報名時將會寄發通知至您的信箱。");
        } catch (error) {
          console.error("訂閱通知失敗:", error);
          alert(`登記失敗，請稍後再試：${error.message}`);
        } finally {
          setLoadingText("");
          setSubmit(false);
          setGlobalLoading(false);
        }
      }
    }

    // ✨ 邏輯 3：如果是 Close 狀態，跳出警告並附上聯絡電話 (但依然會打開表單以供檢視)
    if (currentStatus === "CLOSE" || currentStatus === "CLOSED") {
      const targetRoom = roomsList.find(r => r.roomID === evt.roomID);
      const roomPhone = targetRoom?.phoneNumber || "未提供聯絡電話";
      alert(`⚠️ 考試報名已經關閉，如有問題請洽負責人。\n聯絡電話：${roomPhone}`);
    }

    // 打開表單並帶入資料
    setSelectedEvent(evt);
    setFormData({
      email: user?.email || "", lastname: user?.lastname || "", firstname: user?.firstname || "",
      phone: user?.phoneNumber || "", subject: evt.title || evt.subjectName || "其他",
      language: "繁體中文", room: evt.location || "", certiport: false, certiportAccount: ""
    });
    setExpandedDateStr(null);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.confirm(`確定要報名 ${formData.subject} 嗎？`)) return;

    const recaptchaToken = await requestCaptcha();
    if (!recaptchaToken) return; // 如果沒有取得 Token，代表驗證失敗或取消，直接中斷

    setLoadingText("正在進行安全驗證與送出報名資料...");
    setSubmit(true);
    setGlobalLoading(true);

    try {
      const result = await submitReservationAPI({
        examID: selectedEvent.id,
        lastname: formData.lastname, firstname: formData.firstname,
        phone: formData.phone, language: formData.language,
        location: formData.room,
        certiport: formData.certiport, certiportAccount: formData.certiportAccount,
        token: recaptchaToken
      });
      alert(`報名成功！\n報名序號：${result.data.reserveID}`);
      await loadCalendarEvents();
    } catch (error) {
      // ✨ 取消了前端阻擋重複報名的判斷，統一顯示錯誤訊息（如果後端還是會阻擋，則顯示後端訊息）
      alert(`報名失敗：${error.message}`);
    } finally {
      setLoadingText(""); setSubmit(false); setGlobalLoading(false); setSelectedEvent(null);
    }
  };

  const renderEventPill = (evt, isDayDisabled) => {
    const isFull = evt.registeredCount >= evt.capacity;
    // 判斷是否為取消狀態，以便在月曆介面顯示樣式
    const isCanceled = (evt.status || "Open").toUpperCase() === "CANCELLED" || (evt.status || "Open").toUpperCase() === "CANCELED";
    const canClick = !isDayDisabled;

    return (
      <div key={evt.id}
        className={`event-pill ${!canClick || isFull || isCanceled ? "disabled-pill" : ""}`}
        style={{
          backgroundColor: evt.color || "#e0e0e0",
          color: evt.textColor || "#333",
          cursor: canClick ? "pointer" : "not-allowed",
          opacity: canClick ? 1 : 0.6
        }}
        title={`${evt.startTime} ${evt.title} (${evt.registeredCount}/${evt.capacity})`}
        onClick={(e) => {
          if (canClick) handleEventClick(e, evt, isDayDisabled);
        }}
      >
        <span className="event-time-pill">
          {evt.startTime}
          <span className="reservedStatus">
            <strong>{isCanceled ? "(取消)" : isFull ? "(額滿)" : `(${evt.registeredCount}/${evt.capacity})`}</strong>
          </span>
        </span>
        <span className="event-title-pill">{evt.title}</span>
      </div>
    );
  };

  const maxVisible = weeksCount > 4 ? 1 : 2;

  const currentExamStatus = selectedEvent ? (selectedEvent.status || "Open").toUpperCase() : "OPEN";
  const isExamOpen = currentExamStatus === "OPEN";
  const isExamDraft = currentExamStatus === "DRAFT";
  const isExamClosed = currentExamStatus === "CLOSE" || currentExamStatus === "CLOSED";
  const isFull = selectedEvent ? selectedEvent.registeredCount >= selectedEvent.capacity : false;
  const isFormDisabled = !isExamOpen || isFull;

  // --- Render ---
  return (
    <div className="calendar-container centered-form">
      <div className="calendar-header">
        <div className="header-left">
          <h1>預約狀況總覽</h1>
          <button onClick={handleRefresh} disabled={isAnyLoading} className="btn-refresh"
            style={{ cursor: isAnyLoading ? 'not-allowed' : 'pointer', transform: isAnyLoading ? 'rotate(360deg)' : 'none', transition: isAnyLoading ? 'transform 1s linear infinite' : 'all 1s' }} title="重新整理">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
            </svg>
          </button>
        </div>

        <div className="header-options">
          {/* 科目篩選選單 */}
          <div className="custom-select-bar" ref={subjectRef} onClick={() => setShowSubjectDropdown(!showSubjectDropdown)}>
            <div className="select-tags-container">
              {selectedSubjects.length === 0 ? (
                <span className="placeholder-text">{isSubjectsLoading ? "讀取資料中..." : "篩選欲考科目"}</span>
              ) : (
                selectedSubjects.map(sub => (
                  <span key={sub} className="selected-tag">{sub} <button type="button" className="remove-tag-btn" onClick={(e) => toggleFilter(e, sub, 'subject')}>&times;</button></span>
                ))
              )}
            </div>
            <span className="dropdown-arrow">▼</span>
            {showSubjectDropdown && (
              <div className="custom-dropdown-menu">
                {isSubjectsLoading ? <div className="dropdown-item text-muted">載入中...</div> : subjectsList.length === 0 ? <div className="dropdown-item">無資料</div> : (
                  subjectsList.map(sub => (
                    <div key={sub.subjectID} className="dropdown-item" onClick={(e) => toggleFilter(e, sub.subjectName, 'subject')}>
                      <span>{sub.subjectName}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 考場篩選選單 */}
          <div className="custom-select-bar" ref={roomRef} onClick={() => setShowRoomDropdown(!showRoomDropdown)}>
            <div className="select-tags-container">
              {selectedRooms.length === 0 ? (
                <span className="placeholder-text">{isRoomsLoading ? "讀取資料中..." : "篩選考場"}</span>
              ) : (
                selectedRooms.map(rID => (
                  <span key={rID} className="selected-tag">{getRoomLabel(rID)} <button type="button" className="remove-tag-btn" onClick={(e) => toggleFilter(e, rID, 'room')}>&times;</button></span>
                ))
              )}
            </div>
            <span className="dropdown-arrow">▼</span>
            {showRoomDropdown && (
              <div className="custom-dropdown-menu">
                {isRoomsLoading ? <div className="dropdown-item text-muted">載入中...</div> : roomsList.length === 0 ? <div className="dropdown-item">無資料</div> : (
                  roomsList.map(loc => (
                    <div key={loc.roomID} className="dropdown-item" onClick={(e) => toggleFilter(e, loc.roomID, 'room')}>
                      <span>{loc.placeName}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="header-controls">
          <button className="btn-nav" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>&lt;</button>
          <div className="date-picker-container" ref={datePickerRef}>
            <button className="current-date-btn" onClick={() => setShowDatePicker(!showDatePicker)} title="切換年月">
              {year} 年 {month + 1} 月 <span className="dropdown-arrow">▼</span>
            </button>
            {showDatePicker && (
              <div className="date-picker-popup">
                <div className="dp-header">
                  <button onClick={() => setCurrentDate(new Date(year - 1, month, 1))}>&lt;</button>
                  <span className="dp-year">{year}</span>
                  <button onClick={() => setCurrentDate(new Date(year + 1, month, 1))}>&gt;</button>
                </div>
                <div className="dp-months-grid">
                  {Array.from({ length: 12 }, (_, i) => (
                    <button key={i} className={`dp-month-btn ${month === i ? 'active' : ''}`} onClick={() => { setCurrentDate(new Date(year, i, 1)); setShowDatePicker(false); }}>{i + 1}月</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="btn-nav" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>&gt;</button>
          <button className="btn-today" onClick={() => setCurrentDate(new Date())}>今天</button>
        </div>
      </div>

      {/* 月曆主體 */}
      <div className="calendar-wrapper-month">
        <div className="weekday-header">{WEEKDAYS.map((day) => (<div key={day} className="weekday-cell">{day}</div>))}</div>
        <div className="month-grid">
          {calendarCells.map((cell) => {
            if (cell.type === "empty") return <div key={cell.id} className="calendar-cell empty"></div>;

            if (isAnyLoading) {
              return (
                <div key={cell.dateStr} className={`calendar-cell ${cell.isPast ? "past" : ""} ${cell.isToday ? "today-cell" : ""}`}>
                  <div className="cell-header"><span className={`day-number ${cell.isToday ? "today-badge" : ""}`}>{cell.day}</span></div>
                  <div className="cell-content loading"><span className="cell-loading-text">讀取中...</span></div>
                </div>
              );
            }

            const isDayDisabled = cell.isPast || cell.isDeadlineClosed;
            const visibleEvents = cell.events.slice(0, maxVisible);
            const hiddenCount = cell.events.length - maxVisible;

            return (
              <div key={cell.dateStr} ref={(el) => cellRefs.current[cell.dateStr] = el} className={`calendar-cell ${cell.isPast ? "past" : ""} ${cell.isToday ? "today-cell" : ""}`}>
                <div className="cell-header">
                  <span className={`day-number ${cell.isToday ? "today-badge" : ""}`}>{cell.day}</span>
                  {cell.isDeadlineClosed && <span className="deadline-badge">已截止報名</span>}
                </div>
                <div className="cell-content">
                  {visibleEvents.map(evt => renderEventPill(evt, isDayDisabled))}
                  {hiddenCount > 0 && (
                    <div className={`more-events-btn ${isDayDisabled ? 'disabled-pill' : ''}`}
                      style={{ cursor: isDayDisabled ? 'not-allowed' : 'pointer' }}
                      onClick={(e) => {
                        if (!isDayDisabled) {
                          e.stopPropagation(); setExpandedDateStr(cell.dateStr);
                        }
                      }}>
                      還有 {hiddenCount} 個考試...
                    </div>
                  )}
                </div>

                {expandedDateStr === cell.dateStr && popoverPosition && createPortal(
                  <>
                    <div className="popover-backdrop" onClick={(e) => { e.stopPropagation(); setExpandedDateStr(null); }}></div>
                    <div ref={popoverRef} className="day-popover" style={popoverPosition}>
                      <div className="popover-header">
                        <span className="popover-date">{cell.day} 日 ({WEEKDAYS[new Date(cell.dateStr).getDay()]})</span>
                        <button className="popover-close" onClick={(e) => { e.stopPropagation(); setExpandedDateStr(null); }}>&times;</button>
                      </div>
                      <div className="popover-content">{cell.events.map(evt => renderEventPill(evt, isDayDisabled))}</div>
                    </div>
                  </>, document.body
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 報名確認視窗 */}
      {selectedEvent && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content exam-form-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              考試報名
              {/* ✨ 已報名過的考試，加註提示文字 */}
              {selectedEvent.hasRegistered && (
                <span style={{ color: "#d9534f", fontSize: "0.8em", marginLeft: "8px", fontWeight: "normal" }}>
                  (已經報名過)
                </span>
              )}
              {/* 👇 ✨ 根據狀態顯示不同的標題提示文字 */}
              {isExamDraft && <span className="exam-closed-warning">(目前尚未開放報名)</span>}
              {isExamClosed && <span className="exam-closed-warning">(已關閉報名)</span>}
            </h3>
            <div className="modal-info-block">
              <p><strong>時間：</strong> {selectedEvent.date} {selectedEvent.startTime} ~ {selectedEvent.endTime}</p>
              <p><strong>考試費用：</strong> {selectedEvent.fee}</p>
              <p><strong>名額狀況：</strong> <span style={{ color: isFull ? 'red' : 'green' }}>{isFull ? "已額滿" : `剩餘 ${selectedEvent.capacity - selectedEvent.registeredCount} 名額`}</span></p>
            </div>

            <form onSubmit={handleSubmit} className="exam-form">
              <div className="form-group">
                <label>電子郵件</label><input type="email" name="email" className="input-disabled" value={formData.email} disabled />
              </div>
              <div className="form-group">
                <label>Certiport帳號 <span className="required-mark">*</span></label>
                <input type="text" name="certiportAccount" value={formData.certiportAccount} onChange={handleFormChange} required disabled={isFormDisabled} className={isFormDisabled ? "input-disabled" : ""} />
              </div>
              <div className="form-row">
                <div className="form-group half"><label>姓 (Last Name) <span className="required-mark">*</span></label><input type="text" name="lastname" value={formData.lastname} onChange={handleFormChange} required disabled={isFormDisabled} className={isFormDisabled ? "input-disabled" : ""} /></div>
                <div className="form-group half"><label>名 (First Name) <span className="required-mark">*</span></label><input type="text" name="firstname" value={formData.firstname} onChange={handleFormChange} required disabled={isFormDisabled} className={isFormDisabled ? "input-disabled" : ""} /></div>
              </div>
              <div className="form-row">
                <div className="form-group half"><label>電話 <span className="required-mark">*</span></label><input type="tel" name="phone" value={formData.phone} onChange={handleFormChange} required disabled={isFormDisabled} className={isFormDisabled ? "input-disabled" : ""} /></div>
                <div className="form-group half">
                  <label>考試語言 <span className="required-mark">*</span></label>
                  <select name="language" value={formData.language} onChange={handleFormChange} required disabled={isFormDisabled} className={isFormDisabled ? "input-disabled" : ""}>
                    <option value="" disabled>請選擇語言</option>
                    <option value="繁體中文">繁體中文</option>
                    <option value="English">English</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group half"><label>考試科目</label><input name="subject" value={formData.subject} className="input-disabled" disabled /></div>
                <div className="form-group half"><label>考場</label><input type="text" name="room" value={formData.room} className="input-disabled" disabled /></div>
              </div>
              <div className="form-group checkbox-group">
                <label><input type="checkbox" name="certiport" checked={formData.certiport} onChange={handleFormChange} disabled={isFormDisabled} /><span>加購 Certiport Exam Replay 優惠加值方案</span></label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setSelectedEvent(null)}>取消</button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={isFormDisabled}
                >
                  {isFormDisabled
                    ? (isFull ? "已額滿" : (isExamDraft ? "尚未開放" : (isExamClosed ? "已關閉" : "不可報名")))
                    : "確認報名"}
                </button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}