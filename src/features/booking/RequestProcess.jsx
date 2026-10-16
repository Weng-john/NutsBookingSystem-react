import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import Modal from "./Modal";
import { IdTag, Pill, Timeline } from "./ServiceUI";
import { processRequest } from "./api";
import { confirmDialog, notify } from "../../dialog";
import { formatDateTime, formatShort, money, requestIcons, requestStatuses, requestTones, requestTypes, shortId } from "./utils";

// 每個狀態可以前往的下一步 (和後端 processReservationRequest 的規則一致)
const requestTransitions = { pending: ["processing", "approved", "rejected"], processing: ["approved", "rejected"], approved: ["completed", "rejected"] };
const transitionHints = {
  processing: "標示為處理中，考生無法再撤回。",
  approved: "核准申請。原報名仍保留，要到「完成」才會實際變更。",
  completed: "登記實際退款並取消報名，名額同步釋出。",
  rejected: "拒絕申請，原報名維持不變。",
};

/** 一件申請的摘要：類型、狀態、考生與場次、原因、處理進度 */
function RequestCard({ request, children }) {
  const context = request.context || {};
  const hasAmount = request.approvedAmount !== "" && request.approvedAmount != null;
  return (
    <article className={`svc-card tone-${requestTones[request.status] || "muted"}`}>
      <div className="svc-card-head">
        <span className="svc-type"><i className={`fa-solid ${requestIcons[request.type] || "fa-file-lines"}`}></i>{requestTypes[request.type] || request.type}</span>
        <Pill tone={requestTones[request.status]}>{requestStatuses[request.status] || request.status}</Pill>
        <time className="svc-time">{formatDateTime(request.createdAt)} 提出</time>
      </div>

      <h3>{context.subjectName || `報名 ${shortId(request.reserveID)}`}</h3>
      <ul className="svc-meta">
        <li><i className="fa-solid fa-user"></i>{context.applicant || "未知考生"}<span>{request.email}</span></li>
        {context.examStartTime && <li><i className="fa-regular fa-calendar"></i>{formatShort(context.examStartTime)}{context.location && <span>{context.location}</span>}</li>}
      </ul>
      <p className="svc-reason">{request.reason}</p>

      <div className="svc-facts">
        <IdTag label="報名" value={request.reserveID} />
        <span className="svc-fact">已確認收款<strong>{money(context.paidAmount)}</strong></span>
        {Number(context.refundedAmount) > 0 && <span className="svc-fact">已退<strong>{money(context.refundedAmount)}</strong></span>}
        {hasAmount && <span className="svc-fact">核准退費<strong>{money(request.approvedAmount)}</strong></span>}
        {request.refundReference && <span className="svc-fact">退款憑證<strong>{request.refundReference}</strong></span>}
      </div>

      <div className="svc-card-foot">
        <Timeline history={request.history} />
        {children && <div className="svc-card-actions">{children}</div>}
      </div>
    </article>
  );
}

/**
 * 管理員處理退費申請的視窗 (在「報名管理」的退費申請分頁點選一筆報名時開啟)
 *
 * props:
 *   request   utils 的 requestFromReservation() 整理出來的資料
 *   onClose   關閉視窗
 *   onDone    處理完成後重新讀取清單
 */
export default function RequestProcessModal({ request, onClose, onDone }) {
  const { requestCaptcha } = useOutletContext();
  const nextSteps = requestTransitions[request.status] || [];
  const [status, setStatus] = useState(nextSteps[0] || ""), [comment, setComment] = useState("");
  const [amount, setAmount] = useState(request.approvedAmount || ""), [reference, setReference] = useState(""), [busy, setBusy] = useState(false);
  const refundable = Math.max(0, Number(request.context?.paidAmount || 0) - Number(request.context?.refundedAmount || 0));

  const submit = async event => {
    event.preventDefault();
    if (!await confirmDialog(`確定將退費申請更新為「${requestStatuses[status]}」？`, status === "rejected" ? { tone: "danger" } : {})) return;
    setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      await processRequest({ requestID: request.requestID, version: request.version, status, comment, approvedAmount: amount, refundReference: reference, captchaToken });
      notify("申請進度已更新。"); onDone?.(); onClose();
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={nextSteps.length ? "處理退費申請" : "退費申請"} onClose={() => { if (!busy) onClose(); }}>
      <RequestCard request={request} />
      {request.refundDetails && (
        <div className="svc-callout">
          <strong><i className="fa-solid fa-building-columns"></i>退款收款資料</strong>
          <p>{request.refundDetails}</p>
        </div>
      )}

      {nextSteps.length > 0 && (
        <form className="exam-form svc-form" onSubmit={submit}>
          <div className="form-group">
            <label>下一步</label>
            <div className="svc-choices" role="radiogroup" aria-label="下一步">
              {nextSteps.map(value => (
                <button type="button" key={value} role="radio" aria-checked={status === value} disabled={busy}
                  className={`svc-choice tone-${requestTones[value]} ${status === value ? "active" : ""}`} onClick={() => setStatus(value)}>
                  <strong>{requestStatuses[value]}</strong>
                </button>
              ))}
            </div>
            <p className="svc-hint">{transitionHints[status]}</p>
          </div>

          {status === "approved" && (
            <div className="form-group">
              <label htmlFor="refund-approved">核准退費金額<span className="required-mark">*</span></label>
              <input id="refund-approved" type="number" min="1" max={refundable || undefined} required value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} />
              <p className="svc-hint">已確認收款 {money(request.context?.paidAmount)}，目前最多可退 {money(refundable)}。</p>
            </div>
          )}
          {status === "completed" && (
            <div className="form-group">
              <label htmlFor="refund-reference">退款交易／憑證編號<span className="required-mark">*</span></label>
              <input id="refund-reference" required maxLength={100} value={reference} disabled={busy} onChange={e => setReference(e.target.value)} />
              <p className="svc-hint">請在實際完成退款後登記。核准金額：{money(request.approvedAmount)}</p>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="process-comment">處理說明{["completed", "rejected"].includes(status) && <span className="required-mark">*</span>}</label>
            <textarea id="process-comment" className="svc-short" required={["completed", "rejected"].includes(status)} value={comment} maxLength={2000} disabled={busy}
              placeholder="會顯示在考生的處理進度中" onChange={e => setComment(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" disabled={busy} onClick={onClose}>取消</button>
            <button type="submit" className={`btn-confirm ${status === "rejected" ? "btn-danger" : ""}`} disabled={busy || !status}>{busy ? "處理中…" : `更新為${requestStatuses[status] || ""}`}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
