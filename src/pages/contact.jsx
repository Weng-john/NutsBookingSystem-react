import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { sendContactEmailAPI } from "../api";

export default function Contact() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setGlobalLoading, setLoadingText, setSubmit, requestCaptcha } = useOutletContext() || {};

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

    let token = "skip-captcha";
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
      alert("信件已成功送出！我們將會盡快處理。");
      navigate("/");
    } catch (error) {
      alert("發送信件失敗：" + error.message);
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

      <form onSubmit={handleSubmit} className="contact-form">
        <div className="contact-form-group">
          <label className="contact-form-label">主旨</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
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
            rows="8"
            className="contact-form-textarea"
            placeholder="請輸入信件內容..."
          />
        </div>

        <div className="text-center">
          <button
            type="submit"
            className="btn-confirm btn-contact-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "處理中..." : "確認送出"}
          </button>
        </div>
      </form>
    </div>
  );
}
