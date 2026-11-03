import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { harness } from "./gas-harness.mjs";
import { bookingAmounts, createICS, confirmationHTML } from "../src/features/booking/utils.js";

test("exports retain cancelled session status and estimate legacy empty fee fields consistently", () => {
  const res = { reserveID: "R1", baseFee: "", additionalFee: "", amountDue: "", paidAmount: "", additional: "TRUE", paymentStatus: "TRUE", reviewStatus: "TRUE", examInfo: { status: "Cancelled", fee: 1000, examStartTime: "2026-12-10T09:00:00+08:00", examEndTime: "2026-12-10T10:00:00+08:00" } };
  assert.equal(bookingAmounts(res).due, 1100);
  assert.equal(bookingAmounts(res).paid, 1100);
  assert.match(createICS(res), /STATUS:CANCELLED/);
  assert.match(confirmationHTML(res), /場次已取消/);
  assert.equal(bookingAmounts({ ...res, baseFee: 0, additionalFee: 0, amountDue: 0, paidAmount: 0 }).due, 0);
});

test("duplicate bookings and reschedules cannot consume a second seat, while cancelled bookings can register again", () => {
  const h = harness(), first = h.book("E1", "alice", "original");
  assert.equal(h.book("E1", "alice", "different-key").ok, false);
  assert.equal(h.book("E1", "alice", "original").data.reserveID, first.data.reserveID);
  assert.equal(h.book("E2").ok, true);
  const move = h.request("submitReservationRequest", { reserveID: first.data.reserveID, type: "reschedule", targetExamID: "E2", reason: "改期", submissionKey: "move", captchaToken: "captcha" });
  assert.equal(move.ok, false);
  assert.match(move.error, /已報名目標場次/);
  assert.deepEqual(h.read("Exam", "EXAM_COLUMN").map(exam => exam.numHasReserved), [1, 1]);
  assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS").length, 0);
  assert.equal(h.request("submitReservationRequest", { reserveID: first.data.reserveID, type: "cancel", reason: "取消", submissionKey: "cancel", captchaToken: "captcha" }).ok, true);
  assert.equal(h.book("E1", "alice", "new-after-cancel").ok, true);
  assert.equal(h.read("Exam", "EXAM_COLUMN")[0].numHasReserved, 1);
});

test("editing a partially paid booking cannot lower fees below confirmed receipts", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const reservations = h.read("Reserved", "RESERVE_COLUMN");
  Object.assign(reservations[0], { additional: true, additionalFee: 100, amountDue: 1100, paidAmount: 1050, paymentStatus: "FALSE" });
  h.seed("Reserved", "RESERVE_COLUMN", reservations);
  const before = JSON.stringify(h.read("Reserved", "RESERVE_COLUMN"));
  const response = h.request("updateReservation", { updateData: { reserveID, phone: "0912345678", certiport: false, token: "captcha" } });
  assert.equal(response.ok, false);
  assert.match(response.error, /低於已付款/);
  assert.equal(JSON.stringify(h.read("Reserved", "RESERVE_COLUMN")), before);
});

test("a known amount due cannot turn an absent actual receipt into an authorized refund", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const reservations = h.read("Reserved", "RESERVE_COLUMN");
  Object.assign(reservations[0], { paidAmount: "", paymentStatus: "TRUE", reviewStatus: "TRUE" });
  h.seed("Reserved", "RESERVE_COLUMN", reservations);
  assert.equal(h.request("getMyReservationsWithDetails").data.data[0].amountEstimated, true);
  const request = h.request("submitReservationRequest", { reserveID, type: "refund", reason: "退費", submissionKey: "legacy-paid", captchaToken: "captcha" }).data.request;
  const approval = h.request("processReservationRequest", { requestID: request.requestID, version: request.version, status: "approved", approvedAmount: 1000, captchaToken: "captcha" }, "admin");
  assert.equal(approval.ok, false);
  assert.match(approval.error, /推估/);
  assert.equal(h.read("ReservationRequests", "REQUEST_COLUMNS")[0].status, "pending");
});

test("API errors distinguish captcha, permission and expired identity, and hide internal exception text", () => {
  const h = harness();
  for (const [message, code] of [["Invalid token", "UNAUTHORIZED"], ["Audience mismatch", "UNAUTHORIZED"], ["Invalid issuer", "UNAUTHORIZED"], ["Missing captcha token", "CAPTCHA_FAILED"], ["Permission denied", "FORBIDDEN"], ["System busy", "BUSY"], ["Unknown route: internal-route", "NOT_FOUND"]]) {
    const result = JSON.parse(h.context.error_(message).getContent());
    assert.equal(result.code, code);
    assert.match(result.error, /[\u3400-\u9fff]/);
    assert.ok(!result.error.includes(message));
    assert.equal(result.stack, undefined);
  }
  const error = JSON.parse(h.context.error_("Exception: private-sheet-id / backend implementation").getContent());
  assert.ok(!JSON.stringify(error).includes("private-sheet-id"));
  assert.equal(h.request("updateProfile", { captchaToken: "bad" }).code, "CAPTCHA_FAILED");
  assert.equal(h.request("getAuditLogs").code, "FORBIDDEN");
  assert.equal(h.request("me", {}, "bad-token").code, "UNAUTHORIZED");
});

test("temporary Google verification outages do not report an invalid login", () => {
  const h = harness();
  h.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 503, getContentText: () => "upstream outage" });
  const response = h.request("me");
  assert.equal(response.ok, false);
  assert.equal(response.code, "REQUEST_FAILED");
  assert.match(response.error, /暫時無法使用/);
});

test("legacy mutations recheck staff permission after waiting for the script lock", () => {
  const h = harness(), reserveID = h.book().data.reserveID;
  const lock = h.context.LockService.getScriptLock(), acquire = lock.tryLock;
  lock.tryLock = (...args) => {
    const users = h.read("Users", "USERS_COLUMN");
    users.find(user => user.email === "teacher@test.com").role = "user";
    h.seed("Users", "USERS_COLUMN", users);
    return acquire(...args);
  };
  assert.equal(h.request("setReservationComment", { reserveID, comment: "不能寫入", captchaToken: "captcha" }, "teacher").code, "FORBIDDEN");
  assert.equal(h.read("Comments", "COMMENT_COLUMN").length, 0);
});

test("notification changes do not write orphan data after an account is deleted while waiting for the lock", () => {
  for (const route of ["markNotificationRead", "updateNotificationPreferences", "subscribeNotice"]) {
    const h = harness();
    h.seed("Notifications", "NOTIFICATION_COLUMNS", [{ notificationID: "N1", email: "alice@test.com", status: "sent", readAt: "" }]);
    const lock = h.context.LockService.getScriptLock(), acquire = lock.tryLock;
    lock.tryLock = (...args) => {
      h.seed("Users", "USERS_COLUMN", h.read("Users", "USERS_COLUMN").filter(user => user.email !== "alice@test.com"));
      return acquire(...args);
    };
    const response = h.request(route, { examID: "E1", notificationID: "N1", preferences: { examReminder: false, paymentReminder: false } });
    assert.equal(response.code, "UNAUTHORIZED");
    assert.equal(h.read("Notifications", "NOTIFICATION_COLUMNS")[0].readAt, "");
    assert.equal(h.read("NotificationPreferences", "PREFERENCE_COLUMNS").length, 0);
  }
});

test("deployment initialization adds the transaction fileID column without needing a first upload", () => {
  const h = harness(), sheet = h.seed("Transaction", "TRANSACTION_COLUMN", []);
  const columns = Array.from(h.columns("TRANSACTION_COLUMN"));
  sheet.cells = [columns.slice(0, -1), ["old-transaction"]];
  h.context.initializeBookingFeatures();
  assert.deepEqual(sheet.cells[0], columns);
  assert.equal(sheet.cells[1][0], "old-transaction");
});

test("proof cleanup previews by default, preserves linked renamed files and recent uploads, and holds the upload lock", () => {
  const h = harness(), old = new Date(Date.now() - 48 * 3600000), recent = new Date();
  const file = (id, name, created = old) => ({ getId: () => id, getName: () => name, getDateCreated: () => created, setTrashed(value) { assert.equal(h.context.LockService.getScriptLock().hasLock(), true); this.trashed = value; } });
  const files = [file("linked", "renamed.png"), file("legacy", "old.png"), file("legacy-name", "old-name.png"), file("new", "upload.png", recent), file("orphan", "same-name.png")];
  h.seed("Transaction", "TRANSACTION_COLUMN", [{ fileID: "linked", filename: "same-name.png" }, { imageUrl: "https://drive.google.com/file/d/legacy/view" }, { filename: "old-name.png" }]);
  h.context.DriveApp.getFolderById = () => ({ getFiles: () => { let index = 0; return { hasNext: () => index < files.length, next: () => files[index++] }; } });
  const preview = h.context.cleanUpOrphanPaymentProofs_();
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].fileID, "orphan");
  assert.equal(files.some(file => file.trashed), false);
  assert.equal(h.context.cleanUpOrphanPaymentProofs_(false).trashed, 1);
  assert.equal(files[4].trashed, true);
  assert.equal(files.slice(0, 4).some(file => file.trashed), false);
});

function frontend(fetch) {
  const storage = new Map([["token", "alice"]]), timers = new Map();
  let timerID = 0;
  const context = vm.createContext({ Date, JSON, Number, String, Math, Map, Set, Promise, AbortController, encodeURIComponent,
    GAS_BASE: "https://local.test/exec", STORAGE_KEYS: { TOKEN: "token", USER: "user", LAST_ACTIVE: "active", LAST_PING: "ping" }, TOKEN_EXPIRED: "登入已失效，請重新登入。", REDIRECT_URI: "/booking/",
    console: { warn() {} }, window: { location: { href: "" } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (callback, delay) => { const id = ++timerID; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id), fetch,
  });
  vm.runInContext(fs.readFileSync("src/api.js", "utf8").replace(/^import .+;\r?\n/m, "").replace(/^export /gm, ""), context);
  const call = (route, body = {}) => { context.args = [route, body]; return vm.runInContext("sendToGAS(...args)", context); };
  return { call, context, storage, timers };
}
const json = body => ({ ok: true, json: async () => body });

test("frontend combines only concurrent identical reads and never caches results across writes or accounts", async () => {
  const calls = [], responses = [];
  const f = frontend((url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Promise(resolve => responses.push(resolve)); });
  const a = f.call("getMyNotifications", { idToken: "alice" }), b = f.call("getMyNotifications", { idToken: "alice" });
  assert.equal(a, b); assert.equal(calls.length, 1);
  const other = f.call("getMyNotifications", { idToken: "bob" });
  assert.equal(calls.length, 2);
  responses.splice(0).forEach(resolve => resolve(json({ ok: true, data: {} })));
  await Promise.all([a, b, other]);
  const fresh = f.call("getMyNotifications", { idToken: "alice" });
  const write = f.call("markNotificationRead", { notificationID: "N1" });
  const writeAgain = f.call("markNotificationRead", { notificationID: "N1" });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => !call.url.includes("route=ping")));
  responses.splice(0).forEach(resolve => resolve(json({ ok: true, data: {} })));
  await Promise.all([fresh, write, writeAgain]);
  assert.equal(f.timers.size, 0);
});

test("frontend preserves login for non-auth errors and ignores auth responses belonging to a previous account", async () => {
  for (const failure of [{ code: "FORBIDDEN", error: "沒有權限" }, { code: "CAPTCHA_FAILED", error: "Invalid token" }, { code: "REQUEST_FAILED", error: "Google 登入驗證服務暫時無法使用" }]) {
    const f = frontend(async () => json({ ok: false, ...failure }));
    await assert.rejects(f.call("me", { idToken: "alice" }), error => error.code === failure.code && /[\u3400-\u9fff]/.test(error.message));
    assert.equal(f.storage.get("token"), "alice");
    assert.equal(f.context.window.location.href, "");
  }
  const f = frontend(async () => json({ ok: false, code: "UNAUTHORIZED", error: "登入已失效" }));
  f.storage.set("token", "bob");
  await assert.rejects(f.call("me", { idToken: "alice" }), error => error.code === "UNAUTHORIZED");
  assert.equal(f.storage.get("token"), "bob");
  assert.equal(f.context.window.location.href, "");
  await assert.rejects(f.call("getExamGuidelines"), error => error.code === "NOT_FOUND");
  await assert.rejects(f.call("me", { idToken: "bob" }), error => error.code === "UNAUTHORIZED");
  assert.equal(f.storage.has("token"), false);
  assert.equal(f.context.window.location.href, "/booking/");
});

test("frontend bounds requests including JSON reads and never automatically retries timed-out writes", async () => {
  let requests = 0, signal;
  const f = frontend(async (_url, options) => { requests++; signal = options.signal; return { ok: true, json: () => new Promise(() => {}) }; });
  const pending = f.call("submitReservation", { idToken: "alice" });
  const rejected = assert.rejects(pending, error => error.code === "TIMEOUT" && error.message.includes("確認結果"));
  assert.equal([...f.timers.values()][0].delay, 45000);
  [...f.timers.values()][0].callback();
  await rejected;
  assert.equal(signal.aborted, true); assert.equal(requests, 1); assert.equal(f.timers.size, 0);
  const ping = f.call("ping"), pingRejected = assert.rejects(ping, error => error.code === "TIMEOUT");
  assert.equal([...f.timers.values()][0].delay, 8000);
  [...f.timers.values()][0].callback(); await pingRejected;
});

test("frontend handles HTTP failures, invalid JSON, malformed envelopes and offline responses in Chinese", async () => {
  for (const [response, code] of [[{ ok: false, status: 503 }, "HTTP_ERROR"], [{ ok: true, json: async () => { throw new SyntaxError("html"); } }, "INVALID_RESPONSE"], [json({ unexpected: "envelope" }), "INVALID_RESPONSE"], [json({ ok: true }), "INVALID_RESPONSE"]]) {
    const f = frontend(async () => response);
    await assert.rejects(f.call("me", { idToken: "alice" }), error => error.code === code && /[\u3400-\u9fff]/.test(error.message));
    assert.equal(f.storage.get("token"), "alice"); assert.equal(f.timers.size, 0);
  }
  const offline = frontend(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(offline.call("me", { idToken: "alice" }), error => error.code === "NETWORK_ERROR");
  assert.equal(offline.storage.get("token"), "alice");
});

test("missing frontend deployment configuration fails clearly without sending a request", async () => {
  let calls = 0;
  const f = frontend(async () => { calls++; return json({ ok: true, data: {} }); });
  f.context.GAS_BASE = "";
  await assert.rejects(f.call("getExams"), error => error.code === "CONFIGURATION_ERROR" && error.message.includes("連線設定"));
  assert.equal(calls, 0); assert.equal(f.timers.size, 0);
});
