import ReCAPTCHA from "react-google-recaptcha";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useOutletContext, useLocation } from "react-router-dom";
import { STORAGE_KEYS, SESSION_DURATION_MS, RECAPTCHA_SITE_KEY } from "../config";
import { fetchMeAPI, updateProfileAPI } from "../api";

export default function Account() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, globalLoading, setUser, setLoadingText, setGlobalLoading, setSubmit } = useOutletContext();

  const [captchaToken, setCaptchaToken] = useState("");
  const recaptchaRef = useRef(null);
  const alertShownRef = useRef(false);

  // --- 表單狀態 ---
  const [form, setForm] = useState({
    lastname: "",
    firstname: "",
    phoneNumber: "",
    email: "",
    picture: ""
  });

  const token = useMemo(() => localStorage.getItem(STORAGE_KEYS.TOKEN) || "", []);

  // 1. 處理來自跳轉的提示訊息 (僅顯示一次)
  useEffect(() => {
    if (location.state?.emptyPhoneNumber && !alertShownRef.current) {
      alertShownRef.current = true;
      
      if (location.state?.isNewUser) {
        alert("歡迎加入會員！\n\n請務必填寫正確的姓名與聯絡電話，\n以便後續進行考試預約與通知。");
      } else {
        alert("尚未填寫聯絡電話！\n請先填寫完成，以利後續考試報名。");
      }

      // 顯示完畢後淨化 location state
      setTimeout(() => window.history.replaceState({}, document.title), 0);
    }
  }, [location]);
  
  // 2. 檢查登入狀態與過期
  useEffect(() => {
    const lastActive = Number(localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE) || "0");
    if (!token || !lastActive || (Date.now() - lastActive > SESSION_DURATION_MS)) {
      setUser(null);
      alert(token ? "登入已逾時，請重新登入" : "請先登入");
      navigate("/login");
    }
  }, [token, navigate, setUser]);

  // 3. 讀取個人資料
  useEffect(() => {
    // 若 Context 已經有 user 資料，直接套用
    if (user?.email) {
      setForm(prev => ({ ...prev, ...user }));
      setGlobalLoading(false);
      return;
    }

    // 否則向後端請求
    let alive = true;
    const loadMe = async () => {
      setGlobalLoading(true);
      setLoadingText("載入個人資料中...");
      try {
        const data = await fetchMeAPI(token);
        if (alive) {
          setForm(prev => ({ ...prev, ...data.user }));
          setUser(data.user);
        }
      } catch (err) {
        console.error("載入個人資料失敗:", err);
      } finally {
        if (alive) setGlobalLoading(false);
      }
    };

    if (token) loadMe();
    return () => { alive = false; };
  }, [token, setUser, user, setGlobalLoading, setLoadingText]);

  // --- 互動與 API 核心邏輯 ---

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const executeUpdate = async (payload, loadingMsg, successMsg) => {
    if (!captchaToken) {
      alert("請先完成下方的「我不是機器人」驗證！");
      return;
    }

    setSubmit(true);
    setLoadingText(loadingMsg);
    setGlobalLoading(true);

    try {
      const data = await updateProfileAPI({
        idToken: token,
        captchaToken,
        ...payload
      });

      alert(successMsg);
      
      // 更新成功後，同步更新畫面與全域狀態
      if (data.user) {
        setForm(prev => ({ ...prev, ...data.user }));
        setUser(data.user);
      }
    } catch (err) {
      alert(`更新失敗：${err.message}`);
    } finally {
      setSubmit(false);
      setLoadingText("");
      setGlobalLoading(false);
      
      // 無論成功失敗都重置 ReCAPTCHA
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken("");
    }
  };

  const onUpdateSubmit = (e) => {
    e.preventDefault();
    executeUpdate(
      { lastname: form.lastname, firstname: form.firstname, phoneNumber: form.phoneNumber },
      "更新個人資料中...",
      "資料更新成功！"
    );
  };

  const onSyncPictureClick = () => {
    executeUpdate({}, "正在同步大頭照...", "大頭照同步成功！");
  };

  // --- 畫面渲染 ---

  if (globalLoading && !form.email) {
    return <div className="loading-container">載入會員資料中...</div>;
  }

  return (
    <div className="centered-form">
      <h1>會員資料修改</h1>
      
      <div className="info-area">
        {/* 大頭貼區塊 */}
        <div className="profile-pic-section">
          <img 
            src={form.picture || "https://via.placeholder.com/80"} 
            alt="Profile" 
            className="profile-pic" 
          />
          <button 
            type="button" 
            onClick={onSyncPictureClick} 
            className="btn-syncPicture"
          >
            同步 Google 大頭貼
          </button>
        </div>

        {/* 表單區塊 */}
        <form className="account" onSubmit={onUpdateSubmit}>
          <div className="form-group">
            <label>電子郵件 (不可修改)</label>
            <input type="email" name="email" value={form.email} disabled className="input-disabled" />
          </div>
          
          <div className="row-group">
            <div className="form-group">
              <label>姓 (Last Name) <span className="required-mark">*</span></label>
              <input type="text" name="lastname" value={form.lastname} onChange={handleFormChange} required />
            </div>
            <div className="form-group">
              <label>名 (First Name) <span className="required-mark">*</span></label>
              <input type="text" name="firstname" value={form.firstname} onChange={handleFormChange} required />
            </div>
          </div>

          <div className="form-group">
            <label>手機號碼 (Phone Number) <span className="required-mark">*</span></label>
            <input 
              type="tel" 
              name="phoneNumber" 
              value={form.phoneNumber} 
              onChange={handleFormChange} 
              placeholder="0912345678" 
              required // 👈 補上了這個防呆必填
            />
          </div>

          <div className="button-container">
            <div className="form-group captcha-group">
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={RECAPTCHA_SITE_KEY}
                onChange={(token) => setCaptchaToken(token)}
              />
            </div>
            <button type="button" className="cancel-button" onClick={() => navigate("/")}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              確定修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}