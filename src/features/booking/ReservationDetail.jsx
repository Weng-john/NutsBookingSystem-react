import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import Modal from "./Modal";
import { Pill, Timeline } from "./ServiceUI";
import { submitRequest, withdrawRequest } from "./api";
import { fetchReservationsAPI } from "../../api";
import { confirmDialog, notify } from "../../dialog";
import { REGISTRATION_DEADLINE_DAYS } from "../../config";
import {
  bookingAmounts, cleanDate, confirmationHTML, createICS, downloadText, formatDateTime, formatShort, googleCalendarURL, isTrue, money,
  requestStatuses, requestTones, requestTypes, resultSummary, shortId,
} from "./utils";

const openStatuses = ["pending", "processing", "approved"];
// 後端回傳的訊息裡，考生看不懂的換成白話
const friendlyError = message => message === "Exam Full" ? "目標場次名額已滿，請選擇其他場次。" : message;

/**
 * 「我的考試」點選任一筆報名後開啟的視窗，一筆報名的所有事情都在這裡：
 * 目前狀態與下一步 (修改資料／上傳繳費證明)、報名內容、行事曆與確認單、改期、取消或退費。
 *
 * props:
 *   reservation  報名資料 (含 examInfo、statusInfo、request)
 *   expired      考試是否已結束 (只能查看，不能再異動)
 *   onClose      關閉視窗
 *   onEdit       開啟「修改報名資料」
 *   onPay        開啟「上傳繳費證明」
 *   onChanged    報名有異動後重新讀取清單
 */
export default function ReservationDetail({ reservation, expired = false, onClose, onEdit, onPay, onChanged }) {
  const { requestCaptcha } = useOutletContext();
  const [action, setAction] = useState(""), [reason, setReason] = useState(""), [target, setTarget] = useState(""), [refundDetails, setRefundDetails] = useState("");
  const [exams, setExams] = useState([]), [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());

  const exam = reservation.examInfo || {};
  const amount = bookingAmounts(reservation);
  const statusId = reservation.statusInfo?.id;
  const cancelled = reservation.reservationStatus === "cancelled";
  const started = exam.examStartTime ? new Date(cleanDate(exam.examStartTime)) <= new Date() : false;
  const underPaymentReview = String(reservation.paymentStatus).toUpperCase() === "PENDING";
  const refundable = amount.paid > amount.refunded;
  // 最近一件申請。未結案時不能再異動；退費的進度也顯示在這裡
  const request = reservation.request;
  const pendingRequest = request && openStatuses.includes(request.status) ? request : null;
  // 場次被學苑取消 (報名本身還在)
  const examCancelled = !cancelled && statusId === "cancelled";
  // 已繳費且考試已開始：顯示成績
  const taken = expired && !cancelled && !examCancelled && isTrue(reservation.paymentStatus);
  const [resultText, resultTone] = resultSummary(reservation);
  const hasScore = reservation.score !== "" && reservation.score != null;
  const tone = cancelled || expired ? resultTone : reservation.statusInfo?.tone || "muted";
  const statusText = cancelled ? "報名已取消" : expired ? resultText : reservation.statusInfo?.text;
  const upcoming = !cancelled && !expired;

  // 繳費期限：後端有給就用後端的；沒有的話 (舊資料、或後端還沒更新) 依規則推算，也就是考試開始前 N 天
  const examStart = new Date(cleanDate(exam.examStartTime));
  const paymentDeadline = reservation.paymentDeadline || exam.paymentDeadline
    || (Number.isFinite(examStart.getTime()) ? new Date(examStart.getTime() - REGISTRATION_DEADLINE_DAYS * 86400000).toISOString() : "");
  const daysLeft = paymentDeadline ? Math.ceil((new Date(cleanDate(paymentDeadline)).getTime() - Date.now()) / 86400000) : null;
  const deadlineText = !paymentDeadline ? "請儘快上傳繳費證明"
    : daysLeft <= 0 ? `繳費期限 ${formatShort(paymentDeadline)} 已過，請儘快上傳繳費證明或聯絡學苑`
      : `請在 ${formatShort(paymentDeadline)} 前上傳繳費證明（剩 ${daysLeft} 天）`;

  // 目前狀態的說明與下一步
  let next = null;
  if (cancelled) next = { type: "neutral", icon: "fa-ban", text: amount.refunded > 0 ? `這筆報名已取消，已退款 ${money(amount.refunded)}。` : "這筆報名已取消。" };
  else if (examCancelled) next = { type: "warning", icon: "fa-calendar-xmark", text: refundable ? "這個場次已被取消。您可以改期到其他場次，或取消並申請退費。" : "這個場次已被取消。您可以改期到其他場次，或取消報名。" };
  else if (taken) next = null;
  else if (expired) next = { type: "neutral", icon: "fa-clock-rotate-left", text: "這場考試已經結束。" };
  else if (statusId === "reviewing") next = { type: "info", icon: "fa-hourglass-half", text: "報名資料審核中。發現填錯可以先修改。", button: "修改報名資料", run: onEdit };
  else if (statusId === "rejected") next = { type: "danger", icon: "fa-circle-exclamation", text: reservation.comment || "報名審核未通過，請修改資料後重新送出。", button: "修改報名資料", run: onEdit };
  else if (statusId === "unpaid") next = { type: "warning", icon: "fa-credit-card", text: `尚需繳費 ${money(amount.outstanding)}，${deadlineText}。`, button: "上傳繳費證明", run: onPay };
  else if (statusId === "payment_rejected") next = { type: "danger", icon: "fa-circle-exclamation", text: `${reservation.comment || "付款審核未通過。"}
${deadlineText}。`, button: "重新上傳證明", run: onPay };
  else if (statusId === "payment_review") next = { type: "info", icon: "fa-money-check-dollar", text: "繳費證明審核中，審核完成前無法改期或取消。" };
  else if (statusId === "paid") next = { type: "info", icon: "fa-circle-check", text: "報名與繳費都已完成，請準時應考。" };

  // 改期、取消目前能不能做，不能的話說明原因
  const blocked = pendingRequest ? `${requestTypes[pendingRequest.type]}申請處理中` : underPaymentReview ? "繳費證明審核中" : started ? "考試已開始" : "";
  const cancelLabel = refundable ? "取消並申請退費" : "取消報名";

  const choose = async value => {
    setAction(value); setTarget("");
    if (value === "reschedule" && !exams.length) {
      setBusy(true);
      try { setExams(await fetchReservationsAPI()); } catch (error) { notify(error.message); } finally { setBusy(false); }
    }
  };
  const available = exams.filter(item => item.id !== reservation.examID && String(item.subjectID) === String(exam.subjectID) && String(item.status).toUpperCase() === "OPEN" && item.registeredCount < item.capacity && new Date(item.registrationDeadline) > new Date());
  const targetExam = available.find(item => item.id === target);
  // 改期後的應付金額 = 新場次費用 + 原本的加購
  const newDue = targetExam ? Number(targetExam.fee) + amount.addon : 0;

  const submit = async event => {
    event.preventDefault();
    const type = action === "cancel" && refundable ? "refund" : action;
    const question = type === "cancel" ? "確定取消這筆報名？取消後立即生效，名額會釋出，無法復原。"
      : type === "reschedule" ? `確定改期到 ${formatShort(targetExam?.startTimeISO)}？改期後立即生效。`
        : "確定送出退費申請？管理員核對並退款後，報名才會取消。";
    if (!await confirmDialog(question, { confirmText: type === "cancel" ? "取消報名" : type === "reschedule" ? "確定改期" : "送出申請", tone: type === "reschedule" ? "info" : "danger" })) return;
    setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      await submitRequest({ reserveID: reservation.reserveID, type, reason, targetExamID: target, refundDetails, submissionKey: key, captchaToken });
      notify(type === "cancel" ? "報名已取消。" : type === "reschedule" ? "已改期成功，請記得更新個人行事曆。" : "退費申請已送出，處理進度會顯示在這筆報名裡。");
      onChanged?.(); onClose();
    } catch (error) { notify(`無法完成：${friendlyError(error.message)}`); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!await confirmDialog("確定撤回這件退費申請？", { confirmText: "撤回申請", tone: "danger" })) return;
    setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      await withdrawRequest({ requestID: request.requestID, version: request.version, captchaToken });
      notify("已撤回退費申請。"); onChanged?.(); onClose();
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };

  const downloadCalendar = () => { try { downloadText(`${reservation.reserveID}.ics`, createICS(reservation), "text/calendar;charset=utf-8"); } catch (error) { notify(error.message); } };
  // Google 行事曆用一般的連結開新分頁 (和各網站的「加入 Google 日曆」按鈕一樣)。
  // 用 window.open 加上 noreferrer 開，有些瀏覽器的新分頁會停在空白頁，要重新載入才出現。
  // 考試時間不完整時組不出網址，按鈕就不顯示
  let calendarURL = "";
  try { calendarURL = googleCalendarURL(reservation); } catch { calendarURL = ""; }
  const print = () => {
    const popup = window.open("", "_blank");
    if (!popup) return notify("請允許此網站開啟列印視窗。");
    popup.opener = null; popup.document.write(confirmationHTML(reservation)); popup.document.close();
  };

  return (
    <Modal title="報名詳細資訊" onClose={() => { if (!busy) onClose(); }}>
      <div className={`svc-card tone-${tone}`}>
        <div className="svc-card-head">
          <h3>{exam.subjectName || "未知場次"}</h3>
          <Pill tone={tone}>{statusText}</Pill>
        </div>
        <ul className="svc-meta">
          <li><i className="fa-regular fa-calendar"></i>{formatShort(exam.examStartTime) || "時間未定"}{exam.examEndTime && ` ~ ${formatShort(exam.examEndTime).split(" ").pop()}`}</li>
          <li><i className="fa-solid fa-location-dot"></i>{exam.location || "考場待定"}</li>
          {exam.address && <li><i className="fa-solid fa-map-location-dot"></i>{exam.address}</li>}
        </ul>
        <div className="svc-amounts">
          <div><span>應付</span><strong>{money(amount.due)}</strong></div>
          <div><span>已確認付款</span><strong>{money(amount.paid)}</strong></div>
          <div><span>已退</span><strong>{money(amount.refunded)}</strong></div>
        </div>
        {reservation.amountEstimated && <p className="svc-hint">舊資料的金額為推估，請向管理員確認。</p>}
      </div>

      {/* 考試成績 (由管理員或老師在考後登記) */}
      {taken && (
        reservation.attendance === "absent"
          ? <div className="exam-notice neutral"><i className="fa-solid fa-user-slash"></i>這場考試紀錄為缺考。{reservation.resultNote && ` ${reservation.resultNote}`}</div>
          : (
            <div className={`svc-card svc-result tone-${resultTone}`}>
              <div className="svc-score">
                <span>考試成績</span>
                <strong>{hasScore ? reservation.score : "—"}</strong>
                {reservation.examResult && <Pill tone={resultTone}>{reservation.examResult === "pass" ? "通過" : "未通過"}</Pill>}
              </div>
              {!hasScore && !reservation.examResult && <p className="svc-hint">成績尚未公布，公布後會寄通知給您。</p>}
              {reservation.resultNote && <p className="svc-reason">{reservation.resultNote}</p>}
              {reservation.resultUpdatedAt && (hasScore || reservation.examResult) && <p className="svc-hint">{formatDateTime(reservation.resultUpdatedAt)} 登記</p>}
            </div>
          )
      )}

      {next && (
        <div className={`exam-notice svc-next ${next.type}`}>
          <i className={`fa-solid ${next.icon}`}></i>
          <span>{next.text}</span>
          {next.button && <button type="button" className="svc-btn primary" disabled={busy} onClick={next.run}>{next.button}</button>}
        </div>
      )}

      {/* 退費的處理進度 (取消與改期是立即生效，不需要追蹤) */}
      {request?.type === "refund" && (
        <div className={`svc-card svc-request tone-${requestTones[request.status] || "muted"}`}>
          <div className="svc-card-head">
            <span className="svc-type"><i className="fa-solid fa-hand-holding-dollar"></i>退費申請</span>
            <Pill tone={requestTones[request.status]}>{requestStatuses[request.status] || request.status}</Pill>
            <time className="svc-time">{formatDateTime(request.createdAt)} 提出</time>
          </div>
          {request.approvedAmount !== "" && request.approvedAmount != null && <p className="svc-hint">核准退費 <strong>{money(request.approvedAmount)}</strong>{request.refundReference && `，退款憑證 ${request.refundReference}`}</p>}
          <div className="svc-card-foot">
            <Timeline history={request.history} defaultOpen={!!pendingRequest} />
            {request.status === "pending" && (
              <div className="svc-card-actions">
                <button type="button" className="svc-btn danger" disabled={busy} onClick={withdraw}><i className="fa-solid fa-rotate-left"></i>撤回申請</button>
              </div>
            )}
          </div>
        </div>
      )}

      <h4 className="svc-subhead">報名內容</h4>
      <div className="info-grid svc-info">
        <p><strong>考生</strong><span>{reservation.lastname}{reservation.firstname}</span></p>
        <p><strong>聯絡電話</strong><span>{String(reservation.phoneNumber || "").replace(/^'/, "") || "未提供"}</span></p>
        <p><strong>考試語言</strong><span>{reservation.language || "預設語言"}</span></p>
        <p><strong>Certiport 帳號</strong><span>{reservation.certiportAccount || "未提供"}</span></p>
        <p><strong>加購 Exam Replay</strong><span>{isTrue(reservation.additional) ? "有加購" : "無"}</span></p>
        <p><strong>報名序號</strong><span title={reservation.reserveID}>{shortId(reservation.reserveID)}</span></p>
      </div>

      {/* 已結束或已取消的考試不需要再加進行事曆，只留確認單 */}
      <h4 className="svc-subhead">{upcoming ? "行事曆與確認單" : "確認單"}</h4>
      <div className="svc-tiles">
        {upcoming && calendarURL && <a className="svc-tile" href={calendarURL} target="_blank" rel="noopener"><i className="fa-brands fa-google"></i><strong>Google 行事曆</strong><small>開啟後按「儲存」</small></a>}
        {upcoming && <button type="button" className="svc-tile" onClick={downloadCalendar}><i className="fa-solid fa-calendar-plus"></i><strong>下載 .ics</strong><small>Apple／Outlook</small></button>}
        <button type="button" className="svc-tile" onClick={print}><i className="fa-solid fa-print"></i><strong>報名確認單</strong><small>列印或另存 PDF</small></button>
      </div>

      {!cancelled && !expired && (
        <>
          <h4 className="svc-subhead">改期或取消</h4>
          <form className="exam-form svc-form" onSubmit={submit}>
            <div className="svc-choices" role="radiogroup" aria-label="改期或取消">
              <button type="button" role="radio" aria-checked={action === "reschedule"} disabled={busy || !!blocked} className={`svc-choice ${action === "reschedule" ? "active" : ""}`} onClick={() => choose("reschedule")}>
                <i className="fa-solid fa-right-left"></i><strong>改期</strong><small>{blocked || "換到同科目的其他場次"}</small>
              </button>
              <button type="button" role="radio" aria-checked={action === "cancel"} disabled={busy || !!blocked} className={`svc-choice tone-danger ${action === "cancel" ? "active" : ""}`} onClick={() => choose("cancel")}>
                <i className={`fa-solid ${refundable ? "fa-hand-holding-dollar" : "fa-ban"}`}></i><strong>{cancelLabel}</strong><small>{blocked || (refundable ? "退款後報名才會取消" : "立即生效並釋出名額")}</small>
              </button>
            </div>

            {action === "reschedule" && (
              <>
                <div className="form-group">
                  <label htmlFor="target-exam">新場次（相同科目）<span className="required-mark">*</span></label>
                  <select id="target-exam" value={target} disabled={busy} onChange={e => setTarget(e.target.value)} required>
                    <option value="">{busy && !exams.length ? "讀取場次中…" : "請選擇"}</option>
                    {available.map(item => <option key={item.id} value={item.id}>{formatShort(item.startTimeISO)} · {item.location} · {money(item.fee)}（剩 {item.capacity - item.registeredCount} 名額）</option>)}
                  </select>
                  {!busy && !available.length && <p className="svc-hint">目前沒有其他開放報名且有名額的同科目場次。</p>}
                </div>
                {targetExam && newDue > amount.paid && amount.paid > 0 && <div className="exam-notice warning"><i className="fa-solid fa-triangle-exclamation"></i>新場次的費用較高，改期後需補繳 {money(newDue - amount.paid)}。</div>}
                {targetExam && newDue < amount.paid && <div className="exam-notice danger"><i className="fa-solid fa-triangle-exclamation"></i>新場次的費用低於已付金額，無法直接改期，請聯絡管理員處理退費。</div>}
              </>
            )}
            {action === "cancel" && (
              <div className={`exam-notice ${refundable ? "info" : "warning"}`}>
                <i className="fa-solid fa-circle-info"></i>
                {refundable ? "這筆報名已繳費，需由管理員核對並退款後才會取消；送出後可以在這個視窗查看進度。" : "取消後立即生效，名額會釋出給其他人，無法復原。"}
              </div>
            )}
            {action && (
              <>
                <div className="form-group">
                  <label htmlFor="request-reason">原因<span className="required-mark">*</span></label>
                  <textarea id="request-reason" className="svc-short" required maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
                </div>
                {action === "cancel" && refundable && (
                  <div className="form-group">
                    <label htmlFor="refund-details">退款收款資料</label>
                    <textarea id="refund-details" className="svc-short" maxLength={500} value={refundDetails} disabled={busy} onChange={e => setRefundDetails(e.target.value)} placeholder="銀行、戶名、帳號" />
                    <p className="svc-hint"><i className="fa-solid fa-lock"></i> 只有管理員看得到這一欄。</p>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" disabled={busy} onClick={() => setAction("")}>先不要</button>
                  <button type="submit" className={`btn-confirm ${action === "cancel" ? "btn-danger" : ""}`} disabled={busy || (action === "reschedule" && (!targetExam || newDue < amount.paid))}>
                    {busy ? "處理中…" : action === "reschedule" ? "確認改期" : refundable ? "送出退費申請" : "確認取消報名"}
                  </button>
                </div>
              </>
            )}
          </form>
        </>
      )}
    </Modal>
  );
}
