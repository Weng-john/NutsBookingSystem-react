import React from "react";

export default function Footer() {
  // 自動取得當前年份，不用每年手動改程式碼
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer">
      {/* Social Icons */}
      <ul className="icons">
        <li>
          <a 
            href="https://www.facebook.com/nuts.inst/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="icon brands fa-facebook-f"
            aria-label="Facebook"
          >
            <span className="label">Facebook</span>
          </a>
        </li>
        <li>
          {/* 補上真實的 IG 連結 */}
          <a 
            href="#" 
            target="_blank" 
            rel="noopener noreferrer"
            className="icon brands fa-instagram"
            aria-label="Instagram"
          >
            <span className="label">Instagram</span>
          </a>
        </li>
        <li>
          {/* 補上真實的 LinkedIn 連結 */}
          <a 
            href="#" 
            target="_blank" 
            rel="noopener noreferrer"
            className="icon brands fa-linkedin-in"
            aria-label="LinkedIn"
          >
            <span className="label">LinkedIn</span>
          </a>
        </li>
      </ul>

      {/* Menu / Copyright */}
      <ul className="menu">
        <li>聯絡電話: (03) 6686917</li>
        <li>&copy; {currentYear} 核果資訊學苑. All rights reserved.</li>
        <li>Design: Weng-john</li>
      </ul>
    </footer>
  );
}