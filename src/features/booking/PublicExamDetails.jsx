import { Link } from "react-router-dom";
import Modal from "./Modal";
import { formatShort, money } from "./utils";
import { CERTIPORT_FEE, REGISTRATION_DEADLINE_DAYS } from "../../config";

/** 場次詳細資訊 (不用登入也能看)。版面沿用報名視窗的考試摘要 */
export default function PublicExamDetails({ exam, onClose, onBook, onSubscribe }) {
  const start = new Date(exam.startTimeISO).getTime();
  const deadline = exam.registrationDeadline || (Number.isFinite(start) ? new Date(start - REGISTRATION_DEADLINE_DAYS * 86400000).toISOString() : "");
  const status = String(exam.status || "Open").toUpperCase();
  const isDraft = status === "DRAFT", isCancelled = ["CANCELLED", "CANCELED"].includes(status);
  const isFull = exam.registeredCount >= exam.capacity, isPastDeadline = !(new Date(deadline) > new Date());
  const available = status === "OPEN" && !isFull && !isPastDeadline;

  // 右上角的標籤與下方的提示
  let badge = { text: "開放報名", type: "success" }, notice = null;
  if (isDraft) {
    badge = { text: "尚未開放", type: "warning" };
    notice = { type: "neutral", icon: "fa-bell", text: "這場考試尚未開放報名，可以登記開放時通知您。" };
  } else if (isCancelled) {
    badge = { text: "已取消", type: "neutral" };
    notice = { type: "neutral", icon: "fa-ban", text: "這場考試已取消。" };
  } else if (status !== "OPEN") {
    badge = { text: "不可報名", type: "neutral" };
    notice = { type: "neutral", icon: "fa-ban", text: "這場考試目前無法報名。" };
  } else if (isPastDeadline) {
    badge = { text: "已截止", type: "neutral" };
    notice = { type: "neutral", icon: "fa-hourglass-end", text: "這場考試已超過報名截止時間。" };
  } else if (isFull) {
    badge = { text: "額滿", type: "danger" };
    notice = { type: "danger", icon: "fa-users-slash", text: "這場考試名額已滿。" };
  }
  const seatsTaken = Math.min(exam.registeredCount, exam.capacity);
  const seatsPercent = exam.capacity ? Math.round(seatsTaken / exam.capacity * 100) : 0;

  return (
    <Modal title="場次詳細資訊" onClose={onClose}>
      <div className="exam-summary" style={{ "--event-color": available ? exam.color : undefined }}>
        <div className="exam-summary-head">
          <span className="exam-summary-title">{exam.subjectName || exam.title}</span>
          <span className={`agenda-badge ${badge.type}`}>{badge.text}</span>
        </div>
        <div className="exam-summary-grid">
          <div><i className="fa-regular fa-calendar"></i><span>考試時間</span><strong>{exam.date} {exam.startTime} ~ {exam.endTime}</strong></div>
          <div><i className="fa-solid fa-location-dot"></i><span>考場</span><strong>{exam.location || "待定"}</strong></div>
          <div><i className="fa-solid fa-sack-dollar"></i><span>報名費</span><strong>{money(exam.fee)}</strong></div>
          <div><i className="fa-solid fa-certificate"></i><span>加購 Exam Replay</span><strong>+ {money(CERTIPORT_FEE)}</strong></div>
          <div><i className="fa-regular fa-hourglass-half"></i><span>報名截止</span><strong>{formatShort(deadline)}</strong></div>
          <div><i className="fa-regular fa-credit-card"></i><span>繳費截止</span><strong>{formatShort(exam.paymentDeadline || deadline)}</strong></div>
        </div>
        <div className="exam-seats">
          <div className="exam-seats-bar"><span style={{ width: `${seatsPercent}%` }}></span></div>
          <span>已報名 {exam.registeredCount} / {exam.capacity}{!isFull && `，剩餘 ${exam.capacity - exam.registeredCount} 名額`}</span>
        </div>
      </div>

      <ul className="svc-contact">
        <li>
          <i className="fa-solid fa-map-location-dot"></i>
          <span>{exam.address || "地址請洽考場確認"}</span>
          {exam.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exam.address)}`} target="_blank" rel="noreferrer" className="svc-btn"><i className="fa-solid fa-arrow-up-right-from-square"></i>地圖</a>}
        </li>
        <li>
          <i className="fa-solid fa-phone"></i>
          <span>{exam.roomPhone || "聯絡電話請洽學苑"}</span>
          {exam.roomPhone && <a href={`tel:${String(exam.roomPhone).replace(/[^\d+]/g, "")}`} className="svc-btn"><i className="fa-solid fa-phone"></i>撥打</a>}
        </li>
      </ul>

      {exam.hasRegistered && <div className="exam-notice info"><i className="fa-solid fa-circle-info"></i>您已經報名過這場考試。</div>}
      {notice && <div className={`exam-notice ${notice.type}`}><i className={`fa-solid ${notice.icon}`}></i>{notice.text}</div>}

      {/* 不能報名的場次就不用提醒看須知了 */}
      {available && <Link to="/guidelines" className="svc-inline-link" onClick={onClose}><i className="fa-solid fa-circle-question"></i>報名前請先看考試須知與常見問題</Link>}

      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onClose}>關閉</button>
        {isDraft
          ? <button type="button" className="btn-confirm" onClick={() => onSubscribe(exam)}>開放時通知我</button>
          : <button type="button" className="btn-confirm" disabled={!available} onClick={() => onBook(exam)}>我要報名</button>}
      </div>
    </Modal>
  );
}
