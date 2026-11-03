import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissToast, getToasts, subscribeToasts } from "../dialog";

const TONE_ICONS = {
  success: "fa-circle-check",
  warning: "fa-circle-exclamation",
  danger: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

export function Toast({ toast }) {
  const timerRef = useRef(null);
  const dismiss = useCallback(() => dismissToast(toast.id), [toast.id]);
  const duration = toast.duration ?? 5000;

  const pause = useCallback(() => window.clearTimeout(timerRef.current), []);
  const resume = useCallback(() => {
    pause();
    if (duration > 0) timerRef.current = window.setTimeout(dismiss, duration);
  }, [dismiss, duration, pause]);

  useEffect(() => {
    resume();
    return pause;
  }, [resume, pause]);

  const resumeAfterBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) resume();
  };

  return (
    <div
      className={`toast-card toast-${toast.tone}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resumeAfterBlur}
    >
      <span className="toast-icon" aria-hidden="true">
        <i className={`fa-solid ${TONE_ICONS[toast.tone] || TONE_ICONS.info}`}></i>
      </span>
      <div className="toast-copy">
        {toast.title && <strong>{toast.title}</strong>}
        <p>{toast.message}</p>
      </div>
      <button type="button" className="toast-dismiss" aria-label="關閉通知" onClick={dismiss}>
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  );
}

export default function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);
  if (!toasts.length) return null;

  return createPortal(
    <div className="toast-viewport">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} />)}
    </div>,
    document.body
  );
}
