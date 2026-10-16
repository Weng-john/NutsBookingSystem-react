export const PENDING_BOOKING_KEY = "nuts.pendingBooking";
export const requestTypes = { cancel: "取消報名", reschedule: "改期", refund: "退費" };
export const requestStatuses = {
  pending: "待審核", processing: "處理中", approved: "已核准／待執行",
  completed: "已完成", rejected: "已拒絕", withdrawn: "已撤回",
};
// 畫面用的色調 (對應 index.css 的 .tone-<名稱>) 與圖示
export const requestTones = { pending: "pending", processing: "info", approved: "warning", completed: "success", rejected: "danger", withdrawn: "muted" };
export const requestIcons = { cancel: "fa-ban", reschedule: "fa-right-left", refund: "fa-hand-holding-dollar" };
export const notificationStatuses = { queued: "待發送", sent: "已寄送", failed: "發送失敗", skipped: "已略過" };
export const notificationTones = { queued: "pending", sent: "success", failed: "danger", skipped: "muted" };
export const notificationTypes = {
  payment_reminder: "繳費到期提醒", manual_payment: "繳費提醒", exam_reminder: "考前提醒", exam_changed: "場次異動", exam_open: "開放報名",
  request_update: "申請進度", registration_approve: "報名審核", registration_reject: "報名審核", payment_approve: "付款審核", payment_reject: "付款審核",
  manual_contact: "聯絡我們", manual_admin: "學苑來信", exam_result: "成績公布",
};
export const entityTypes = {
  reservation: "報名", request: "申請", exam: "場次", notification: "通知", notificationRules: "提醒規則", recipient: "收件人",
  Exam: "場次", Room: "考場", Subject: "科目", Users: "會員", Comments: "審核備註",
};
export const notificationIcons = {
  payment_reminder: "fa-credit-card", manual_payment: "fa-credit-card", exam_reminder: "fa-calendar-day", exam_changed: "fa-calendar-xmark", exam_open: "fa-bullhorn",
  exam_result: "fa-award", request_update: "fa-right-left", registration_approve: "fa-circle-check", payment_approve: "fa-circle-check", registration_reject: "fa-circle-xmark", payment_reject: "fa-circle-xmark",
};
export const auditActions = {
  "reservation.create": "建立報名", "reservation.update": "修改報名資料", "reservation.cancel": "取消報名", "reservation.reschedule": "報名改期", "reservation.refund": "登記退費", "reservation.result": "登記成績",
  "registration.approve": "報名審核通過", "registration.reject": "報名審核退件", "payment.approve": "付款審核通過", "payment.reject": "付款審核退件", "payment.proof.submit": "上傳付款證明",
  "request.create": "提出申請", "request.withdraw": "撤回申請", "request.processing": "申請改為處理中", "request.approved": "核准申請", "request.rejected": "拒絕申請", "request.completed": "完成申請",
  "exam.update": "修改場次", addExam: "新增場次", deleteExam: "刪除場次", addRoom: "新增考場", updateRoom: "修改考場", deleteRoom: "刪除考場", addSubject: "新增科目", deleteSubject: "刪除科目",
  setUserRole: "變更會員角色", setUserMembership: "變更會員等級", adminDeleteUser: "刪除會員", updateProfile: "修改個人資料", deleteMe: "刪除帳號", setReservationComment: "修改審核備註",
  "notification.rules.update": "修改提醒規則", "notification.retry": "重新發送通知", "notification.manual.contact": "送出聯絡信", "notification.manual.payment": "寄送繳費提醒", "notification.manual.admin": "管理員寄信",
};
// 操作紀錄裡常見的欄位值
export const auditValues = {
  queued: "待發送", sent: "已寄送", failed: "發送失敗", skipped: "已略過", pending: "待審核", processing: "處理中", approved: "已核准／待執行", completed: "已完成", rejected: "已拒絕", withdrawn: "已撤回",
  active: "有效", cancelled: "已取消", cancel: "取消報名", reschedule: "改期", refund: "退費", TRUE: "是", FALSE: "否", PENDING: "審核中", Open: "開放報名", Draft: "尚未開放", Closed: "已關閉", Cancelled: "已取消", present: "出席", absent: "缺考", pass: "通過", fail: "未通過",
};
export const auditFields = {
  reserveID: "報名序號", examID: "場次", subjectID: "科目編號", subjectName: "科目", roomID: "考場編號", placeName: "考場", roomNumber: "教室", address: "地址", capacity: "容量", color: "顏色",
  examStartTime: "開始時間", examEndTime: "結束時間", registrationDeadline: "報名截止", paymentDeadline: "繳費截止", fee: "費用", status: "狀態", requestID: "申請編號", type: "類型",
  reservationStatus: "報名狀態", reviewStatus: "報名審核", paymentStatus: "付款狀態", amountDue: "應付", paidAmount: "已付", refundedAmount: "已退", approvedAmount: "核准退費", targetExamID: "目標場次",
  version: "版本", role: "角色", membership: "會員等級", firstname: "名字", lastname: "姓氏", language: "語言", additional: "加購", paymentReminder: "繳費提醒", paymentHours: "繳費提醒時數", examReminder: "考前提醒", examHours: "考前提醒時數", attendance: "出席", score: "分數", examResult: "考試結果",
};
export const isTrue = (value) => ["TRUE", "1", "PAID", "APPROVED"].includes(String(value).toUpperCase());
export const cleanDate = (value) => value instanceof Date ? value.toISOString() : String(value || "").replace(/^'/, "");
export function formatDateTime(value) {
  const date = new Date(cleanDate(value));
  return Number.isNaN(date.getTime()) ? "未提供" : date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}
// 考試是否已經開始 (開始後就不能再改期或取消，管理端也從這時起可以登記成績)
export function examStarted(res) {
  const start = new Date(cleanDate(res.examInfo?.examStartTime));
  return Number.isFinite(start.getTime()) && start <= new Date();
}
// 「我的考試」的分組：依考生需不需要動手來分 (分頁定義在 config.js 的 reserveGroups)，細部狀態看每筆報名上的標籤
export function reservationGroup(res) {
  const id = res.statusInfo?.id, paid = isTrue(res.paymentStatus);
  if (res.reservationStatus === "cancelled") return "history";
  // 場次被學苑取消：還有款項沒退的要處理 (改期或退費)，其餘只是紀錄
  if (id === "cancelled") return Number(res.paidAmount || 0) > Number(res.refundedAmount || 0) ? "todo" : "history";
  if (examStarted(res)) return "history";
  if (paid) return "ready";
  if (["unpaid", "rejected", "payment_rejected"].includes(id)) return "todo";
  if (["reviewing", "payment_review"].includes(id)) return "waiting";
  return "history";
}
// 第二層分頁用的確切狀態 (對應 reserveGroups[].statuses 的 id)。
// 待處理、審核中直接用報名狀態；歷史紀錄再分成已應考、缺考、已取消、已過期
export function reservationStatusKey(res) {
  if (reservationGroup(res) !== "history") return res.statusInfo?.id;
  if (res.reservationStatus === "cancelled" || res.statusInfo?.id === "cancelled") return "cancelled";
  if (!isTrue(res.paymentStatus)) return "expired";
  return res.attendance === "absent" ? "absent" : "taken";
}
// 已結束的報名要顯示的結果 [文字, 色調]
export function resultSummary(res) {
  if (res.reservationStatus === "cancelled") return ["已取消", "muted"];
  if (res.statusInfo?.id === "cancelled") return ["場次已取消", "muted"];
  if (res.attendance === "absent") return ["缺考", "muted"];
  if (!isTrue(res.paymentStatus)) return ["已過期", "muted"];
  const score = res.score !== "" && res.score != null ? `${res.score} 分` : "";
  if (res.examResult === "pass") return [score ? `${score} · 通過` : "通過", "success"];
  if (res.examResult === "fail") return [score ? `${score} · 未通過` : "未通過", "danger"];
  return score ? [score, "info"] : ["成績尚未公布", "pending"];
}
// 把報名清單裡的一筆報名 (含最近一件申請) 整理成申請卡片需要的資料
export function requestFromReservation(reservation) {
  const exam = reservation.examInfo || {};
  return {
    ...reservation.request, email: reservation.email,
    context: {
      applicant: `${reservation.lastname || ""}${reservation.firstname || ""}`, subjectName: exam.subjectName, examStartTime: exam.examStartTime, location: exam.location,
      amountDue: reservation.amountDue, paidAmount: reservation.paidAmount, refundedAmount: reservation.refundedAmount,
    },
  };
}
export const isOpenRequest = (request) => !!request && ["pending", "processing", "approved"].includes(request.status);
// 清單用的精簡時間：10/24 (六) 09:00
export function formatShort(value) {
  const date = new Date(cleanDate(value));
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "narrow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.month}/${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}
// 編號太長 (前綴 + UUID)，清單只顯示前段，完整編號放在 title
export const shortId = (value) => String(value || "").replace(/^([A-Za-z]+_[0-9a-f]{8})-[0-9a-f-]+$/i, "$1");
export const money = (value) => `NT$ ${Number(value || 0).toLocaleString("en-US")}`;
export function dateKey(value) {
  const date = new Date(cleanDate(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function bookingAmounts(res) {
  const base = Number(res.baseFee ?? res.examInfo?.fee ?? 0);
  const addon = Number(res.additionalFee ?? (isTrue(res.additional) ? 100 : 0));
  const due = Number(res.amountDue === "" || res.amountDue == null ? base + addon : res.amountDue);
  const paid = Number(res.paidAmount === "" || res.paidAmount == null ? (isTrue(res.paymentStatus) ? due : 0) : res.paidAmount);
  const refunded = Number(res.refundedAmount || 0);
  return { base, addon, due, paid, refunded, outstanding: res.reservationStatus === "cancelled" ? 0 : Math.max(0, due - paid) };
}
function eventDetails(res) {
  const exam = res.examInfo || res;
  const start = new Date(cleanDate(exam.examStartTime || exam.startTimeISO));
  const end = new Date(cleanDate(exam.examEndTime || exam.endTimeISO));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("考試時間不完整，無法加入行事曆。");
  return {
    start, end,
    title: `${exam.subjectName || exam.title || "考試"}（${res.reserveID || "場次"}）`,
    location: [exam.location, exam.address].filter(Boolean).join(" "),
    description: `報名序號：${res.reserveID || "未報名"}\n請攜帶規定證件並查看考試須知。\n${typeof window === "undefined" ? "" : window.location.origin + (import.meta.env?.BASE_URL || "/booking/") + "guidelines"}`,
  };
}
function utcStamp(date) { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function icsEscape(value) { return String(value).replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function foldLine(line) {
  const encoder = new TextEncoder();
  let output = "", chunk = "", bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { output += chunk + "\r\n"; chunk = " "; bytes = 1; }
    chunk += char; bytes += size;
  }
  return output + chunk;
}
export function createICS(res) {
  const event = eventDetails(res);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nuts Institute//Booking//ZH-TW", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${icsEscape(res.reserveID || res.id || "exam")}@nutsreserve`, `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(event.start)}`, `DTEND:${utcStamp(event.end)}`, `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(event.location)}`, `DESCRIPTION:${icsEscape(event.description)}`,
    `STATUS:${res.reservationStatus === "cancelled" ? "CANCELLED" : isTrue(res.reviewStatus) ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT", "END:VCALENDAR", ""].map(foldLine).join("\r\n");
}
export function googleCalendarURL(res) {
  const event = eventDetails(res);
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`, details: event.description, location: event.location, ctz: "Asia/Taipei" });
  return `https://calendar.google.com/calendar/render?${params}`;
}
export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) || /^0\d+$/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function createCSV(rows) {
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
export function confirmationHTML(res) {
  const exam = res.examInfo || {};
  const amount = bookingAmounts(res);
  const fields = [
    ["報名序號", res.reserveID], ["考試科目", exam.subjectName], ["考生", `${res.lastname || ""}${res.firstname || ""}`],
    ["電子郵件", res.email], ["電話", res.phoneNumber], ["考試時間", `${formatDateTime(exam.examStartTime).replace(/:\d\d$/, "")} ～ ${formatDateTime(exam.examEndTime).replace(/:\d\d$/, "")}`],
    ["考場", exam.location], ["地址", exam.address], ["語言", res.language], ["Certiport 帳號", res.certiportAccount],
    ["加值方案", isTrue(res.additional) ? "有加購" : "無"], ["應付金額", money(amount.due)],
    ["報名狀態", res.reservationStatus === "cancelled" ? "已取消" : isTrue(res.reviewStatus) ? "已通過審核" : "尚未通過審核"],
    ["付款狀態", isTrue(res.paymentStatus) ? "已確認付款" : String(res.paymentStatus).toUpperCase() === "PENDING" ? "繳費審核中" : "尚未確認付款"],
    ["已退款", money(amount.refunded)],
  ];
  // 獨立的列印文件 (開在新視窗，讀不到網站的 index.css)，所以樣式直接寫在文件裡
  const style = `
    *{box-sizing:border-box}
    body{margin:0;padding:2.5rem 1.5rem;background:#f1f3f6;color:#1f2a30;font:15px/1.6 "Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}
    main{max-width:42rem;margin:0 auto;padding:2.25rem 2.5rem;background:#fff;border:1px solid #dfe3e8;border-radius:14px}
    header{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;padding-bottom:1rem;border-bottom:3px solid #1c7d77}
    h1{margin:0;font-size:1.45rem;letter-spacing:.04em}
    header span{color:#5c6770;font-size:.85rem}
    .id{margin:1.25rem 0 0;font-size:.85rem;color:#5c6770}
    .id strong{display:block;color:#1f2a30;font:600 1.05rem/1.4 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
    dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem 2rem;margin:1.5rem 0}
    dl div{min-width:0;padding-bottom:.55rem;border-bottom:1px solid #e9ecf0}
    dt{color:#5c6770;font-size:.78rem;letter-spacing:.03em}
    dd{margin:0;font-weight:600;overflow-wrap:anywhere}
    .note{margin:0;padding:.8rem 1rem;background:#fdf6e3;border-radius:10px;color:#6b4e0a;font-size:.88rem}
    .actions{margin-top:1.5rem;text-align:center}
    button{padding:.65rem 1.75rem;background:#1c7d77;border:0;border-radius:10px;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    @media (max-width:560px){main{padding:1.5rem 1.25rem}dl{grid-template-columns:1fr}}
    @media print{body{padding:0;background:#fff}main{max-width:none;border:0;border-radius:0;padding:0}.actions{display:none}}`;
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>報名確認單 ${htmlEscape(res.reserveID)}</title><style>${style}</style><body><main>
    <header><h1>報名確認單</h1><span>核果資訊學苑</span></header>
    <p class="id">報名序號<strong>${htmlEscape(res.reserveID || "未提供")}</strong></p>
    <dl>${fields.slice(1).map(([label, value]) => `<div><dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value || "未提供")}</dd></div>`).join("")}</dl>
    <p class="note">此確認單不是付款收據。場次異動請以系統最新資訊為準，並更新個人行事曆。</p>
    <div class="actions"><button onclick="window.print()">列印／另存 PDF</button></div>
  </main></body></html>`;
}
