import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

class Sheet {
  constructor() { this.cells = []; this.maxColumns = 40; this.maxRows = 100; }
  getLastRow() { let count = this.cells.length; while (count && !(this.cells[count - 1] || []).some(value => value !== "" && value != null)) count--; return count; }
  getLastColumn() { return Math.max(0, ...this.cells.map(row => row.length)); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  insertRowsAfter(_row, amount) { this.maxRows += amount; }
  insertColumnsAfter(_column, amount) { this.maxColumns += amount; }
  deleteRows(row, amount) { this.cells.splice(row - 1, amount); }
  deleteRow(row) { this.cells.splice(row - 1, 1); }
  setFrozenRows() {} setColumnWidth() {}
  normalize(value) { return typeof value === "string" && value.startsWith("'") ? value.slice(1) : value; }
  appendRow(row) { this.cells[this.getLastRow()] = row.map(value => this.normalize(value)); }
  getRange(row, column, rows = 1, columns = 1) {
    const getValues = () => Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => this.cells[row + i - 1]?.[column + j - 1] ?? ""));
    const setValues = values => values.forEach((value, i) => value.forEach((cell, j) => { this.cells[row + i - 1] ||= []; this.cells[row + i - 1][column + j - 1] = this.normalize(cell); }));
    return { getValues, setValues, getFormulas: () => Array.from({ length: rows }, () => Array(columns).fill("")), getValue: () => getValues()[0][0], setValue: value => setValues([[value]]), clearContent: () => setValues(Array.from({ length: rows }, () => Array(columns).fill(""))) };
  }
}

export function harness() {
  const sheets = new Map(), props = new Map([["RECAPTCHA_SECRET_KEY", "test-secret"]]), cache = new Map(), profiles = new Map(), files = new Map(), mails = [], triggers = [];
  let locked = false, captchaUsed = false;
  const lock = { tryLock: () => { if (locked) throw new Error("Nested script lock"); locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } };
  const propertyStore = { getProperty: key => props.get(key) || null, setProperty: (key, value) => props.set(key, value), deleteProperty: key => props.delete(key) };
  const sheetStore = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; } };
  const context = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} }, Date, Set, Map, JSON, Object, String, Number, Math, Array,
    PropertiesService: { getScriptProperties: () => propertyStore }, CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    LockService: { getScriptLock: () => lock }, SpreadsheetApp: { openById: () => sheetStore, flush() {} },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { MD5: "md5", SHA_256: "sha256" }, computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(String(value)).digest()],
      base64Encode: value => Buffer.from(value).toString("base64"), base64EncodeWebSafe: value => Buffer.from(value).toString("base64url"), base64Decode: value => [...Buffer.from(value, "base64")],
      newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, mime, name }), formatDate: date => new Date(date.getTime() + 8 * 3600000).toISOString().replace(/Z$/, "") },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: content => ({ getContent: () => content, setMimeType() { return this; } }) },
    UrlFetchApp: { fetch: (url, options) => {
      if (url.includes("siteverify")) {
        const success = options.payload.response === "captcha" && !captchaUsed;
        captchaUsed = true;
        return { getContentText: () => JSON.stringify({ success }) };
      }
      const token = new URL(url).searchParams.get("id_token"), profile = profiles.get(token);
      return { getResponseCode: () => profile ? 200 : 401, getContentText: () => JSON.stringify(profile || {}) };
    } },
    DriveApp: { Access: { PRIVATE: "private" }, Permission: { VIEW: "view" }, getFolderById: () => ({ getSharingAccess: () => "private", createFile: blob => {
      const id = crypto.randomUUID(), file = { getId: () => id, setTrashed(value) { this.trashed = value; }, setSharing(access) { if (access !== "private") throw new Error("Public file!"); }, getMimeType: () => blob.mime, getSize: () => blob.getBytes().length, getBlob: () => blob };
      files.set(id, file); return file;
    } }), getFileById: id => files.get(id) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: value => mails.push(value) },
    ScriptApp: { getProjectTriggers: () => triggers, newTrigger: handler => ({ timeBased() { return this; }, everyMinutes() { return this; }, create() { const trigger = { getHandlerFunction: () => handler }; triggers.push(trigger); return trigger; } }) },
  });
  const sources = fs.readdirSync("GAS").filter(name => name.endsWith(".gs")).map(name => fs.readFileSync(`GAS/${name}`, "utf8")).join("\n");
  vm.runInContext(sources, context, { timeout: 5000 });
  const evaluate = code => vm.runInContext(code, context);
  const columns = name => evaluate(name);
  const seed = (name, columnName, rows) => { const sh = sheetStore.getSheetByName(name) || sheetStore.insertSheet(name); const cols = columns(columnName); sh.cells = [Array.from(cols), ...rows.map(row => Array.from(cols, key => row[key] ?? ""))]; return sh; };
  const read = (name, columnName) => { const sh = sheets.get(name); return sh ? sh.cells.slice(1).filter(row => row.some(value => value !== "")).map(row => Object.fromEntries(Array.from(columns(columnName), (key, i) => [key, row[i] ?? ""]))) : []; };
  seed("Users", "USERS_COLUMN", [{ email: "admin@test.com", googleSub: "admin", role: "admin" }, { email: "alice@test.com", googleSub: "alice", role: "user" }, { email: "bob@test.com", googleSub: "bob", role: "user" }, { email: "teacher@test.com", googleSub: "teacher", role: "teacher" }]);
  seed("Subject", "SUBJECT_COLUMN", [{ subjectID: "S1", subjectName: "MOS", color: "#fff" }]);
  seed("Room", "ROOM_COLUMN", [{ roomID: "ROOM1", placeName: "教室", address: "新竹", capacity: 2 }]);
  const future = hours => new Date(Date.now() + hours * 3600000).toISOString();
  seed("Exam", "EXAM_COLUMN", [{ examID: "E1", subjectID: "S1", roomID: "ROOM1", examStartTime: future(240), examEndTime: future(242), fee: 1000, status: "Open", numHasReserved: 0 }, { examID: "E2", subjectID: "S1", roomID: "ROOM1", examStartTime: future(300), examEndTime: future(302), fee: 1000, status: "Open", numHasReserved: 0 }]);
  for (const token of ["admin", "alice", "bob", "teacher"]) profiles.set(token, { aud: evaluate("GOOGLE_CLIENT_ID"), iss: "https://accounts.google.com", exp: Math.floor(Date.now() / 1000) + 3600, email_verified: "true", email: `${token}@test.com`, sub: token });
  const request = (route, payload = {}, token = "alice") => {
    context.bookingSheetCache_ = {}; // Apps Script globals are fresh for every HTTP execution.
    captchaUsed = false; // Each request represents a new client challenge, consumed only once.
    return JSON.parse(context.doPost({ parameter: { route }, postData: { contents: JSON.stringify({ ...payload, ...(token ? { idToken: token } : {}) }) } }).getContent());
  };
  const book = (examID = "E1", token = "alice", key = crypto.randomUUID()) => request("submitReservation", { bookingData: { examID, firstname: "Alice", lastname: "Test", phone: "0912345678", language: "繁體中文", certiportAccount: "alice-account", token: "captcha", submissionKey: key } }, token);
  return { context, evaluate, seed, read, sheets, profiles, cache, request, book, future, mails, files, columns };
}
