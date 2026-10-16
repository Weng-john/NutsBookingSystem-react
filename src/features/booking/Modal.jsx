import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.querySelector("button")?.focus();
    const handler = event => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", handler);
    return () => { dialog.removeEventListener("keydown", handler); previous?.focus(); };
  }, []);
  return createPortal(<div className="modal-overlay" onClick={onClose}>
    <div ref={ref} className="modal-content exam-form-modal svc-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <button type="button" className="modal-close" aria-label="關閉" onClick={onClose}>&times;</button>
      <h3>{title}</h3>{children}
    </div>
  </div>, document.body);
}
