import { useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { formatDateTime, requestStatuses, requestTones, shortId } from "./utils";
import Breadcrumbs from "../../components/Breadcrumbs";
import Tooltip from "../../components/Tooltip";

/* 報名服務各頁共用的版面與小元件 (樣式在 index.css 第 13 節) */

export function RefreshButton({ loading, onClick }) {
  return (
    <Tooltip content="重新整理資料" side="left">
      <button type="button" onClick={onClick} disabled={loading} className={`btn-refresh ${loading ? "is-loading" : ""}`} aria-label="重新整理資料">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
        </svg>
      </button>
    </Tooltip>
  );
}

/**
 * 服務頁的外框：一張面板 (標題列、篩選列、可捲動的內容、頁尾)。
 * 面板填滿可用高度，只有內容區會捲動，和其他管理頁一致。
 *
 * props:
 *   admin     是否限管理員
 *   open      是否不用登入也能看 (考試須知)
 *   remote    useRemote 的回傳值，用來顯示載入中、錯誤與重新整理鍵
 *   actions   標題列右側的按鈕
 *   toolbar   篩選列
 *   footer    頁尾 (分頁)
 */
export function ServicePage({ title, subtitle, admin = false, open = false, remote, actions, toolbar, footer, children }) {
  const { user } = useOutletContext();
  if (!user && !open) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") {
    return (
      <div className="svc-shell">
        <section className="svc-page">
          <EmptyState icon="fa-lock" text="這個頁面只開放給管理員。"><Link to="/" className="svc-btn">返回首頁</Link></EmptyState>
        </section>
      </div>
    );
  }
  const hasData = !!(remote?.data || remote?.previousData);
  return (
    <div className="svc-shell">
      <section className="svc-page">
        <header className="svc-head">
          <div className="svc-head-text">
            <Breadcrumbs items={[{ label: "首頁", to: "/" }, { label: title }]} />
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="svc-head-actions">
            {actions}
            {remote && <RefreshButton loading={remote.loading} onClick={remote.refresh} />}
          </div>
        </header>
        {toolbar}
        <div className={`svc-body scroll-area ${remote?.loading && hasData ? "is-loading" : ""}`}>
          {remote?.error && <div className="exam-notice danger" role="alert"><i className="fa-solid fa-triangle-exclamation"></i>讀取失敗：{remote.error}</div>}
          {remote?.loading && !hasData && <div className="svc-loading" role="status"><span className="svc-spinner"></span>載入中…</div>}
          {children}
        </div>
        {footer}
      </section>
    </div>
  );
}

export function EmptyState({ icon = "fa-inbox", text, children }) {
  return (
    <div className="empty-state svc-empty">
      <i className={`fa-solid ${icon}`}></i>
      <p>{text}</p>
      {children}
    </div>
  );
}

/** 狀態標籤。tone 對應 index.css 的 .tone-<名稱> */
export function Pill({ tone = "muted", icon, children }) {
  return <span className={`svc-pill tone-${tone}`}>{icon && <i className={`fa-solid ${icon}`}></i>}{children}</span>;
}

/** 編號太長時只顯示前段，滑過可看到完整編號 */
export function IdTag({ label, value }) {
  if (!value) return null;
  return (
    <Tooltip content={String(value)}>
      <span className="svc-id" tabIndex={0} aria-label={`${label ? `${label}，` : ""}完整編號 ${value}`}>
        {label && <span>{label}</span>}<code>{shortId(value)}</code>
      </span>
    </Tooltip>
  );
}

/** 開關 (取代原生勾選框) */
export function Switch({ checked, disabled, onChange, label, hint }) {
  return (
    <label className={`svc-switch ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="svc-switch-track" aria-hidden="true"></span>
      <span className="svc-switch-text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

/** 單選的篩選按鈕列 */
export function Chips({ label, options, value, onChange }) {
  return (
    <div className="svc-chips" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button type="button" key={key} className={`svc-chip ${value === key ? "active" : ""}`} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>
      ))}
    </div>
  );
}

/**
 * 篩選列。欄位多的頁面在手機上預設收合，按「篩選」才展開 (collapsible)
 * activeCount 是目前有設定的條件數，顯示在按鈕上
 */
export function FilterBar({ children, collapsible = false, activeCount = 0, onClear }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`svc-toolbar ${collapsible ? "collapsible" : ""} ${open ? "open" : ""}`}>
      {collapsible && (
        <button type="button" className="svc-btn svc-filter-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <i className="fa-solid fa-sliders"></i>篩選{activeCount > 0 && <span className="svc-count">{activeCount}</span>}
          <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`}></i>
        </button>
      )}
      <div className="svc-filters">{children}</div>
      {onClear && activeCount > 0 && <button type="button" className="svc-btn svc-clear" onClick={onClear}><i className="fa-solid fa-xmark"></i>清除條件</button>}
    </div>
  );
}

export function Field({ label, htmlFor, wide = false, children }) {
  return <div className={`svc-field ${wide ? "wide" : ""}`}><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

export function Pager({ data, page, onPage }) {
  if (!data?.total) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <footer className="svc-pager">
      <button type="button" className="svc-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}><i className="fa-solid fa-chevron-left"></i>上一頁</button>
      <span>第 {page} / {pages} 頁 · 共 {data.total} 筆</span>
      <button type="button" className="svc-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一頁<i className="fa-solid fa-chevron-right"></i></button>
    </footer>
  );
}

/** 申請的處理歷程 (時間軸) */
export function Timeline({ history = [], defaultOpen = false }) {
  if (!history.length) return null;
  return (
    <details className="svc-details" open={defaultOpen}>
      <summary><i className="fa-solid fa-chevron-right"></i>處理進度<span className="svc-count">{history.length}</span></summary>
      <ol className="svc-timeline">
        {history.map((event, index) => (
          <li key={index} className={`tone-${requestTones[event.status] || "muted"}`}>
            <div><strong>{requestStatuses[event.status] || event.status}</strong><time>{formatDateTime(event.at)}</time></div>
            {(event.comment || event.actor) && <p>{event.actor && <span>{event.actor}</span>}{event.comment}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
