import React, { useState, useEffect, useRef } from "react";
import { NavLink, Link } from "react-router-dom";
import nutsLogo from "../assets/image/nuts.png";
import { STORAGE_KEYS } from "../config";
import { logoutUser } from "../api";

// --- SVG 圖示元件 ---
const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
);
const IconSun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
);
const IconMoon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const IconUserPlaceholder = () => (
  <svg
    width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    className="icon-user-placeholder"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);


export default function Header({ user, page }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false); // 手機/平板的漢堡選單
  const [imgError, setImgError] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const menuRef = useRef(null);
  const headerRef = useRef(null);

  const activeClass = ({ isActive }) => (isActive ? "dark-background" : undefined);

  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = (e) => {
    e.stopPropagation();
    setTheme(theme === "light" ? "dark" : "light");
  };

  // --- 權限判斷外提 ---
  const isAdmin = user?.role === "admin";
  const isTeacherOrAdmin = user?.role === "teacher" || isAdmin;
  const showAvatarImage = user?.picture?.trim() && !imgError;

  // 點擊外部關閉選單
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setIsNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const logout = () => {
    // 關閉選單
    setIsMenuOpen(false);
    // 呼叫 api.js 的統一登出 (預設 isAutoLogout 為 false，會跳 confirm)
    logoutUser();
  };

  const handleLinkClick = () => setIsMenuOpen(false);

  // 點擊導覽列中的任一連結後收合漢堡選單
  const handleNavClick = (e) => {
    if (e.target.closest("a")) setIsNavOpen(false);
  };

  return (
    <header id="header" ref={headerRef}>
      <div className="inner">

        {/* 左側 Logo */}
        <div className="left">
          <h2>
            <Link to="/" className="logo">
              <img src={nutsLogo} alt="Logo" className="logoIMG" />
              核果資訊學苑預約報名系統
            </Link>
          </h2>
        </div>

        {/* 漢堡選單按鈕 (僅在手機/平板顯示) */}
        <button
          type="button"
          className="nav-toggle"
          aria-label={isNavOpen ? "關閉選單" : "開啟選單"}
          aria-expanded={isNavOpen}
          onClick={() => setIsNavOpen(!isNavOpen)}
        >
          <i className={`fa-solid ${isNavOpen ? "fa-xmark" : "fa-bars"}`}></i>
        </button>

        {/* 右側導覽列 */}
        <div className={`right ${isNavOpen ? "open" : ""}`}>
          <ul onClick={handleNavClick}>
            {page !== "index" && (
              <li><NavLink to="/" className={activeClass}>首頁</NavLink></li>
            )}

            {user ? (
              <>
                {/* 權限導向的按鈕 */}
                {isTeacherOrAdmin && (
                  <>
                    <li><NavLink to="/subjectManager" className={activeClass}>科目管理</NavLink></li>
                    <li><NavLink to="/examManager" className={activeClass}>考試管理</NavLink></li>
                    <li><NavLink to="/roomManager" className={activeClass}>考場管理</NavLink></li>
                  </>
                )}
                {isAdmin && (
                  <>
                    <li><NavLink to="/memberManager" className={activeClass}>會員管理</NavLink></li>
                    <li><NavLink to="/reservationManager" className={activeClass}>報名管理</NavLink></li>
                  </>
                )}

                <li><NavLink to="/myReserve" className={activeClass}>我的考試</NavLink></li>

                {/* --- 大頭貼與懸浮選單 --- */}
                <li ref={menuRef} className="user-menu-li">
                  <div
                    className={`user-menu-btn ${isMenuOpen ? 'active' : ''}`}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    title="使用者選單"
                  >
                    {showAvatarImage ? (
                      <img
                        src={user.picture}
                        alt="avatar"
                        className="user-avatar"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <IconUserPlaceholder />
                    )}
                  </div>

                  {isMenuOpen && (
                    <div className="dropdown-menu">
                      <Link to="/account" className="menu-item" onClick={handleLinkClick}>
                        <span className="menu-icon"><IconUser /></span>
                        <span>我的資料</span>
                      </Link>

                      <Link to="/myReserve" className="menu-item" onClick={handleLinkClick}>
                        <span className="menu-icon"><IconCalendar /></span>
                        <span>我的考試</span>
                      </Link>

                      <Link to="/contact" className="menu-item" onClick={handleLinkClick}>
                        <span className="menu-icon"><IconMail /></span>
                        <span>聯絡我們</span>
                      </Link>

                      {/* <div className="menu-divider"></div>

                      <div className="menu-item theme-toggle-item" onClick={toggleTheme}>
                        <span className="menu-icon">
                          {theme === 'light' ? <IconSun /> : <IconMoon />}
                        </span>
                        <span>{theme === 'light' ? '淺色模式' : '深色模式'}</span>
                        <div className={`theme-switch ${theme}`}>
                          <div className="switch-handle"></div>
                        </div>
                      </div> */}

                      <div className="menu-divider"></div>

                      <div className="menu-item logout" onClick={logout}>
                        <span className="menu-icon"><IconLogout /></span>
                        <span>登出</span>
                      </div>
                    </div>
                  )}
                </li>
              </>
            ) : (
              page !== "login" && (
                <li>
                  <NavLink to="/login" className="btn">登入 / 註冊</NavLink>
                </li>
              )
            )}
          </ul>
        </div>
      </div>
    </header>
  );
}