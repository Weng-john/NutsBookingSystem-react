import React from "react";
import GoogleSignInButton from "../components/googleSignInButton.jsx";
import { GOOGLE_CLIENT_ID } from "../config";

export default function Login() {
  return (
    <div className="centered-form">
      <h1 className="loginH1">會員登入與註冊</h1>

      <div className="loginBTNArea">
        <GoogleSignInButton
          clientId={GOOGLE_CLIENT_ID}
        />
      </div>
    </div>
  );
}