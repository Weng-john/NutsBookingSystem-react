import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import Header from "../components/header";
import Footer from "../components/footer";
import { STORAGE_KEYS, SESSION_DURATION_MS, RECAPTCHA_SITE_KEY, OAUTH_NONCE_KEY } from "../config"; // 新增導入 RECAPTCHA_SITE_KEY
import { loginAPI } from "../api";
import ReCAPTCHA from "react-google-recaptcha"; // 新增導入 ReCAPTCHA

// --- 靜態變數外提 (避免每次 Render 都重新建立) ---
const PATH_TO_PAGE = {
  "/": "index",
  "/account": "account",
  "/myReserve": "myReserve",
  "/login": "login",
  "/contact": "contact",
  "/roomManager": "roomManager",
  "/examManager": "examManager",
  "/memberManager": "memberManager",
  "/subjectManager": "subjectManager",
  "/reservationManager": "reservationManager",
};

// 取出 id_token (JWT) payload 中的 nonce；格式錯誤時回傳 null
function getTokenNonce(idToken) {
  try {
    const base64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).nonce ?? null;
  } catch {
    return null;
  }
}

// 獨立的 Auth 清除邏輯
function clearAuthData() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE);
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // --- UI 載入狀態 ---
  const [globalLoading, setGlobalLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isSubmit, setSubmit] = useState(false);

  // --- ReCAPTCHA 全域驗證狀態 ---
  const [captchaConfig, setCaptchaConfig] = useState({ isOpen: false, resolve: null });
  const [captchaToken, setCaptchaToken] = useState(null);

  // --- 使用者狀態初始化 ---
  const [user, setUserState] = useState(() => {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    const lastActiveStr = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE);

    if (!userStr || !lastActiveStr) return null;

    if (Date.now() - Number(lastActiveStr) > SESSION_DURATION_MS) {
      clearAuthData();
      return null;
    }

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  });

  // --- Auth 操作函式 ---
  const setUser = useCallback((newUser) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(Date.now()));
    } else {
      clearAuthData();
    }
  }, []);

  const clearAuthAndRedirect = useCallback(() => {
    setUser(null);
    navigate("/login");
  }, [setUser, navigate]);

  // --- 閒置追蹤邏輯 (效能優化版) ---
  const lastUpdateRef = useRef(Date.now());

  const updateActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 5000) {
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(now));
      lastUpdateRef.current = now;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "mousedown", "click", "scroll", "keydown"];
    events.forEach(event => window.addEventListener(event, updateActivity));
    return () => events.forEach(event => window.removeEventListener(event, updateActivity));
  }, [user, updateActivity]);

  useEffect(() => {
    if (!user) return;
    const intervalId = setInterval(() => {
      const lastActiveStr = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE);
      if (!lastActiveStr) return;

      if (Date.now() - Number(lastActiveStr) > SESSION_DURATION_MS) {
        alert("您已閒置過久，系統將自動登出");
        clearAuthAndRedirect();
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [user, clearAuthAndRedirect]);

  // --- OAuth 登入回呼邏輯 ---
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.substring(1));
    const idToken = params.get("id_token");
    if (!idToken) return;

    // 驗證 nonce：拒絕不是由本瀏覽器發起的登入 (防止偽造連結注入他人 Token)
    const expectedNonce = sessionStorage.getItem(OAUTH_NONCE_KEY);
    sessionStorage.removeItem(OAUTH_NONCE_KEY);
    if (!expectedNonce || getTokenNonce(idToken) !== expectedNonce) {
      window.history.replaceState(null, document.title, window.location.pathname);
      alert("登入驗證失敗，請重新登入");
      return;
    }

    const processLogin = async () => {
      try {
        setSubmit(true);
        setGlobalLoading(true);
        setLoadingText("登入中，請稍後...");

        window.history.replaceState(null, document.title, window.location.pathname);
        localStorage.setItem(STORAGE_KEYS.TOKEN, idToken);
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(Date.now()));

        const res = await loginAPI(idToken);

        setUser(res.user);

        const isMissingPhone = res.user.phoneNumber === "";
        if (res.isNew || isMissingPhone) {
          navigate("/account", { state: { isNewUser: res.isNew, emptyPhoneNumber: isMissingPhone } });
        } else {
          navigate("/");
        }

      } catch (err) {
        console.error("後端登入驗證失敗:", err);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
      } finally {
        setSubmit(false);
        setGlobalLoading(false);
        setLoadingText("");
      }
    };

    processLogin();
  }, [navigate, setUser]);

  // --- ReCAPTCHA 共用邏輯 ---
  // 回傳 Promise，由子元件 await 此函式
  const requestCaptcha = useCallback(() => {
    return new Promise((resolve) => {
      setCaptchaToken(null); // 開啟前清空舊 Token
      setCaptchaConfig({ isOpen: true, resolve });
    });
  }, []);

  const handleCaptchaSuccess = (token) => {
    setCaptchaToken(token); // 驗證成功時設定 Token，解鎖「確認送出」按鈕
  };

  const handleCaptchaConfirm = () => {
    if (captchaConfig.resolve && captchaToken) {
      captchaConfig.resolve(captchaToken); // 關閉彈窗並將 Token 回傳給呼叫方
    }
    closeCaptcha();
  };

  const handleCaptchaCancel = () => {
    if (captchaConfig.resolve) {
      captchaConfig.resolve(null); // 取消時回傳 null
    }
    closeCaptcha();
  };

  const closeCaptcha = () => {
    setCaptchaConfig({ isOpen: false, resolve: null });
    setCaptchaToken(null);
  };


  // --- 畫面渲染 ---
  const page = PATH_TO_PAGE[location.pathname] ?? "";

  return (
    <div className="layout-root">
      <Header user={user} page={page} setUser={setUser} />

      <div id="content">
        {/* 載入中遮罩 */}
        {globalLoading && (
          <div className={`loading-overlay ${isSubmit ? "submit-loading" : ""}`}>
            <div className="loading-spinner"></div>
            <span>{loadingText}</span>
          </div>
        )}

        {/* ReCAPTCHA 全域驗證視窗 */}
        {captchaConfig.isOpen && (
          <div className="modal-overlay recaptcha" onClick={handleCaptchaCancel}>
            <div className="modal-content captcha-modal" style={{ gap: "2rem" }} onClick={e => e.stopPropagation()}>
              <h3>請驗證您不是機器人</h3>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ReCAPTCHA
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={handleCaptchaSuccess}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={handleCaptchaCancel}
                >
                  取消
                </button>
                <button
                  className="btn-confirm"
                  disabled={!captchaToken}
                  onClick={handleCaptchaConfirm}
                >
                  確認送出
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 子路由出口 */}
        <Outlet
          context={{
            user,
            setUser,
            globalLoading,
            setGlobalLoading,
            setLoadingText,
            setSubmit,
            requestCaptcha // 提供給子元件調用的觸發函式
          }}
        />
      </div>

      <Footer />
    </div>
  );
}