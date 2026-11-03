import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { STORAGE_KEYS, REGISTRATION_DEADLINE_DAYS, EXAM_LANGUAGE, CERTIPORT_FEE } from "../config";
import PublicExamDetails from "../features/booking/PublicExamDetails.jsx";
import { PENDING_BOOKING_KEY } from "../features/booking/utils";
import {
  fetchReservationsAPI,
  submitReservationAPI,
  fetchSubjectsRawAPI,
  fetchRoomsAPI,
  subscribeNoticeAPI
} from "../api";
import { confirmDialog, notify } from "../dialog";

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
  const [detailEvent, setDetailEvent] = useState(null);
  const submissionKey = useRef(crypto.randomUUID());
  const calendarLoadSequence = useRef(0);
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
  const monthWrapperRef = useRef(null);

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
    const sequence = ++calendarLoadSequence.current;
    setIsEventsLoading(true);
    try {
      const events = await fetchReservationsAPI();
      if (sequence !== calendarLoadSequence.current) return;
      // console.log(events)
      if (Array.isArray(events)) setCalendarEvents(events);
      const pending = sessionStorage.getItem(PENDING_BOOKING_KEY);
      const wantsNotice = pending?.startsWith("notice:");
      if (pending && user && (user.phoneNumber || wantsNotice) && Array.isArray(events)) {
        sessionStorage.removeItem(PENDING_BOOKING_KEY);
        const event = events.find(exam => exam.id === (wantsNotice ? pending.slice(7) : pending));
        if (event) {
          setCurrentDate(new Date(event.startTimeISO));
          if (wantsNotice && String(event.status).toUpperCase() === "DRAFT") await subscribe(event);
          else if (wantsNotice) setDetailEvent(event);
          else beginBooking(event);
        }
        else notify("原場次已不存在，請重新選擇。");
      }
    }
    catch (error) { console.error("預約狀況載入失敗:", error); }
    finally { if (sequence === calendarLoadSequence.current) setIsEventsLoading(false); }
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
  }, [user?.email, user?.phoneNumber]);

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
  const handleEventClick = (e, evt) => {
    e.stopPropagation();
    setDetailEvent(evt); setExpandedDateStr(null);
  };
  const beginBooking = (evt) => {
    if (!user || !localStorage.getItem(STORAGE_KEYS.TOKEN)) {
      sessionStorage.setItem(PENDING_BOOKING_KEY, evt.id); navigate("/login"); return;
    }
    if (!user.phoneNumber) { sessionStorage.setItem(PENDING_BOOKING_KEY, evt.id); navigate("/account", { state: { emptyPhoneNumber: true } }); return; }
    if (evt.hasRegistered) {
      setDetailEvent(null);
      notify("您已報名這個場次，可在「我的考試」查看進度。");
      navigate("/myReserve");
      return;
    }
    const deadline = evt.registrationDeadline || new Date(new Date(evt.startTimeISO).getTime() - REGISTRATION_DEADLINE_DAYS * 86400000);
    if (String(evt.status || "Open").toUpperCase() !== "OPEN" || evt.registeredCount >= evt.capacity || new Date(deadline) <= new Date()) {
      setDetailEvent(evt); notify("此場次目前無法報名，請查看最新資訊。"); return;
    }
    setDetailEvent(null); submissionKey.current = crypto.randomUUID();
    // 打開表單並帶入資料
    setSelectedEvent(evt);
    setFormData({
      email: user?.email || "", lastname: user?.lastname || "", firstname: user?.firstname || "",
      phone: user?.phoneNumber || "", subject: evt.title || evt.subjectName || "其他",
      language: "繁體中文", room: evt.location || "", certiport: false, certiportAccount: ""
    });
    setExpandedDateStr(null);
  };
  const subscribe = async evt => {
    if (!user) { sessionStorage.setItem(PENDING_BOOKING_KEY, "notice:" + evt.id); navigate("/login"); return; }
    setGlobalLoading(true); setLoadingText("正在登記開放通知…");
    try { await subscribeNoticeAPI({ examID: evt.id }); notify("已登記開放通知。"); }
    catch (error) { notify(error.message); } finally { setGlobalLoading(false); setLoadingText(""); }
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!(await confirmDialog(`確定要報名 ${formData.subject} 嗎？`))) return;

    const recaptchaToken = await requestCaptcha();
    if (!recaptchaToken) return; // 如果沒有取得 Token，代表驗證失敗或取消，直接中斷

    setLoadingText("正在進行安全驗證與送出報名資料...");
    setSubmit(true);
    setGlobalLoading(true);

    try {
      const result = await submitReservationAPI({
        submissionKey: submissionKey.current,
        examID: selectedEvent.id,
        lastname: formData.lastname, firstname: formData.firstname,
        phone: formData.phone, language: formData.language,
        location: formData.room,
        certiport: formData.certiport, certiportAccount: formData.certiportAccount,
        token: recaptchaToken
      });
      notify(`報名成功！\n報名序號：${result.data.reserveID}`);
      await loadCalendarEvents();
    } catch (error) {
      // ✨ 取消了前端阻擋重複報名的判斷，統一顯示錯誤訊息（如果後端還是會阻擋，則顯示後端訊息）
      notify(`報名失敗：${error.message}`);
    } finally {
      setLoadingText(""); setSubmit(false); setGlobalLoading(false); setSelectedEvent(null);
    }
  };

  // isDayDisabled：這一天已過或已超過報名截止日。色塊會變淡 (仍可點開看詳情)，日期格子本身不變
  const renderEventPill = (evt, isDayDisabled = false) => {
    const isFull = evt.registeredCount >= evt.capacity;
    // 判斷是否為取消狀態，以便在月曆介面顯示樣式
    const isCanceled = (evt.status || "Open").toUpperCase() === "CANCELLED" || (evt.status || "Open").toUpperCase() === "CANCELED";
    const canClick = true;

    // 右側的名額標籤：直接寫「剩幾位」，不能報名時寫原因 (原本的 9/40 看不出是已報名還是剩餘)
    const status = (evt.status || "Open").toUpperCase();
    const remaining = Math.max(0, evt.capacity - evt.registeredCount);
    let seats = { text: `剩 ${remaining} 位`, type: remaining <= 3 ? "warning" : "" };
    if (isCanceled) seats = { text: "已取消", type: "neutral" };
    else if (isDayDisabled) seats = { text: "已截止", type: "neutral" };
    else if (status === "DRAFT") seats = { text: "未開放", type: "neutral" };
    else if (status === "CLOSE" || status === "CLOSED") seats = { text: "已關閉", type: "neutral" };
    else if (isFull) seats = { text: "額滿", type: "danger" };

    return (
      <div key={evt.id}
        className={`event-pill ${!canClick || isFull || isCanceled || isDayDisabled ? "disabled-pill" : ""} ${canClick ? "" : "locked"}`}
        // 科目顏色由後端提供，用 CSS 變數傳給樣式表；怎麼上色 (淺色模式淡化、深色模式實色) 由 CSS 決定
        style={{ "--event-color": evt.color || undefined, "--event-ink": evt.textColor || undefined }}
        title={`${evt.startTime} ${evt.title}｜已報名 ${evt.registeredCount} / ${evt.capacity}，${seats.type === "neutral" || isFull ? seats.text : `剩餘 ${remaining} 名額`}`}
        onClick={(e) => {
          handleEventClick(e, evt);
        }}
      >
        <span className="event-time-pill">{evt.startTime}</span>
        <span className="event-title-pill">{evt.title}</span>
        <span className={`event-seats ${seats.type}`}>{seats.text}</span>
      </div>
    );
  };

  // --- 手機版清單：只列出當月今天以後、有考試的日期 ---
  const agendaDays = calendarCells.filter(cell => cell.type === "day" && !cell.isPast && cell.events.length > 0);

  const renderAgendaItem = (evt, isDayDisabled) => {
    const status = (evt.status || "Open").toUpperCase();
    const isFull = evt.registeredCount >= evt.capacity;
    const isCanceled = status === "CANCELLED" || status === "CANCELED";
    const remaining = Math.max(0, evt.capacity - evt.registeredCount);
    // 已截止或已取消的場次點了也不能做任何事，直接設為不可點，外觀上也要看得出來
    const canClick = true;

    // 右側狀態標籤：依優先順序只顯示一個
    let badge = { text: `剩 ${remaining} 位`, type: remaining <= 3 ? "warning" : "success" };
    if (isCanceled) badge = { text: "已取消", type: "danger" };
    else if (isDayDisabled) badge = { text: "報名已截止", type: "neutral" };
    else if (status === "DRAFT") badge = { text: "尚未開放", type: "neutral" };
    else if (status === "CLOSE" || status === "CLOSED") badge = { text: "已關閉", type: "neutral" };
    else if (isFull) badge = { text: "額滿", type: "danger" };

    return (
      <button
        key={evt.id}
        type="button"
        className={`agenda-item ${canClick ? "" : "unavailable"}`}
        style={{ "--event-color": isFull || !canClick ? undefined : evt.color }}
        disabled={!canClick}
        onClick={(e) => handleEventClick(e, evt, isDayDisabled)}
      >
        <span className="agenda-time">
          {evt.startTime}
          {evt.endTime && <small>{evt.endTime}</small>}
        </span>
        <span className="agenda-main">
          <span className="agenda-title">{evt.title}</span>
          <span className="agenda-meta">
            <i className="fa-solid fa-location-dot"></i>
            {evt.location || getRoomLabel(evt.roomID)}
          </span>
        </span>
        <span className="agenda-side">
          <span className={`agenda-badge ${badge.type}`}>{badge.text}</span>
          {evt.hasRegistered && <span className="agenda-badge registered">已報名</span>}
        </span>
        {/* 可點的場次顯示箭頭，不可點的顯示鎖頭 */}
        <i className={`agenda-arrow fa-solid ${canClick ? "fa-chevron-right" : "fa-lock"}`}></i>
      </button>
    );
  };

  // 月曆每一格放得下幾列科目。把月曆可用的高度平均分給各週再扣掉日期列，
  // 而不是量格子目前的高度 (格子會被內容撐高，量它會越算越多)。
  // 視窗大小、週數改變時重算；讀取完成後也重算一次，才量得到科目色塊實際的高度
  // all：全部顯示時最多幾個；withMore：最後一列要放「還有 N 個考試」時還能顯示幾個 (那一列比科目色塊矮)
  const [rowCapacity, setRowCapacity] = useState({ all: 2, withMore: 1 });
  useEffect(() => {
    const wrapper = monthWrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const cell = wrapper.querySelector(".calendar-cell:not(.empty)");
      // 手機改用清單檢視時月曆是隱藏的，高度為 0，不用算
      if (!cell || !wrapper.clientHeight) return;
      const header = cell.querySelector(".cell-header"), content = cell.querySelector(".cell-content");
      const cellStyle = getComputedStyle(cell);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(getComputedStyle(content).rowGap) || 0;
      const pillHeight = wrapper.querySelector(".event-pill")?.offsetHeight || 1.65 * rem;
      const moreHeight = wrapper.querySelector(".more-events-btn")?.offsetHeight || 1.3 * rem;
      const weekHeight = (wrapper.clientHeight - (wrapper.querySelector(".weekday-header")?.offsetHeight || 0)) / weeksCount;
      const available = weekHeight - parseFloat(cellStyle.paddingTop) - parseFloat(cellStyle.paddingBottom) - parseFloat(cellStyle.borderBottomWidth)
        - header.offsetHeight - parseFloat(getComputedStyle(header).marginBottom);
      const all = Math.max(1, Math.floor((available + gap) / (pillHeight + gap)));
      const withMore = Math.max(1, Math.floor((available - moreHeight) / (pillHeight + gap)));
      // 數字沒變就沿用原本的物件，避免多餘的重新繪製
      setRowCapacity((previous) => (previous.all === all && previous.withMore === withMore ? previous : { all, withMore }));
    };
    // ResizeObserver 開始觀察時就會觸發一次，等於初始計算
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [weeksCount, isAnyLoading]);

  const currentExamStatus = selectedEvent ? (selectedEvent.status || "Open").toUpperCase() : "OPEN";
  const isExamOpen = currentExamStatus === "OPEN";
  const isExamDraft = currentExamStatus === "DRAFT";
  const isExamClosed = currentExamStatus === "CLOSE" || currentExamStatus === "CLOSED";
  const isFull = selectedEvent ? selectedEvent.registeredCount >= selectedEvent.capacity : false;
  const isFormDisabled = !isExamOpen || isFull || !user || selectedEvent?.hasRegistered || (selectedEvent && new Date(selectedEvent.registrationDeadline || new Date(new Date(selectedEvent.startTimeISO).getTime() - REGISTRATION_DEADLINE_DAYS * 86400000)) <= new Date());

  // 報名視窗的考試狀態：標籤與提示文字 (不可報名時 notice 會說明原因)
  let examBadge = { text: "開放報名", type: "success" };
  let examNotice = null;
  if (isExamDraft) {
    examBadge = { text: "尚未開放", type: "warning" };
    examNotice = { type: "warning", icon: "fa-hourglass-half", text: "這場考試尚未開放報名，目前僅供查看。" };
  } else if (isExamClosed) {
    examBadge = { text: "已關閉", type: "neutral" };
    examNotice = { type: "neutral", icon: "fa-lock", text: "這場考試已關閉報名，如有問題請洽考場負責人。" };
  } else if (!isExamOpen) {
    examBadge = { text: "不可報名", type: "neutral" };
    examNotice = { type: "neutral", icon: "fa-ban", text: "這場考試目前無法報名。" };
  } else if (isFull) {
    examBadge = { text: "額滿", type: "danger" };
    examNotice = { type: "danger", icon: "fa-users-slash", text: "這場考試名額已滿。" };
  }
  const seatsTaken = selectedEvent ? Math.min(selectedEvent.registeredCount, selectedEvent.capacity) : 0;
  const seatsPercent = selectedEvent?.capacity ? Math.round((seatsTaken / selectedEvent.capacity) * 100) : 0;

  // --- Render ---
  return (
    <div className="calendar-container centered-form">
      <div className="calendar-header">
        <div className="header-left">
          <h1>預約狀況總覽</h1>
          <button onClick={handleRefresh} disabled={isAnyLoading} className={`btn-refresh ${isAnyLoading ? "is-loading" : ""}`} title="重新整理">
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
      <div className="calendar-wrapper-month" ref={monthWrapperRef}>
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
            // 放得下就全部顯示；放不下時最後一列留給「還有 N 個考試」(至少仍顯示一個科目)
            const visibleCount = cell.events.length <= rowCapacity.all ? cell.events.length : rowCapacity.withMore;
            const visibleEvents = cell.events.slice(0, visibleCount);
            const hiddenCount = cell.events.length - visibleCount;

            return (
              <div key={cell.dateStr} ref={(el) => cellRefs.current[cell.dateStr] = el} className={`calendar-cell ${cell.isPast ? "past" : ""} ${cell.isToday ? "today-cell" : ""}`}>
                <div className="cell-header">
                  <span className={`day-number ${cell.isToday ? "today-badge" : ""}`}>{cell.day}</span>
                  {cell.isDeadlineClosed && <span className="deadline-badge">已截止報名</span>}
                </div>
                <div className="cell-content">
                  {visibleEvents.map(evt => renderEventPill(evt, isDayDisabled))}
                  {hiddenCount > 0 && (
                    <div className={`more-events-btn ${isDayDisabled ? 'disabled-pill locked' : ''}`}
                      onClick={(e) => {
                        {
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

      {/* 手機版：依日期排列的考試清單 (由 CSS 在窄螢幕切換，取代上方的月曆格) */}
      <div className="calendar-agenda">
        {isAnyLoading ? (
          <div className="agenda-empty"><p>讀取中...</p></div>
        ) : agendaDays.length === 0 ? (
          <div className="agenda-empty">
            <i className="fa-regular fa-calendar-xmark"></i>
            <p>{year} 年 {month + 1} 月沒有可報名的考試</p>
            <button type="button" className="btn-today" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
              查看下個月
            </button>
          </div>
        ) : (
          agendaDays.map(cell => (
            <section key={cell.dateStr} className={`agenda-day ${cell.isDeadlineClosed ? "closed" : ""}`}>
              <header className="agenda-day-header">
                <span className="agenda-date">{month + 1}/{cell.day}</span>
                <span className="agenda-weekday">週{"日一二三四五六"[new Date(cell.dateStr).getDay()]}</span>
                {cell.isToday && <span className="agenda-today">今天</span>}
                {cell.isDeadlineClosed && <span className="deadline-badge">已截止報名</span>}
              </header>
              {cell.events.map(evt => renderAgendaItem(evt, cell.isDeadlineClosed))}
            </section>
          ))
        )}
      </div>

      {/* 報名確認視窗 */}
      {detailEvent && <PublicExamDetails exam={detailEvent} onClose={() => setDetailEvent(null)} onBook={beginBooking} onSubscribe={subscribe} />}
      {selectedEvent && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content exam-form-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="關閉" title="關閉" onClick={() => setSelectedEvent(null)}>&times;</button>
            <h3>考試報名</h3>

            {/* 考試資訊摘要 */}
            <div className="exam-summary" style={{ "--event-color": isFull ? undefined : selectedEvent.color }}>
              <div className="exam-summary-head">
                <span className="exam-summary-title">{formData.subject || selectedEvent.title}</span>
                <span className={`agenda-badge ${examBadge.type}`}>{examBadge.text}</span>
              </div>
              <div className="exam-summary-grid">
                <div><i className="fa-regular fa-calendar"></i><span>日期</span><strong>{selectedEvent.date}</strong></div>
                <div><i className="fa-regular fa-clock"></i><span>時間</span><strong>{selectedEvent.startTime} ~ {selectedEvent.endTime}</strong></div>
                <div><i className="fa-solid fa-location-dot"></i><span>考場</span><strong>{formData.room || selectedEvent.location}</strong></div>
                <div><i className="fa-solid fa-sack-dollar"></i><span>應付費用</span><strong>{Number(selectedEvent.fee) + (formData.certiport ? CERTIPORT_FEE : 0)} 元</strong></div>
              </div>
              <div className="exam-seats">
                <div className="exam-seats-bar"><span style={{ width: `${seatsPercent}%` }}></span></div>
                <span>
                  已報名 {selectedEvent.registeredCount} / {selectedEvent.capacity}
                  {!isFull && `，剩餘 ${selectedEvent.capacity - selectedEvent.registeredCount} 名額`}
                </span>
              </div>
            </div>

            {/* 狀態提示 */}
            {selectedEvent.hasRegistered && (
              <div className="exam-notice info"><i className="fa-solid fa-circle-info"></i>您已經報名過這場考試。</div>
            )}
            {examNotice && (
              <div className={`exam-notice ${examNotice.type}`}><i className={`fa-solid ${examNotice.icon}`}></i>{examNotice.text}</div>
            )}

            <form onSubmit={handleSubmit} className="exam-form">
              {/* 不可報名時欄位都不能填，直接收起來，只留下方的按鈕 */}
              {!isFormDisabled && (<>
              <div className="form-group">
                <label>報名帳號 (電子郵件)</label><input type="email" name="email" className="input-disabled" value={formData.email} disabled />
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
              <div className="form-group checkbox-group">
                <label><input type="checkbox" name="certiport" checked={formData.certiport} onChange={handleFormChange} disabled={isFormDisabled} /><span>加購 Certiport Exam Replay 優惠加值方案</span></label>
              </div>
              </>)}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setSelectedEvent(null)}>{isFormDisabled ? "關閉" : "取消"}</button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={isFormDisabled}
                >
                  {isFormDisabled && <i className="fa-solid fa-lock"></i>}
                  {isFormDisabled
                    ? (selectedEvent.hasRegistered ? "已報名" : (isFull ? "已額滿" : (isExamDraft ? "尚未開放" : (isExamClosed ? "已關閉" : "不可報名"))))
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
