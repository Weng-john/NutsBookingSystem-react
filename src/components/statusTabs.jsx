import React, { useCallback, useEffect, useRef, useState } from "react";

const IconChevron = ({ direction }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

/**
 * 狀態分頁 (「我的考試」「報名管理」左側的選單)。
 * 電腦版是直排選單；面板上下堆疊時是一列可橫向滑動的標籤。
 * 橫向時如果左邊或右邊還有沒顯示完的分頁，邊緣會出現漸層和箭頭按鈕提示。
 *
 * variant="chips" 是同樣的行為、換成圓角標籤的外觀 (「我的考試」清單上方的第二層分頁)：
 * 放得下時置中，太窄時變成一列可滑動的標籤，邊緣出現箭頭。
 *
 * props:
 *   tabs      [{ id, label, icon }]
 *   activeId  目前分頁的 id
 *   onSelect  (id) => void
 *   getCount  (tab) => 該分頁的筆數
 *   variant   "menu" (預設) 或 "chips"
 *   label     給螢幕閱讀器的名稱
 */
export default function StatusTabs({ tabs, activeId, onSelect, getCount, variant = "menu", label }) {
  const chips = variant === "chips";
  const stripRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // 兩側是否還有沒顯示完的分頁
  const updateEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const next = { left: strip.scrollLeft > 4, right: strip.scrollLeft < maxScroll - 4 };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  // 把目前分頁捲到標籤列中間。只捲標籤列本身 (scrollIntoView 會連外層頁面一起捲，畫面會跳)
  const centerActiveTab = useCallback((smooth) => {
    const strip = stripRef.current;
    const tab = strip?.querySelector(".active");
    if (!tab) return;
    const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    strip.addEventListener("scroll", updateEdges, { passive: true });
    strip.addEventListener("scrollend", updateEdges);
    // 寬度改變時 (例如轉向、縮放視窗) 重新置中並計算。ResizeObserver 開始觀察時就會觸發一次，等於初始計算
    const observer = new ResizeObserver(() => {
      centerActiveTab(false);
      updateEdges();
    });
    observer.observe(strip);

    return () => {
      strip.removeEventListener("scroll", updateEdges);
      strip.removeEventListener("scrollend", updateEdges);
      observer.disconnect();
    };
  }, [updateEdges, centerActiveTab]);

  // 切換分頁後，把目前分頁捲進可視範圍
  useEffect(() => {
    centerActiveTab(true);
    // 捲動事件通常會更新箭頭；位置沒變時不會有事件，所以下一個畫格再確認一次
    const frame = requestAnimationFrame(updateEdges);
    return () => cancelAnimationFrame(frame);
  }, [activeId, centerActiveTab, updateEdges]);

  const scrollByPage = (direction) => {
    const strip = stripRef.current;
    if (strip) strip.scrollBy({ left: direction * strip.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className={`status-tabs ${chips ? "chips-strip" : ""} ${edges.left ? "can-scroll-left" : ""} ${edges.right ? "can-scroll-right" : ""}`}>
      {/* 箭頭只是輔助 (用滑的或鍵盤 Tab 一樣能到每個分頁)，所以不放進鍵盤焦點順序 */}
      <button type="button" className="tabs-arrow left" tabIndex={-1} aria-hidden="true" onClick={() => scrollByPage(-1)}>
        <span><IconChevron direction="left" /></span>
      </button>

      <div className={chips ? "chips-track" : "status-vertical-menu"} ref={stripRef} role={chips ? "tablist" : undefined} aria-label={label}>
        {tabs.map((tab) => chips ? (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeId === tab.id}
            className={`svc-chip ${activeId === tab.id ? "active" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            <span className="svc-count">{getCount(tab)}</span>
          </button>
        ) : (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`tab-item-btn ${activeId === tab.id ? "active" : ""}`}
          >
            <span>
              <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
            </span>
            <span className="tab-count">{getCount(tab)}</span>
          </button>
        ))}
      </div>

      <button type="button" className="tabs-arrow right" tabIndex={-1} aria-hidden="true" onClick={() => scrollByPage(1)}>
        <span><IconChevron direction="right" /></span>
      </button>
    </div>
  );
}
