import assert from "node:assert/strict";
import test from "node:test";
import { harness } from "./gas-harness.mjs";

const props = h => h.context.PropertiesService.getScriptProperties();
const snapshot = h => JSON.stringify([...h.sheets].map(([name, sheet]) => [name, sheet.cells]));
const scenario = (h, code) => h.read("Reserved", "RESERVE_COLUMN").find(row => row.reserveID.endsWith("_RES_" + code));

test("test-data preview is read-only and invalid configured viewers fail before any write", () => {
  const h = harness(), before = snapshot(h);
  const preview = h.context.previewTestData();
  assert.equal(preview.counts.Exam, 40); assert.equal(preview.counts.Reserved, 175);
  assert.equal(preview.counts.Subject, 6); assert.equal(preview.counts.Room, 5);
  assert.equal(preview.viewerIsSynthetic, true); assert.equal(snapshot(h), before);
  assert.equal(h.files.size, 0); assert.equal(h.mails.length, 0);
  props(h).setProperty("TEST_DATA_VIEWER_EMAIL", "not-registered@test.invalid");
  assert.throws(() => h.context.generateTestData(), /TEST_DATA_VIEWER_EMAIL/);
  assert.equal(snapshot(h), before); assert.equal(h.files.size, 0);
});

test("test-data generation supports a real registered viewer, current fields, private proofs and full feature coverage", () => {
  const h = harness(), initialUsers = h.read("Users", "USERS_COLUMN");
  props(h).setProperty("TEST_DATA_VIEWER_EMAIL", " Alice@Test.Com ");
  const result = h.context.generateTestData();
  assert.equal(result.viewerEmail, "alice@test.com"); assert.equal(result.viewerIsSynthetic, false);
  assert.equal(result.counts.Transaction, 134); assert.equal(result.counts.ReservationRequests, 10);
  for (const original of initialUsers) assert.deepEqual(h.read("Users", "USERS_COLUMN").find(user => user.email === original.email), original);
  assert.ok(h.read("Users", "USERS_COLUMN").filter(user => user.googleSub.startsWith("TD_")).every(user => user.role === "user"));
  const rows = h.request("getMyReservationsWithDetails").data.data;
  assert.ok(rows.some(row => row.score === 875 && row.examResult === "pass"));
  assert.ok(rows.some(row => row.attendance === "absent" && row.score === ""));
  assert.ok(rows.some(row => row.request?.type === "reschedule" && row.request.status === "completed"));
  assert.ok(rows.some(row => row.amountEstimated));
  const report = h.request("getReservationReport", {}, "admin").data;
  assert.equal(report.items.length, 175); assert.equal(report.summary.estimated, 1);
  assert.equal(report.summary.paid, result.finance.received);
  assert.equal(report.summary.refunded, result.finance.refunded);
  assert.equal(report.summary.net, result.finance.netReceived);
  assert.equal(report.summary.outstanding, result.finance.outstanding);
  const transactions = h.read("Transaction", "TRANSACTION_COLUMN");
  assert.ok(transactions.every(row => row.fileID && row.imageUrl === "")); assert.equal(h.files.size, 1);
  assert.ok(h.request("getPaymentProof", { reserveID: scenario(h, "PAYMENT_PENDING").reserveID }, "alice").data.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(h.request("getPaymentProof", { reserveID: scenario(h, "PAYMENT_PENDING").reserveID }, "bob").ok, false);
});

test("repeated test-data runs append separate batches and reuse synthetic users without modifying original bookings", () => {
  const h = harness(), originalID = h.book().data.reserveID;
  const original = h.read("Reserved", "RESERVE_COLUMN")[0], originalExam = h.read("Exam", "EXAM_COLUMN")[0];
  const first = h.context.generateTestData(), second = h.context.generateTestData();
  assert.notEqual(first.batchID, second.batchID);
  assert.equal(second.counts.Users, 0); assert.equal(second.counts.NotificationPreferences, 0);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN").length, 351);
  assert.deepEqual(h.read("Reserved", "RESERVE_COLUMN").find(row => row.reserveID === originalID), original);
  assert.deepEqual(h.read("Exam", "EXAM_COLUMN").find(row => row.examID === "E1"), originalExam);
  for (const [name, columns, key] of [["Exam", "EXAM_COLUMN", "examID"], ["Reserved", "RESERVE_COLUMN", "reserveID"], ["Transaction", "TRANSACTION_COLUMN", "transactionID"], ["Notifications", "NOTIFICATION_COLUMNS", "dedupeKey"]]) {
    const rows = h.read(name, columns); assert.equal(new Set(rows.map(row => row[key])).size, rows.length, name);
  }
});

test("generated capacity, accounting, request history and attendance remain consistent", () => {
  const h = harness(); h.context.generateTestData();
  const rows = h.read("Reserved", "RESERVE_COLUMN"), transactions = h.read("Transaction", "TRANSACTION_COLUMN"), rooms = h.read("Room", "ROOM_COLUMN"), exams = h.read("Exam", "EXAM_COLUMN");
  for (const exam of exams.filter(exam => exam.examID.startsWith("TD_"))) {
    assert.equal(exam.numHasReserved, rows.filter(row => row.examID === exam.examID && row.reservationStatus !== "cancelled").length);
    assert.ok(exam.numHasReserved <= rooms.find(room => room.roomID === exam.roomID).capacity);
  }
  const full = exams.find(exam => exam.examID.endsWith("_EXAM_FULL")); assert.equal(full.numHasReserved, 4);
  assert.equal(exams.find(exam => exam.examID.endsWith("_EXAM_EMPTY")).numHasReserved, 0);
  for (const row of rows) {
    const paid = transactions.filter(tx => tx.reserveID === row.reserveID && tx.status === "PAID").reduce((sum, tx) => sum + tx.amount, 0);
    if (row.paidAmount !== "") assert.equal(row.paidAmount, paid);
    assert.ok(row.refundedAmount <= paid);
    if (row.amountDue !== "") assert.equal(row.amountDue, row.baseFee + row.additionalFee);
    if (row.paymentStatus === "PENDING") assert.equal(transactions.filter(tx => tx.reserveID === row.reserveID && tx.status === "PENDING").length, 1);
    if (row.attendance) { assert.equal(row.paymentStatus, "TRUE"); assert.ok(new Date(exams.find(exam => exam.examID === row.examID).examEndTime) < new Date()); }
  }
  for (const req of h.read("ReservationRequests", "REQUEST_COLUMNS")) {
    const history = JSON.parse(req.history); assert.equal(history.length, req.version); assert.equal(history.at(-1).status, req.status);
    const res = rows.find(row => row.reserveID === req.reserveID); assert.equal(res.email, req.email);
    if (req.type !== "refund") assert.equal(req.status, "completed");
    if (req.type === "reschedule") assert.equal(res.examID, req.targetExamID);
    if (req.status === "completed" && req.type === "refund") { assert.equal(res.refundedAmount, req.approvedAmount); assert.ok(req.refundReference); }
  }
  const audits = h.read("AuditLog", "AUDIT_COLUMNS");
  for (const row of rows.filter(row => row.reserveID.includes("RES_RESCHEDULED_"))) {
    const created = audits.find(entry => entry.entityID === row.reserveID && entry.action === "reservation.create");
    const moved = audits.find(entry => entry.entityID === row.reserveID && entry.action === "reservation.reschedule");
    assert.equal(JSON.parse(created.after).examID, JSON.parse(moved.before).examID);
    assert.equal(JSON.parse(created.after).amountDue, 600);
  }
  for (const notification of h.read("Notifications", "NOTIFICATION_COLUMNS").filter(row => row.status === "sent")) {
    assert.ok(new Date(notification.createdAt) <= new Date(notification.scheduledAt));
    assert.ok(new Date(notification.scheduledAt) <= new Date(notification.sentAt));
  }
});

test("generated fixtures work with actual review, immediate change, refund and result handlers", () => {
  const h = harness(); props(h).setProperty("TEST_DATA_VIEWER_EMAIL", "alice@test.com"); h.context.generateTestData();
  const review = scenario(h, "REVIEWING");
  assert.equal(h.request("updateReservationStatus", { reserveID: review.reserveID, type: "registration", action: "approve", token: "captcha" }, "admin").ok, true);
  assert.equal(h.request("submitReservationRequest", { reserveID: scenario(h, "UNPAID").reserveID, type: "cancel", reason: "test", submissionKey: "cancel-test", captchaToken: "captcha" }).data.executed, true);
  const target = h.read("Exam", "EXAM_COLUMN").find(row => row.examID.endsWith("_EXAM_TARGET"));
  assert.equal(h.request("submitReservationRequest", { reserveID: scenario(h, "PARTIAL_PAID").reserveID, type: "reschedule", targetExamID: target.examID, reason: "test", submissionKey: "move-test", captchaToken: "captcha" }).data.executed, true);
  const req = h.read("ReservationRequests", "REQUEST_COLUMNS").find(row => row.reserveID === scenario(h, "REFUND_APPROVED").reserveID);
  assert.equal(h.request("processReservationRequest", { requestID: req.requestID, version: req.version, status: "completed", comment: "test", refundReference: "TEST-REFUND", captchaToken: "captcha" }, "admin").ok, true);
  assert.equal(h.request("setReservationResult", { reserveID: scenario(h, "RESULT_NOT_RECORDED").reserveID, attendance: "present", score: 700, result: "pass", captchaToken: "captcha" }, "teacher").ok, true);
});

test("seeded notifications and automatic reminders never send fixture email, including after retry", () => {
  const h = harness(); props(h).setProperty("TEST_DATA_VIEWER_EMAIL", "alice@test.com"); h.context.generateTestData();
  assert.equal(h.mails.length, 0); h.context.runBookingNotifications(); h.context.runBookingNotifications(); assert.equal(h.mails.length, 0);
  const failed = h.read("Notifications", "NOTIFICATION_COLUMNS").find(row => row.status === "failed");
  assert.equal(h.request("retryNotification", { notificationID: failed.notificationID, captchaToken: "captcha" }, "admin").ok, true);
  h.context.runBookingNotifications(); assert.equal(h.mails.length, 0);
  assert.ok(h.request("getMyNotifications").data.items.every(row => !row.subject.includes("排程防護")));
});

test("test-data generation can omit Drive and rolls back all appended rows on a later write failure", () => {
  const noDrive = harness(); props(noDrive).setProperty("TEST_DATA_CREATE_PAYMENT_PROOF", "false");
  assert.equal(noDrive.context.generateTestData().proofFileCreated, false); assert.equal(noDrive.files.size, 0);
  const h = harness(); h.book();
  const names = [...h.sheets.keys()], before = Object.fromEntries(names.map(name => [name, structuredClone(h.sheets.get(name).cells)]));
  const sheet = h.sheets.get("AuditLog"), originalRange = sheet.getRange.bind(sheet); let injected = false;
  sheet.getRange = (...args) => {
    const range = originalRange(...args), originalSet = range.setValues;
    range.setValues = values => { if (args[0] > 1 && !injected) { injected = true; throw new Error("Injected fixture write failure"); } return originalSet(values); };
    return range;
  };
  assert.throws(() => h.context.generateTestData(), /Injected fixture write failure/);
  for (const name of names) assert.equal(JSON.stringify(h.sheets.get(name).cells.slice(0, before[name].length)), JSON.stringify(before[name]), name);
  assert.equal(h.read("Reserved", "RESERVE_COLUMN").length, 1); assert.equal(h.read("Users", "USERS_COLUMN").length, 4);
  assert.equal([...h.files.values()][0].trashed, true);
});

test("test-data dates follow Taipei across month/year boundaries regardless of host timezone", () => {
  const h = harness();
  assert.equal(h.context.testDataDate_(new Date("2026-12-31T20:00:00Z"), 0).toISOString(), "2027-01-01T01:00:00.000Z");
  assert.equal(h.context.testDataDate_(new Date("2026-12-31T20:00:00Z"), -1).toISOString(), "2026-12-31T01:00:00.000Z");
});

test("complete test data initializes an empty workbook with linked venues, sessions, bookings and finances", () => {
  const h = harness(); h.sheets.clear();
  const result = h.context.generateTestData();
  assert.equal(h.sheets.size, 12);
  assert.equal(result.counts.Exam, 40); assert.equal(result.counts.Reserved, 175);
  const subjects = h.read("Subject", "SUBJECT_COLUMN"), rooms = h.read("Room", "ROOM_COLUMN"), exams = h.read("Exam", "EXAM_COLUMN");
  const rows = h.read("Reserved", "RESERVE_COLUMN"), users = h.read("Users", "USERS_COLUMN"), transactions = h.read("Transaction", "TRANSACTION_COLUMN");
  for (const room of rooms) assert.ok(exams.some(exam => exam.roomID === room.roomID));
  for (const subject of subjects) {
    const sessions = exams.filter(exam => exam.subjectID === subject.subjectID);
    assert.ok(sessions.some(exam => new Date(exam.examStartTime) < new Date()));
    assert.ok(sessions.filter(exam => new Date(exam.examStartTime) > new Date()).length >= 3);
  }
  for (const exam of exams) {
    assert.ok(subjects.some(subject => subject.subjectID === exam.subjectID));
    assert.ok(rooms.some(room => room.roomID === exam.roomID));
    const list = rows.filter(row => row.examID === exam.examID && row.reservationStatus !== "cancelled");
    if (/EXAM_(SESSION|HISTORY)_/.test(exam.examID)) assert.equal(new Set(list.map(row => row.email)).size, list.length);
  }
  for (const row of rows) assert.ok(users.some(user => user.email === row.email));
  const installments = rows.filter(row => transactions.filter(tx => tx.reserveID === row.reserveID && tx.status === "PAID").length === 2);
  assert.ok(installments.length > 0);
  for (const row of installments) assert.equal(transactions.filter(tx => tx.reserveID === row.reserveID && tx.status === "PAID").reduce((sum, tx) => sum + tx.amount, 0), row.paidAmount);
  assert.deepEqual(JSON.parse(JSON.stringify(result.finance)), { currency: "TWD", received: 71200, refunded: 480, netReceived: 70720, outstanding: 61800, pendingReview: 15400,
    estimatedReservations: 1, transactionStatuses: { PAID: 113, PENDING: 20, FAILED: 1 } });
  h.context.runBookingNotifications(); assert.equal(h.mails.length, 0);
});

test("complete test data scales rosters without exceeding capacities or duplicating attendees", () => {
  const h = harness();
  const options = h.context.testDataOptions_(); options.SYNTHETIC_USERS = 4; options.RESERVATIONS_PER_SESSION = 50;
  const plan = h.context.buildTestData_(options), rows = plan.tables.Reserved.rows;
  for (const exam of plan.tables.Exam.rows.filter(exam => /EXAM_(SESSION|HISTORY)_/.test(exam.examID))) {
    const list = rows.filter(row => row.examID === exam.examID);
    assert.equal(list.length, 4); assert.equal(new Set(list.map(row => row.email)).size, 4);
  }
  plan.tables.Exam.rows[0].subjectID = "missing-subject";
  assert.throws(() => h.context.testDataValidate_(plan), /缺少科目/);
  options.SYNTHETIC_USERS = 100; options.BACKGROUND_RESERVATIONS = 100;
  const large = h.context.buildTestData_(options);
  assert.ok(large.tables.Reserved.rows.filter(row => row.score !== "").every(row => row.score >= 0 && row.score <= 1000));
});
