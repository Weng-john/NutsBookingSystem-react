import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import * as api from "./api";
import useRemote from "./useRemote";
import { Chips, EmptyState, Field, FilterBar, Pager, Pill, ServicePage, Switch } from "./ServiceUI";
import { notify } from "../../dialog";
import {
  auditActions, auditFields, auditValues, bookingAmounts, createCSV, downloadText, entityTypes, formatDateTime, formatShort, isTrue, money,
  notificationIcons, notificationStatuses, notificationTones, notificationTypes, shortId,
} from "./utils";

/* =========================================
   名單與統計 (Admin)
   ========================================= */

const reportStatuses = [["", "全部（含歷史）"], ["active", "有效報名"], ["paid", "已付款"], ["unpaid", "未付款"], ["registration_review", "尚未通過報名審核"], ["payment_review", "待審核付款"], ["cancelled", "已取消"]];
const emptyReportFilter = { from: "", to: "", examID: "", subjectID: "", roomID: "", status: "" };

// 名單上每筆報名的狀態標籤 [文字, 色調]
function reportState(res) {
  if (res.reservationStatus === "cancelled") return ["已取消", "muted"];
  if (isTrue(res.paymentStatus)) return ["已付款", "success"];
  if (String(res.paymentStatus).toUpperCase() === "PENDING") return ["待審付款", "info"];
  if (isTrue(res.reviewStatus)) return ["未繳費", "warning"];
  return res.comment ? ["報名退件", "danger"] : ["待審核", "pending"];
}

export function ReservationReportPage() {
  const { user } = useOutletContext(), [filter, setFilter] = useState(emptyReportFilter);
  const loader = useCallback(() => user?.role === "admin" ? api.getReport(filter) : Promise.resolve({ items: [], groups: [], summary: {} }), [user, filter]);
  const remote = useRemote(loader), data = remote.data || remote.previousData;
  const options = data?.options || { exams: [], subjects: [], rooms: [] };
  const change = (key, value) => setFilter({ ...filter, [key]: value });
  const activeCount = Object.values(filter).filter(Boolean).length;

  const exportCSV = () => {
    const rows = [["報名序號", "場次ID", "科目", "時間", "考場", "姓名", "Email", "電話", "語言", "加購", "報名狀態", "報名審核", "付款狀態", "應付", "已確認付款", "未收", "已退", "金額來源"]];
    data.items.forEach(res => {
      const amounts = bookingAmounts(res);
      rows.push([res.reserveID, res.examID, res.examInfo?.subjectName, formatDateTime(res.examInfo?.examStartTime), res.examInfo?.location, `${res.lastname}${res.firstname}`, res.email,
        String(res.phoneNumber || "").replace(/^'/, ""), res.language, isTrue(res.additional) ? "有" : "無", res.reservationStatus === "cancelled" ? "已取消" : "有效",
        isTrue(res.reviewStatus) ? "已通過" : "未通過／待審", isTrue(res.paymentStatus) ? "已付款" : res.paymentStatus === "PENDING" ? "待審付款" : "未付款",
        amounts.due, amounts.paid, amounts.outstanding, amounts.refunded, res.amountEstimated ? "推估" : "報名快照"]);
    });
    downloadText(`報名名單-${filter.from || "全部"}-${filter.to || "全部"}.csv`, createCSV(rows), "text/csv;charset=utf-8");
  };

  const summary = data?.summary || {};
  return (
    <ServicePage
      title="名單與統計" subtitle="依條件查看報名名單、收款與各場次名額" admin remote={remote}
      actions={
        <button type="button" className="svc-btn primary" disabled={remote.loading || !!remote.error || !data?.items.length} onClick={exportCSV}>
          <i className="fa-solid fa-file-csv"></i><span>匯出 CSV</span>
        </button>
      }
      toolbar={
        <FilterBar collapsible activeCount={activeCount} onClear={() => setFilter(emptyReportFilter)}>
          <Field label="考試日期起" htmlFor="report-from"><input id="report-from" type="date" value={filter.from} onChange={e => change("from", e.target.value)} /></Field>
          <Field label="考試日期迄" htmlFor="report-to"><input id="report-to" type="date" value={filter.to} onChange={e => change("to", e.target.value)} /></Field>
          <Field label="科目" htmlFor="report-subject">
            <select id="report-subject" value={filter.subjectID} onChange={e => change("subjectID", e.target.value)}>
              <option value="">全部</option>
              {options.subjects.map(subject => <option key={subject.subjectID} value={subject.subjectID}>{subject.subjectName}</option>)}
            </select>
          </Field>
          <Field label="場次" htmlFor="report-exam">
            <select id="report-exam" value={filter.examID} onChange={e => change("examID", e.target.value)}>
              <option value="">全部</option>
              {options.exams.map(exam => <option key={exam.examID} value={exam.examID}>{exam.subjectName} · {formatShort(exam.startTime)}</option>)}
            </select>
          </Field>
          <Field label="考場" htmlFor="report-room">
            <select id="report-room" value={filter.roomID} onChange={e => change("roomID", e.target.value)}>
              <option value="">全部</option>
              {options.rooms.map(room => <option key={room.roomID} value={room.roomID}>{room.placeName}</option>)}
            </select>
          </Field>
          <Field label="報名狀態" htmlFor="report-status">
            <select id="report-status" value={filter.status} onChange={e => change("status", e.target.value)}>
              {reportStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </FilterBar>
      }
    >
      {data?.summary && (
        <>
          <div className="svc-stats">
            <div className="svc-stat"><span>有效報名</span><strong>{summary.active}</strong><small>全部紀錄 {summary.count} 筆</small></div>
            <div className="svc-stat tone-pending"><span>待報名審核</span><strong>{summary.pendingRegistration}</strong></div>
            <div className="svc-stat tone-info"><span>待付款審核</span><strong>{summary.pendingPayment}</strong></div>
            <div className="svc-stat tone-warning"><span>未繳費</span><strong>{summary.unpaid}</strong></div>
          </div>
          <div className="svc-stats money">
            <div className="svc-stat"><span>有效應收</span><strong>{money(summary.due)}</strong></div>
            <div className="svc-stat tone-success"><span>已確認收款</span><strong>{money(summary.paid)}</strong></div>
            <div className="svc-stat tone-warning"><span>未收</span><strong>{money(summary.outstanding)}</strong></div>
            <div className="svc-stat tone-muted"><span>已退</span><strong>{money(summary.refunded)}</strong></div>
            <div className="svc-stat tone-success"><span>淨收款</span><strong>{money(summary.net)}</strong></div>
          </div>
          {summary.estimated > 0 && (
            <div className="exam-notice warning"><i className="fa-solid fa-triangle-exclamation"></i>其中 {summary.estimated} 筆舊資料的金額為推估，需人工核對。</div>
          )}

          <h2 className="svc-subhead">各場次名額<span className="svc-count">{data.groups.length}</span></h2>
          {!data.groups.length && <p className="svc-hint">沒有符合條件的場次。</p>}
          <div className="svc-groups">
            {data.groups.map(group => (
              <div className="svc-group" key={group.examID}>
                <div className="svc-group-title"><strong>{group.subjectName}</strong><span>{formatShort(group.startTime) || "時間未定"}</span></div>
                <div className="exam-seats">
                  <div className="exam-seats-bar"><span style={{ width: `${group.capacity ? Math.min(100, Math.round(group.reserved / group.capacity * 100)) : 0}%` }}></span></div>
                  <span>已佔 {group.reserved} / {group.capacity}，剩餘 {group.remaining} 名額{group.count !== group.reserved && `（符合條件 ${group.count} 筆）`}</span>
                </div>
              </div>
            ))}
          </div>

          <h2 className="svc-subhead">報名名單<span className="svc-count">{data.items.length}</span></h2>
          {!data.items.length ? <p className="svc-hint">沒有符合條件的報名。</p> : (
            <div className="svc-table-wrap">
              <table className="svc-table">
                <thead><tr><th>考生</th><th>科目／時間</th><th>狀態</th><th className="num">應付</th><th className="num">已付</th><th className="num">已退</th></tr></thead>
                <tbody>
                  {data.items.map(res => {
                    const amounts = bookingAmounts(res), [label, tone] = reportState(res);
                    return (
                      <tr key={res.reserveID}>
                        <td><strong>{res.lastname}{res.firstname}</strong><small>{res.email}</small></td>
                        <td>{res.examInfo?.subjectName || "場次已刪除"}<small>{formatShort(res.examInfo?.examStartTime)} · <span title={res.reserveID}>{shortId(res.reserveID)}</span></small></td>
                        <td><Pill tone={tone}>{label}</Pill></td>
                        <td className="num">{amounts.due.toLocaleString("en-US")}{res.amountEstimated && <small>推估</small>}</td>
                        <td className="num">{amounts.paid.toLocaleString("en-US")}</td>
                        <td className="num">{amounts.refunded.toLocaleString("en-US")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ServicePage>
  );
}

/* =========================================
   操作紀錄 (Admin)
   ========================================= */

const emptyAuditFilter = { entityID: "", actor: "", from: "", to: "" };

function auditValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return formatDateTime(value);
  return auditValues[value] || String(value);
}

// 只列出真的有變動的欄位
function Changes({ before = {}, after = {} }) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!keys.length) return null;
  return (
    <details className="svc-details">
      <summary><i className="fa-solid fa-chevron-right"></i>變更內容<span className="svc-count">{keys.length}</span></summary>
      <div className="svc-table-wrap">
        <table className="svc-table compact">
          <thead><tr><th>欄位</th><th>修改前</th><th>修改後</th></tr></thead>
          <tbody>
            {keys.map(key => <tr key={key}><td>{auditFields[key] || key}</td><td className="before">{auditValue(before[key])}</td><td className="after">{auditValue(after[key])}</td></tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AuditLogsPage() {
  const { user } = useOutletContext(), [filter, setFilter] = useState(emptyAuditFilter), [page, setPage] = useState(1);
  const loader = useCallback(() => user?.role === "admin" ? api.getAuditLogs({ ...filter, page }) : Promise.resolve({ items: [] }), [user, filter, page]);
  const remote = useRemote(loader), data = remote.data || remote.previousData;
  const change = (key, value) => { setPage(1); setFilter({ ...filter, [key]: value }); };

  return (
    <ServicePage
      title="操作紀錄" subtitle="報名、審核、申請與設定的每一次異動" admin remote={remote}
      toolbar={
        <FilterBar collapsible activeCount={Object.values(filter).filter(Boolean).length} onClear={() => { setPage(1); setFilter(emptyAuditFilter); }}>
          <Field label="報名／申請／場次編號" htmlFor="audit-entityID" wide><input id="audit-entityID" type="search" value={filter.entityID} placeholder="完整編號" onChange={e => change("entityID", e.target.value)} /></Field>
          <Field label="操作者 Email" htmlFor="audit-actor" wide><input id="audit-actor" type="search" value={filter.actor} onChange={e => change("actor", e.target.value)} /></Field>
          <Field label="開始日期" htmlFor="audit-from"><input id="audit-from" type="date" value={filter.from} onChange={e => change("from", e.target.value)} /></Field>
          <Field label="結束日期" htmlFor="audit-to"><input id="audit-to" type="date" value={filter.to} onChange={e => change("to", e.target.value)} /></Field>
        </FilterBar>
      }
      footer={<Pager data={data} page={page} onPage={setPage} />}
    >
      {data && !data.items.length && !remote.error && <EmptyState icon="fa-clock-rotate-left" text="沒有符合條件的紀錄。" />}
      <div className="svc-list dense">
        {data?.items.map(log => (
          <article className="svc-log" key={log.auditID}>
            <div className="svc-log-head">
              <strong>{auditActions[log.action] || log.action}</strong>
              <time className="svc-time">{formatDateTime(log.createdAt)}</time>
            </div>
            <ul className="svc-meta">
              <li><i className="fa-solid fa-user-pen"></i>{log.actor}</li>
              <li><i className="fa-solid fa-hashtag"></i>{entityTypes[log.entityType] || log.entityType}<code title={log.entityID}>{shortId(log.entityID)}</code></li>
            </ul>
            {log.reason && <p className="svc-reason">{log.reason}</p>}
            <Changes before={log.before} after={log.after} />
          </article>
        ))}
      </div>
    </ServicePage>
  );
}

/* =========================================
   通知中心
   ========================================= */

export function NotificationsPage() {
  const { user } = useOutletContext(), [busy, setBusy] = useState(false);
  // 剛標為已讀、還沒重新讀取清單的通知
  const [readIds, setReadIds] = useState(() => new Set());
  const loader = useCallback(() => user ? Promise.all([api.getNotifications(), api.getPreferences()]).then(([notifications, settings]) => ({ ...notifications, ...settings })) : Promise.resolve({ items: [] }), [user]);
  const remote = useRemote(loader), data = remote.data || remote.previousData;

  const preference = async (key, value) => {
    setBusy(true);
    try { await api.updatePreferences({ ...data.preferences, [key]: value }); remote.refresh(); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  // 展開未讀通知時順便標為已讀。先更新畫面，失敗再還原
  const read = async id => {
    setReadIds(previous => new Set(previous).add(id));
    try { await api.markNotificationRead(id); }
    catch (error) { setReadIds(previous => { const next = new Set(previous); next.delete(id); return next; }); notify(error.message); }
  };

  const isUnread = item => !item.readAt && !readIds.has(item.notificationID);
  const unread = data?.items.filter(isUnread).length || 0;

  return (
    <ServicePage title="通知中心" subtitle="審核結果、場次異動與提醒" remote={remote}>
      {data?.preferences && (
        <div className="svc-panel">
          <h2 className="svc-subhead">提醒偏好</h2>
          <div className="svc-switches">
            <Switch label="繳費到期提醒" hint="繳費期限前寄信提醒" checked={data.preferences.paymentReminder} disabled={busy || remote.loading} onChange={value => preference("paymentReminder", value)} />
            <Switch label="考前提醒" hint="考試前寄信提醒" checked={data.preferences.examReminder} disabled={busy || remote.loading} onChange={value => preference("examReminder", value)} />
          </div>
          <p className="svc-hint">審核結果與場次異動一定會通知，無法關閉。</p>
        </div>
      )}

      {data && <h2 className="svc-subhead">通知{unread > 0 && <span className="svc-count accent">{unread} 則未讀</span>}</h2>}
      {data && !data.items.length && !remote.error && <EmptyState icon="fa-bell-slash" text="目前沒有通知。" />}
      <div className="svc-list dense">
        {data?.items.map(item => (
          <details className={`svc-note ${isUnread(item) ? "unread" : ""}`} key={item.notificationID} onToggle={event => { if (event.currentTarget.open && isUnread(item)) read(item.notificationID); }}>
            <summary>
              <span className="svc-note-icon"><i className={`fa-solid ${notificationIcons[item.type] || "fa-envelope"}`}></i></span>
              <span className="svc-note-text">
                <strong>{item.subject}</strong>
                <small>{notificationTypes[item.type] || "通知"} · {formatDateTime(item.createdAt)}</small>
              </span>
              <i className="fa-solid fa-chevron-down svc-note-chevron"></i>
            </summary>
            <div className="svc-note-body">
              <p>{item.content}</p>
              {item.reserveID && <Link to="/myReserve" className="svc-btn"><i className="fa-solid fa-calendar-check"></i>查看我的考試</Link>}
            </div>
          </details>
        ))}
      </div>
    </ServicePage>
  );
}

/* =========================================
   通知管理 (Admin)
   ========================================= */

export function NotificationManagerPage() {
  const { user, requestCaptcha } = useOutletContext();
  const [page, setPage] = useState(1), [status, setStatus] = useState(""), [rules, setRules] = useState(null), [busy, setBusy] = useState(false);
  const loader = useCallback(() => user?.role === "admin" ? Promise.all([api.getNotificationRules(), api.getDeliveryLogs({ page, status })]).then(([settings, logs]) => ({ ...logs, ...settings })) : Promise.resolve({ items: [] }), [user, page, status]);
  const remote = useRemote(loader), data = remote.data || remote.previousData;
  useEffect(() => { if (remote.data?.rules) Promise.resolve().then(() => setRules(remote.data.rules)); }, [remote.data]);

  const save = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      await api.updateNotificationRules(rules, captchaToken); notify("提醒設定已儲存。"); remote.refresh();
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const retry = async id => {
    setBusy(true);
    try {
      const captchaToken = await requestCaptcha();
      if (!captchaToken) return;
      await api.retryNotification(id, captchaToken); remote.refresh();
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };

  return (
    <ServicePage title="通知管理" subtitle="自動提醒的規則與信件發送紀錄" admin remote={remote} footer={<Pager data={data} page={page} onPage={setPage} />}>
      {data && "triggerInstalled" in data && (
        data.triggerInstalled
          ? <div className="exam-notice info"><i className="fa-solid fa-circle-check"></i>排程已安裝，每 15 分鐘自動寄送佇列中的通知。</div>
          : <div className="exam-notice warning"><i className="fa-solid fa-triangle-exclamation"></i>排程尚未安裝，通知不會寄出。請由 GAS 部署者在編輯器執行 installBookingNotificationTrigger。</div>
      )}

      {rules && (
        <form className="svc-panel" onSubmit={save}>
          <h2 className="svc-subhead">自動提醒規則</h2>
          <div className="svc-rules">
            {[["paymentReminder", "paymentHours", "繳費到期提醒", "繳費期限前"], ["examReminder", "examHours", "考前提醒", "考試開始前"]].map(([enabled, hours, label, prefix]) => (
              <div className="svc-rule" key={enabled}>
                <Switch label={label} checked={rules[enabled]} disabled={busy} onChange={value => setRules({ ...rules, [enabled]: value })} />
                <label className="svc-rule-hours" htmlFor={hours}>
                  {prefix}
                  <input id={hours} type="number" min="1" max="720" required value={rules[hours]} disabled={busy || !rules[enabled]} onChange={e => setRules({ ...rules, [hours]: e.target.value })} />
                  小時寄出
                </label>
              </div>
            ))}
          </div>
          <div className="svc-panel-actions"><button type="submit" className="svc-btn primary" disabled={busy}><i className="fa-solid fa-floppy-disk"></i>儲存提醒設定</button></div>
        </form>
      )}

      {data && (
        <div className="svc-subhead-row">
          <h2 className="svc-subhead">發送紀錄{data.total > 0 && <span className="svc-count">{data.total}</span>}</h2>
          <Chips label="發送狀態" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[["", "全部"], ...Object.entries(notificationStatuses)]} />
        </div>
      )}
      {data && !data.items.length && !remote.error && <EmptyState icon="fa-envelope-open" text="沒有符合條件的發送紀錄。" />}
      <div className="svc-list dense">
        {data?.items.map(item => (
          <article className={`svc-log tone-${notificationTones[item.status] || "muted"}`} key={item.notificationID}>
            <div className="svc-log-head">
              <strong>{item.subject}</strong>
              <Pill tone={notificationTones[item.status]}>{notificationStatuses[item.status] || item.status}</Pill>
            </div>
            <ul className="svc-meta">
              <li><i className="fa-regular fa-envelope"></i>{item.email}</li>
              <li><i className="fa-regular fa-clock"></i>{formatDateTime(item.sentAt || item.createdAt)}{item.sentAt ? " 寄出" : " 排入"}</li>
              <li><i className="fa-solid fa-tag"></i>{notificationTypes[item.type] || item.type}</li>
              {Number(item.attempts) > 0 && <li><i className="fa-solid fa-repeat"></i>嘗試 {item.attempts} 次</li>}
            </ul>
            {item.lastError && <p className="svc-error">{item.lastError}</p>}
            {item.status === "failed" && (
              <div className="svc-card-actions">
                <button type="button" className="svc-btn" disabled={busy} onClick={() => retry(item.notificationID)}><i className="fa-solid fa-rotate-right"></i>重新排入發送</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </ServicePage>
  );
}
