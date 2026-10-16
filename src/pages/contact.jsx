import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { sendContactEmailAPI } from "../api";
import { notify } from "../dialog";

export default function Contact() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext() || {};

  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 接收其他頁面傳遞過來的變數
  useEffect(() => {
    if (location.state) {
      if (location.state.subject) {
        setSubject(location.state.subject);
      }
      if (location.state.content) {
        setContent(location.state.content);
      }
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) { navigate("/login"); return; }
    if (!requestCaptcha) { notify("驗證服務尚未準備完成，請稍後重試。"); return; }
    let token;
    if (requestCaptcha) {
      token = await requestCaptcha();
      if (!token) return;
    }

    setIsSubmitting(true);
    if (setSubmit) setSubmit(true);
    if (setLoadingText) setLoadingText("正在發送信件...");
    if (setGlobalLoading) setGlobalLoading(true);

    try {
      await sendContactEmailAPI({ subject, content, token });
      notify("信件已排入發送佇列，我們將會盡快處理。");
      navigate("/");
    } catch (error) {
      notify("發送信件失敗：" + error.message);
    } finally {
      setIsSubmitting(false);
      if (setSubmit) setSubmit(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setLoadingText) setLoadingText("");
    }
  };

  return (
    <div className="centered-form">
      <h1 className="loginH1 contact-title">聯絡我們</h1>

      {!user && (
        <div className="exam-notice info">
          <i className="fa-solid fa-circle-info"></i>
          <span>請先<Link to="/login">登入</Link>，讓我們能以您的會員電子郵件回覆。</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="contact-form">
        <div className="contact-form-group">
          <label className="contact-form-label">主旨</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
            className="contact-form-input"
            placeholder="請輸入信件主旨"
          />
        </div>

        <div className="contact-form-group-mb2">
          <label className="contact-form-label">信件內容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            maxLength={5000}
            rows="8"
            className="contact-form-textarea"
            placeholder="請輸入信件內容..."
          />
        </div>

        <div className="text-center">
          <button
            type="submit"
            className="btn-confirm btn-contact-submit"
            disabled={isSubmitting || !user}
          >
            {isSubmitting ? "處理中..." : "確認送出"}
          </button>
        </div>
      </form>
    </div>
  );
}
