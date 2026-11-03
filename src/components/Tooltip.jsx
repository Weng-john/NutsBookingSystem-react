import React, { cloneElement, useEffect, useId, useRef, useState } from "react";

/** 可由滑鼠、鍵盤焦點或觸控開啟的提示文字 */
export default function Tooltip({ children, content, side = "top" }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  const timerRef = useRef(null);
  const rootRef = useRef(null);
  const child = React.Children.only(children);
  const describedBy = [child.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");

  const clearTimer = () => window.clearTimeout(timerRef.current);
  const show = () => {
    clearTimer();
    setIsOpen(true);
  };
  const hide = () => {
    clearTimer();
    setIsOpen(false);
  };
  const showForTouch = () => {
    show();
    timerRef.current = window.setTimeout(hide, 2400);
  };
  const hideAfterBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hide();
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") hide();
  };

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <span
      ref={rootRef}
      className={`ui-tooltip ui-tooltip-${side} ${isOpen ? "is-open" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") show();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch" && !rootRef.current?.contains(document.activeElement)) hide();
      }}
      onFocusCapture={show}
      onBlurCapture={hideAfterBlur}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") showForTouch();
      }}
      onKeyDown={handleKeyDown}
    >
      {cloneElement(child, { "aria-describedby": describedBy })}
      <span id={tooltipId} className="ui-tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}
