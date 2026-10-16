import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { harness } from "./gas-harness.mjs";

const proof = reserveID => ({ reserveID, base64: Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64"), mimeType: "image/png", fileName: "proof.png", token: "captcha", paymentMethod: "transfer" });
const approve = (h, reserveID) => h.request("updateReservationStatus", { reserveID, type: "registration", action: "approve", token: "captcha" }, "admin");
const process = (h, request, status, extra = {}) => h.request("processReservationRequest", { requestID: request.requestID, version: request.version, status, comment: "processed", captchaToken: "captcha", ...extra }, "admin");

test("initial registration rejection saves reason, audit and notification; approved records cannot be silently rejected", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const payload = { reserveID, type: "registration", action: "reject", comment: "Missing document", token: "captcha" };
  assert.equal(h.request("updateReservationStatus", payload, "admin").ok, true);
  assert.equal(h.read("Comments", "COMMENT_COLUMN")[0].comment, payload.comment);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").length, 1);
  assert.equal(h.request("updateReservationStatus", payload, "admin").ok, true);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").length, 1);
  assert.equal(approve(h, reserveID).ok, true);
  assert.equal(h.read("Comments", "COMMENT_COLUMN").length, 0);
  assert.equal(h.request("updateReservationStatus", payload, "admin").ok, false);
});

test("successful reschedule transfers one seat at once, preserves review and resets payment deadline", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  approve(h, reserveID);
  const result = h.request("submitReservationRequest", { reserveID, type: "reschedule", targetExamID: "E2", reason: "move", submissionKey: "move", captchaToken: "captcha" });
  assert.equal(result.ok, true); assert.equal(result.data.executed, true);
  const res = h.read("Reserved", "RESERVE_COLUMN")[0], exams = h.read("Exam", "EXAM_COLUMN");
  assert.equal(res.examID, "E2"); assert.equal(res.reviewStatus, "TRUE");
  assert.equal(res.paymentStatus, "FALSE"); assert.ok(res.paymentDeadline);
  assert.equal(exams[0].numHasReserved, 0); assert.equal(exams[1].numHasReserved, 1);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").filter(n => n.subject.includes("改期完成")).length, 1);
});

test("partial payment uses confirmed amount, allows balance upload and cannot exceed amount due", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  approve(h, reserveID); h.request("submitPaymentProof", proof(reserveID));
  const review = amount => h.request("updateReservationStatus", { reserveID, type: "payment", action: "approve", confirmedAmount: amount, token: "captcha" }, "admin");
  assert.equal(review(undefined).ok, false); assert.equal(review(1001).ok, false);
  assert.equal(review(400).ok, true);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].paymentStatus, "FALSE");
  assert.equal(h.request("getReservationReport", {}, "admin").data.summary.outstanding, 600);
  assert.equal(h.request("submitPaymentProof", proof(reserveID)).ok, true);
  assert.equal(h.read("Transaction", "TRANSACTION_COLUMN")[1].amount, 600);
  assert.equal(review(600).ok, true); assert.equal(review(600).ok, true);
  const res = h.read("Reserved", "RESERVE_COLUMN")[0];
  assert.equal(res.paidAmount, 1000); assert.equal(res.paymentStatus, "TRUE");
});

test("audit write failure restores booking, capacity, requests and queued notifications", () => {
  const h = harness();
  const original = h.context.bookingAudit_;
  h.context.bookingAudit_ = () => { throw new Error("Injected audit failure"); };
  assert.equal(h.book().ok, false);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN").length, 0);
  assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 0);
  h.context.bookingAudit_ = original;
  const reserveID = h.book().data.reserveID;
  const notifications = h.read("Notifications", "NOTIFICATION_COLUMNS").length;
  // an immediate cancellation that fails half-way must leave nothing behind
  h.context.bookingAudit_ = () => { throw new Error("Injected cancellation failure"); };
  assert.equal(h.request("submitReservationRequest", { reserveID, type: "cancel", reason: "cancel", submissionKey: "cancel", captchaToken: "captcha" }).ok, false);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].reservationStatus, "active");
  assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 1);
  assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS").length, 0);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").length, notifications);
  // and the same for an admin completing a refund
  h.context.bookingAudit_ = original;
  const rows = h.read("Reserved", "RESERVE_COLUMN"); Object.assign(rows[0], { reviewStatus: "TRUE", paymentStatus: "TRUE", paidAmount: 1000 }); h.seed("Reserved", "RESERVE_COLUMN", rows);
  let req = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "refund", submissionKey: "refund", captchaToken: "captcha" }).data.request;
  req = process(h, req, "approved", { approvedAmount: 1000 }).data.request;
  const queued = h.read("Notifications", "NOTIFICATION_COLUMNS").length;
  h.context.bookingAudit_ = () => { throw new Error("Injected completion failure"); };
  assert.equal(process(h, req, "completed", { refundReference: "BANK-1" }).ok, false);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].reservationStatus, "active");
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].refundedAmount, 0);
  assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 1);
  assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS")[0].status, "approved");
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").length, queued);
});

test("legacy writes validate references and roles, protect last admin, consume captcha once and restore settings on failure", () => {
  const h = harness();
  assert.equal(h.request("setUserRole", { targetEmail: "admin@test.com", role: "user", captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("setUserRole", { email: "alice@test.com", targetEmail: " admin@test.com ", role: "user", captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("deleteRoom", { roomID: "ROOM1", captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("deleteSubject", { subjectID: "S1", captchaToken: "captcha" }, "admin").ok, false);
  assert.equal(h.request("listUsers", {}, "teacher").ok, false);
  assert.equal(h.request("updateRoom", { roomID: "ROOM1", capacity: 3, captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.request("setReservationComment", { reserveID: "absent", comment: "orphan", captchaToken: "captcha" }, "admin").ok, false);
  const rules = h.request("getNotificationRules", {}, "admin").data.rules;
  h.context.bookingAudit_ = () => { throw new Error("Injected failure"); };
  assert.equal(h.request("updateNotificationRules", { rules: { ...rules, examHours: 10 }, captchaToken: "captcha" }, "admin").ok, false);
  assert.deepEqual(h.request("getNotificationRules", {}, "admin").data.rules, rules);
});

test("failed proof submission rolls back transaction and puts only the newly created file in trash", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  approve(h, reserveID);
  h.context.bookingAudit_ = () => { throw new Error("Injected proof audit failure"); };
  assert.equal(h.request("submitPaymentProof", proof(reserveID)).ok, false);
  assert.equal(h.read("Transaction", "TRANSACTION_COLUMN").length, 0);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].paymentStatus, false);
  assert.equal([...h.files.values()][0].trashed, true);
});

test("legacy paid amounts cannot authorize estimated refunds; old unpaid proof freezes fee basis", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const rows = h.read("Reserved", "RESERVE_COLUMN");
  Object.assign(rows[0], { baseFee: "", additionalFee: "", amountDue: "", paidAmount: "", paymentStatus: "TRUE", reviewStatus: "TRUE" });
  h.seed("Reserved", "RESERVE_COLUMN", rows);
  const req = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "legacy", submissionKey: "legacy", captchaToken: "captcha" }).data.request;
  assert.equal(process(h, req, "approved", { approvedAmount: 1000 }).ok, false);
  rows[0].paymentStatus = "FALSE"; h.seed("Reserved", "RESERVE_COLUMN", rows);
  assert.equal(h.request("submitPaymentProof", proof(reserveID)).ok, true);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN")[0].amountDue, 1000);
  assert.equal(h.request("updateExam", { examID: "E1", fee: 2000, captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.request("getMyReservationsWithDetails").data.data[0].amountDue, 1000);
});

test("contact queue caps distinct messages and payment upload rejects cancelled sessions", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  for (let i = 0; i < 5; i++) assert.equal(h.request("sendContactEmail", { subject: "contact " + i, content: "question", token: "captcha" }).ok, true);
  assert.equal(h.request("sendContactEmail", { subject: "contact 0", content: "question", token: "captcha" }).ok, true);
  assert.equal(h.request("sendContactEmail", { subject: "contact sixth", content: "question", token: "captcha" }).ok, false);
  approve(h, reserveID);
  h.request("updateExam", { examID: "E1", status: "Cancelled", captchaToken: "captcha" }, "admin");
  assert.equal(h.request("submitPaymentProof", proof(reserveID)).ok, false); assert.equal(h.files.size, 0);
});

test("new exam timestamps support local and offset inputs without duplicate timezone; references and malformed values fail", () => {
  const h = harness();
  const payload = { subjectID: "S1", roomIDs: ["ROOM1"], fee: 100, status: "Draft", examStartTime: "2026-12-10T09:00:00", examEndTime: "2026-12-10T10:00:00", captchaToken: "captcha" };
  assert.equal(h.request("addExam", { ...payload, status: "invalid" }, "admin").ok, false);
  assert.equal(h.request("addExam", { ...payload, fee: "" }, "admin").ok, false);
  assert.equal(h.request("addExam", payload, "admin").ok, true);
  assert.ok(h.read("Exam", "EXAM_COLUMN")[2].examStartTime.startsWith("2026-12-10T09:00:00"));
  assert.equal(h.request("addExam", { ...payload, examStartTime: "2026-12-11T09:00:00+08:00", examEndTime: "2026-12-11T10:00:00+08:00" }, "admin").ok, true);
  assert.ok(Number.isFinite(new Date(h.read("Exam", "EXAM_COLUMN")[3].examStartTime).getTime()));
  assert.equal(h.request("subscribeNotice", { examID: "absent" }).ok, false);
  assert.equal(h.request("subscribeNotice", { examID: "E1" }).ok, false);
});

test("outbox revalidates manual reminders and changed sessions can notify again when time returns to a former value", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  approve(h, reserveID);
  assert.equal(h.request("sendPaymentReminder", { reserveID, subject: "manual reminder", content: "payment", token: "captcha" }, "admin").ok, true);
  h.request("submitPaymentProof", proof(reserveID));
  h.context.runBookingNotifications();
  assert.equal(h.mails.some(mail => mail.subject === "manual reminder"), false);
  const original = h.read("Exam", "EXAM_COLUMN")[0].examStartTime;
  assert.equal(h.request("updateExam", { examID: "E1", examStartTime: h.future(241), captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.request("updateExam", { examID: "E1", examStartTime: original, captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS").filter(n => n.type === "exam_changed").length, 2);
  const users = h.read("Users", "USERS_COLUMN").filter(user => user.email !== "alice@test.com"); h.seed("Users", "USERS_COLUMN", users);
  assert.equal(h.request("getMyNotifications").ok, false);
});

test("existing frontend adapters read actual GAS envelopes and forward captcha for member and room operations", async () => {
  const h = harness(), storage = new Map([["token", "alice"]]);
  const context = vm.createContext({ Date, JSON, Number, String, Math, console: { log() {}, error() {}, warn() {} }, setTimeout,
    GAS_BASE: "https://local.test/exec", STORAGE_KEYS: { TOKEN: "token", LAST_PING: "lastPing" }, TOKEN_EXPIRED: "expired", REDIRECT_URI: "/login",
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { location: { href: "" } },
    fetch: async (_url, options) => { const { route, idToken, ...payload } = JSON.parse(options.body); return { ok: true, json: async () => h.request(route, payload, idToken || null) }; },
  });
  const source = fs.readFileSync("src/api.js", "utf8").replace(/^import .+;\r?\n/m, "").replace(/^export /gm, "");
  vm.runInContext(source, context);
  const call = async (name, ...args) => { context.args = args; return vm.runInContext(`${name}(...args)`, context); };
  assert.equal((await call("fetchMeAPI", "alice")).user.email, "alice@test.com");
  assert.equal((await call("updateProfileAPI", { idToken: "alice", firstname: "Changed", phoneNumber: "0912345678", captchaToken: "captcha" })).user.firstname, "Changed");
  assert.equal((await call("fetchSubjectsAPI"))[0], "MOS");
  const reserveID = h.book().data.reserveID;
  assert.equal((await call("fetchUserReservationsAPI"))[0].reserveID, reserveID);
  assert.equal((await call("fetchMyReservationsWithDetailsAPI"))[0].additional, false);
  storage.set("token", "admin");
  assert.equal((await call("setUserRoleAPI", "bob@test.com", "teacher", "captcha")).ok, true);
  assert.equal((await call("updateRoomAPI", { roomID: "ROOM1", capacity: 3, captchaToken: "captcha" })).ok, true);
  h.request("updateExam", { examID: "E1", status: "Cancelled", captchaToken: "captcha" }, "admin");
  assert.equal((await call("fetchAllReservationsAdminAPI"))[0].statusInfo.id, "cancelled");
});
