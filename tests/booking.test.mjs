import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { harness } from "./gas-harness.mjs";
import { createICS, googleCalendarURL, createCSV, confirmationHTML } from "../src/features/booking/utils.js";

test("all frontend API routes have GAS cases and dispatched functions exist", () => {
  const h = harness(), main = fs.readFileSync("GAS/Main.gs", "utf8");
  const routes = new Set([...main.matchAll(/case "([^"]+)"/g)].map(match => match[1]));
  const frontend = fs.readFileSync("src/api.js", "utf8") + fs.readFileSync("src/features/booking/api.js", "utf8") + fs.readFileSync("src/features/booking/PaymentProof.jsx", "utf8");
  for (const match of frontend.matchAll(/(?:sendToGAS|call)\("([^"]+)"/g)) assert.ok(routes.has(match[1]), `Missing route ${match[1]}`);
  for (const match of main.matchAll(/case "[^"]+": return (\w+)\(/g)) assert.equal(h.evaluate(`typeof ${match[1]}`), "function", match[1]);
});
test("public exams include details and cancelled sessions without exposing members", () => {
  const h = harness(); h.book();
  const result = h.request("getExams", {}, null);
  assert.equal(result.ok, true); assert.equal(result.data[0].address, "新竹"); assert.ok(result.data[0].registrationDeadline);
  assert.equal(result.data[0].hasRegistered, false); assert.equal(result.data[0].email, undefined); assert.equal(result.data[0].createdBy, undefined);
  assert.equal(h.request("updateExam", { examID: "E2", status: "Cancelled", captchaToken: "captcha" }, "admin").ok, true);
  assert.ok(h.request("getExams", {}, null).data.some(exam => exam.examID === "E2" && exam.status === "Cancelled"));
});
test("booking enforces captcha, status, capacity and idempotency, saves fee snapshots", () => {
  const h = harness();
  assert.equal(h.request("submitReservation", { bookingData: {} }).ok, false);
  const first = h.book("E1", "alice", "stable-key"); assert.equal(first.ok, true);
  assert.equal(h.book("E1", "alice", "stable-key").data.reserveID, first.data.reserveID);
  assert.equal(h.book("E1", "bob").ok, true); assert.equal(h.book().ok, false);
  assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 2);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].amountDue, 1000);
  h.request("updateExam", { examID: "E1", fee: 2000, captchaToken: "captcha" }, "admin");
  assert.equal(h.request("getMyReservationsWithDetails").data.data[0].amountDue, 1000);
});
test("unpaid cancellation takes effect immediately, releases the seat once and is idempotent", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const payload = { reserveID, type: "cancel", reason: "時間不符", submissionKey: "req1", captchaToken: "captcha" };
  const first = h.request("submitReservationRequest", payload);
  assert.equal(first.ok, true); assert.equal(first.data.executed, true); assert.equal(first.data.request.status, "completed");
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].reservationStatus, "cancelled"); assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 0);
  // resending the same submission returns the same record and does not release a second seat
  assert.equal(h.request("submitReservationRequest", payload).data.request.requestID, first.data.request.requestID);
  assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS").length, 1); assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 0);
  assert.equal(h.request("submitReservationRequest", { ...payload, submissionKey: "req2" }).ok, false);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").filter(n => n.subject.includes("取消報名")).length, 1);
  // an admin cannot push a finished cancellation any further
  assert.equal(h.request("processReservationRequest", { requestID: first.data.request.requestID, version: 1, status: "completed", comment: "重送", captchaToken: "captcha" }, "admin").ok, false);
});
test("reschedule is refused when the destination is full and leaves both sessions untouched", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  h.book("E2", "bob"); h.book("E2", "teacher");
  const result = h.request("submitReservationRequest", { reserveID, type: "reschedule", targetExamID: "E2", reason: "改期", submissionKey: "move", captchaToken: "captcha" });
  assert.equal(result.ok, false);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].examID, "E1"); assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS").length, 0);
  const exams = h.read("Exam", "EXAM_COLUMN"); assert.equal(exams[0].numHasReserved, 1); assert.equal(exams[1].numHasReserved, 2);
  assert.equal(h.request("submitReservationRequest", { reserveID, type: "reschedule", targetExamID: "E1", reason: "同場", submissionKey: "same", captchaToken: "captcha" }).ok, false);
});
test("confirmed payments cannot be cancelled directly; sessions that already started cannot be changed", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const rows = h.read("Reserved", "RESERVE_COLUMN"); Object.assign(rows[0], { reviewStatus: "TRUE", paymentStatus: "TRUE", paidAmount: 1000 }); h.seed("Reserved", "RESERVE_COLUMN", rows);
  assert.equal(h.request("submitReservationRequest", { reserveID, type: "cancel", reason: "取消", submissionKey: "paid", captchaToken: "captcha" }).ok, false);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].reservationStatus, "active");
  const refund = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "退費", submissionKey: "refund", captchaToken: "captcha" });
  assert.equal(refund.data.executed, false); assert.equal(refund.data.request.status, "pending");
  // the reservation lists expose that request: bank details only to admins, never to the applicant or teachers
  const sent = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "退費", refundDetails: "bank-account-123", submissionKey: "refund", captchaToken: "captcha" });
  assert.equal(sent.data.request.requestID, refund.data.request.requestID);
  const rowsWithBank = h.read("ReservationRequests", "REQUEST_COLUMNS"); rowsWithBank[0].refundDetails = "bank-account-123"; h.seed("ReservationRequests", "REQUEST_COLUMNS", rowsWithBank);
  assert.equal(h.request("getAllReservationsAdmin", {}, "admin").data.data[0].request.refundDetails, "bank-account-123");
  assert.ok(!JSON.stringify(h.request("getAllReservationsAdmin", {}, "teacher").data).includes("bank-account-123"));
  assert.ok(!JSON.stringify(h.request("getMyReservationsWithDetails").data).includes("bank-account-123"));
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].reservationStatus, "active"); assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 1);
  const late = harness(), lateID = late.book().data.reserveID, exams = late.read("Exam", "EXAM_COLUMN");
  exams[0].examStartTime = late.future(-1); late.seed("Exam", "EXAM_COLUMN", exams);
  assert.equal(late.request("submitReservationRequest", { reserveID: lateID, type: "cancel", reason: "太晚", submissionKey: "late", captchaToken: "captcha" }).ok, false);
  assert.equal(late.request("submitReservationRequest", { reserveID: lateID, type: "reschedule", targetExamID: "E2", reason: "太晚", submissionKey: "late2", captchaToken: "captcha" }).ok, false);
  assert.equal(late.read("Reserved", "RESERVE_COLUMN")[0].examID, "E1");
});
test("IDOR, admin-only data and spoofed user identity are rejected", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  assert.equal(h.request("submitReservationRequest", { reserveID, type: "cancel", reason: "他人", submissionKey: "x", captchaToken: "captcha" }, "bob").ok, false);
  for (const route of ["getReservationRequestsAdmin", "getReservationReport", "getAuditLogs", "getNotificationRules", "getNotificationDeliveryLogs"]) {
    assert.equal(h.request(route, { _user: { role: "admin", profile: { email: "admin@test.com" } } }).ok, false, route);
  }
  assert.equal(h.request("getPaymentProof", { reserveID }, "bob").ok, false);
  assert.equal(h.request("getMyReservationsWithDetails", {}, "bob").data.data.length, 0);
});
test("private payment upload, review and refund retain accounting and require actual refund reference", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  h.request("updateReservationStatus", { reserveID, type: "registration", action: "approve", token: "captcha" }, "admin");
  const proof = { reserveID, base64: Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64"), mimeType: "image/png", fileName: "proof.png", token: "captcha", paymentMethod: "轉帳" };
  assert.equal(h.request("submitPaymentProof", proof, "bob").ok, false); assert.equal(h.files.size, 0);
  assert.equal(h.request("submitPaymentProof", proof).ok, true); assert.equal(h.files.size, 1);
  assert.equal(h.read("Transaction", "TRANSACTION_COLUMN")[0].imageUrl, "");
  assert.ok(h.request("getPaymentProof", { reserveID }, "admin").data.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(h.request("updateReservationStatus", { reserveID, type: "payment", action: "approve", confirmedAmount: 1000, token: "captcha" }, "admin").ok, true);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].paidAmount, 1000);
  const req = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "退費", refundDetails: "sensitive-bank-details", submissionKey: "refund", captchaToken: "captcha" }).data.request;
  assert.ok(!req.refundDetails.includes("sensitive-bank"));
  assert.equal(h.request("processReservationRequest", { requestID: req.requestID, version: 1, status: "approved", approvedAmount: 1001, captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("processReservationRequest", { requestID: req.requestID, version: 1, status: "approved", approvedAmount: 800, captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.request("processReservationRequest", { requestID: req.requestID, version: 2, status: "completed", comment: "退款", captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("processReservationRequest", { requestID: req.requestID, version: 2, status: "completed", comment: "已退款", refundReference: "BANK-123", captchaToken: "captcha" }, "admin").ok, true);
  const report = h.request("getReservationReport", {}, "admin").data.summary;
  assert.equal(report.paid, 1000); assert.equal(report.refunded, 800); assert.equal(report.net, 200); assert.equal(report.outstanding, 0);
  assert.ok(!JSON.stringify(h.read("AuditLog", "AUDIT_COLUMNS")).includes("sensitive-bank-details"));
});
test("scheduled reminders deduplicate and skip outdated payment notifications", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  h.request("updateReservationStatus", { reserveID, type: "registration", action: "approve", token: "captcha" }, "admin");
  const rows = h.read("Reserved", "RESERVE_COLUMN"); rows[0].paymentDeadline = h.future(12); h.seed("Reserved", "RESERVE_COLUMN", rows);
  h.context.runBookingNotifications(); h.context.runBookingNotifications();
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").filter(n => n.type === "payment_reminder").length, 1);
  assert.equal(h.mails.filter(n => n.subject.includes("繳費到期提醒")).length, 1);
  h.evaluate(`bookingQueue_("alice@test.com", "payment_reminder", "${reserveID}", "E1", "stale", "stale", "stale-key", {deadline: "old"})`);
  h.context.runBookingNotifications();
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").find(n => n.dedupeKey === "stale-key").status, "skipped");
  h.context.installBookingNotificationTrigger(); h.context.installBookingNotificationTrigger();
  assert.equal(h.request("getNotificationRules", {}, "admin").data.triggerInstalled, true);
});
test("append-only migration preserves old rows and rejects reordered schemas", () => {
  const h = harness(), columns = Array.from(h.columns("RESERVE_COLUMN")), sh = h.sheets.get("Reserved") || h.seed("Reserved", "RESERVE_COLUMN", []);
  sh.cells = [columns.slice(0, 12), ["2026", "old-res", "acct", "alice@test.com"]];
  h.context.initializeBookingFeatures(); assert.deepEqual(sh.cells[0], columns); assert.equal(sh.cells[1][1], "old-res");
  sh.cells[0][0] = "unexpected";
  assert.throws(() => h.context.initializeBookingFeatures(), /欄位順序/);
});
test("cached expired tokens, invalid captcha and malformed requests fail without stacks", () => {
  const h = harness(); h.request("me");
  const cached = [...h.cache.keys()][0], profile = JSON.parse(h.cache.get(cached)); profile.exp = Math.floor(Date.now() / 1000) - 1; h.cache.set(cached, JSON.stringify(profile));
  assert.equal(h.request("me").ok, false);
  const response = JSON.parse(h.context.doPost({ parameter: { route: "ping" }, postData: { contents: "{" } }).getContent());
  assert.equal(response.ok, false); assert.equal(response.stack, undefined);
});
test("calendar export has UTC times, stable UID, escaped/folded lines; print HTML and CSV escape user input", () => {
  const res = { reserveID: "R1", lastname: "<script>", firstname: "王", phoneNumber: "0912345678", reviewStatus: "TRUE", paymentStatus: "PENDING", examInfo: { subjectName: "測試,科目;" + "長".repeat(80), examStartTime: "2026-10-20T09:00:00+08:00", examEndTime: "2026-10-20T10:00:00+08:00", location: "A\nB", fee: 1000 } };
  const ics = createICS(res); assert.ok(ics.includes("DTSTART:20261020T010000Z")); assert.ok(ics.includes("UID:R1@nutsreserve"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(googleCalendarURL(res).includes("dates=20261020T010000Z"));
  const html = confirmationHTML(res); assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("繳費審核中")); assert.ok(!html.includes("<script>"));
  const csv = createCSV([["=cmd", "09123", 'a"b', "中文"]]); assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes('"\'=cmd"')); assert.ok(csv.includes('"\'09123"')); assert.ok(csv.includes('"a""b"'));
});
test("request lists carry a readable summary; reservation details carry the latest request", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  h.request("submitReservationRequest", { reserveID, type: "reschedule", targetExamID: "E2", reason: "改期", submissionKey: "ctx", captchaToken: "captcha" });
  const mine = h.request("getMyReservationRequests").data.items[0].context, exams = h.read("Exam", "EXAM_COLUMN");
  assert.equal(mine.applicant, "TestAlice"); assert.equal(mine.subjectName, "MOS"); assert.equal(mine.location, "教室"); assert.equal(mine.amountDue, 1000);
  // the summary still points at the original session after the reservation has moved
  assert.equal(new Date(mine.examStartTime).getTime(), new Date(exams[0].examStartTime).getTime());
  assert.equal(new Date(mine.targetStartTime).getTime(), new Date(exams[1].examStartTime).getTime());
  assert.equal(h.request("getReservationRequestsAdmin", {}, "admin").data.items[0].context.applicant, "TestAlice");
  assert.equal(h.request("getMyReservationRequests", {}, "bob").data.items.length, 0);
  const detail = h.request("getMyReservationsWithDetails").data.data[0];
  assert.equal(detail.examID, "E2"); assert.equal(detail.request.type, "reschedule"); assert.equal(detail.request.status, "completed");
  assert.equal(detail.request.submissionKey, undefined); assert.equal(detail.request.history[0].actor, "考生");
});
test("staff record attendance and results only for paid reservations whose exam has started", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const record = (extra, token = "admin") => h.request("setReservationResult", { reserveID, attendance: "present", score: 850, result: "pass", note: "恭喜", captchaToken: "captcha", ...extra }, token);
  assert.equal(record({}).ok, false); // not paid yet
  const rows = h.read("Reserved", "RESERVE_COLUMN"); Object.assign(rows[0], { reviewStatus: "TRUE", paymentStatus: "TRUE", paidAmount: 1000 }); h.seed("Reserved", "RESERVE_COLUMN", rows);
  assert.equal(record({}).ok, false); // exam has not started
  const exams = h.read("Exam", "EXAM_COLUMN"); exams[0].examStartTime = h.future(-3); exams[0].examEndTime = h.future(-1); h.seed("Exam", "EXAM_COLUMN", exams);
  assert.equal(record({}, "alice").ok, false); assert.equal(record({ score: 1001 }).ok, false); assert.equal(record({ attendance: "absent" }).ok, false);
  assert.equal(record({}, "teacher").ok, true);
  const mine = h.request("getMyReservationsWithDetails").data.data[0];
  assert.equal(mine.attendance, "present"); assert.equal(mine.score, 850); assert.equal(mine.examResult, "pass"); assert.equal(mine.resultNote, "恭喜");
  const notices = h.read("Notifications", "NOTIFICATION_COLUMNS").filter(n => n.type === "exam_result");
  assert.equal(notices.length, 1); assert.ok(!notices[0].content.includes("850"));
  assert.equal(record({ attendance: "absent", score: "", result: "", note: "" }).ok, true);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].attendance, "absent"); assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].score, "");
  assert.ok(h.read("AuditLog", "AUDIT_COLUMNS").some(log => log.action === "reservation.result"));
});
