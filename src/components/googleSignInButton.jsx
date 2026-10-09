import React from "react";
import { REDIRECT_URI, OAUTH_NONCE_KEY } from "../config";

export default function GoogleSignInButton({ clientId, disabled }) {

  const handleClick = () => {
    if (disabled || !clientId) return;

    // ✨ 直接進行跳轉，避開彈窗冷卻與瀏覽器阻擋機制
    const redirectUri = encodeURIComponent(REDIRECT_URI);

    // 使用更安全的 crypto API 產生 Nonce
    const nonce = window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2);
    // 暫存 nonce，回到本站時用來比對 id_token，確認是本次由使用者自己發起的登入
    sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);

    // 組合標準 OAuth 2.0 跳轉網址 (Implicit Flow)
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=id_token&scope=email%20profile%20openid&prompt=select_account&nonce=${nonce}`;

    // 執行跳轉
    window.location.href = oauthUrl;
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="google-custom-btn"
      type="button"
    >
      <img
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
        alt="Google Logo"
      />
      <span>使用 Google 帳號登入</span>
    </button>
  );
}