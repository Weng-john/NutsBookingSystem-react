import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import Modal from "./Modal";
import { setResult } from "./api";
import { notify } from "../../dialog";
import { formatShort, shortId } from "./utils";

/**
 * 考後登記出席與成績的視窗 (在「報名管理」的成績登記分頁點選一筆報名時開啟)。
 * 登記後可以再點進來修改
 *
 * props:
 *   reservation  報名資料
 *   onClose      關閉視窗
 *   onDone       儲存後重新讀取清單
 */
export default function ResultEntryModal({ reservation, onClose, onDone }) {
  const { requestCaptcha } = useOutletContext();
  const [attendance, setAttendance] = useState(reservation.attendance || "present");
  const [score, setScore] = useState(reservation.score ?? ""), [result, setResultValue] = useState(reservation.examResult || "");
  const [note, setNote] = useState(reservation.resultNote || ""), [busy, setBusy] = useState(false);
  const exam = reservation.examInfo || {}, present = attendance === "present";

  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      // 缺考不會有分數與結果
      await setResult({ reserveID: reservation.reserveID, attendance, score: present ? score : "", result: present ? result : "", note, captchaToken });
      notify("成績已登記。"); onDone?.(); onClose();
    } catch (error) { notify(`登記失敗：${error.message}`); } finally { setBusy(false); }
  };

  return (
    <Modal title="登記成績" onClose={() => { if (!busy) onClose(); }}>
      <div className="svc-card">
        <h3>{exam.subjectName || "未知場次"}</h3>
        <ul className="svc-meta">
          <li><i className="fa-solid fa-user"></i>{reservation.lastname}{reservation.firstname}<span>{reservation.email}</span></li>
          <li><i className="fa-regular fa-calendar"></i>{formatShort(exam.examStartTime) || "時間未定"}{exam.location && <span>{exam.location}</span>}</li>
          <li><i className="fa-solid fa-hashtag"></i><code title={reservation.reserveID}>{shortId(reservation.reserveID)}</code></li>
        </ul>
      </div>

      <form className="exam-form svc-form" onSubmit={submit}>
        <div className="form-group">
          <label>出席狀況</label>
          <div className="svc-choices" role="radiogroup" aria-label="出席狀況">
            <button type="button" role="radio" aria-checked={present} disabled={busy} className={`svc-choice tone-success ${present ? "active" : ""}`} onClick={() => setAttendance("present")}><strong>出席</strong></button>
            <button type="button" role="radio" aria-checked={!present} disabled={busy} className={`svc-choice tone-muted ${!present ? "active" : ""}`} onClick={() => setAttendance("absent")}><strong>缺考</strong></button>
          </div>
        </div>

        {present && (
          <>
            <div className="form-group">
              <label htmlFor="result-score">分數</label>
              <input id="result-score" type="number" min="0" max="1000" step="1" value={score} disabled={busy} placeholder="0 – 1000，可以先不填" onChange={e => setScore(e.target.value)} />
            </div>
            <div className="form-group">
              <label>考試結果</label>
              <div className="svc-choices" role="radiogroup" aria-label="考試結果">
                <button type="button" role="radio" aria-checked={result === "pass"} disabled={busy} className={`svc-choice tone-success ${result === "pass" ? "active" : ""}`} onClick={() => setResultValue("pass")}><strong>通過</strong></button>
                <button type="button" role="radio" aria-checked={result === "fail"} disabled={busy} className={`svc-choice tone-danger ${result === "fail" ? "active" : ""}`} onClick={() => setResultValue("fail")}><strong>未通過</strong></button>
                <button type="button" role="radio" aria-checked={result === ""} disabled={busy} className={`svc-choice tone-muted ${result === "" ? "active" : ""}`} onClick={() => setResultValue("")}><strong>尚未確定</strong></button>
              </div>
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor="result-note">給考生的備註</label>
          <textarea id="result-note" className="svc-short" maxLength={500} value={note} disabled={busy} placeholder="例如：證書領取方式（選填）" onChange={e => setNote(e.target.value)} />
          {present && <p className="svc-hint">填了分數或結果，考生會收到「成績公布」通知（信裡不含分數，需登入查看）。</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="btn-confirm" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
        </div>
      </form>
    </Modal>
  );
}
