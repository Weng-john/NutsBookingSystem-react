import React from "react";
import GoogleSignInButton from "../components/googleSignInButton.jsx";
import { GOOGLE_CLIENT_ID } from "../config";
import nutsLogo from "../assets/image/nuts.png";

export default function Login() {
  return (
    <div className="centered-form login-card">
      <img src={nutsLogo} alt="" className="login-logo" />
      <h1 className="loginH1">會員登入與註冊</h1>
      <p className="login-subtitle">使用 Google 帳號登入，首次登入將自動註冊</p>

      <div className="loginBTNArea">
        <GoogleSignInButton
          clientId={GOOGLE_CLIENT_ID}
        />
      </div>
    </div>
  );
}
