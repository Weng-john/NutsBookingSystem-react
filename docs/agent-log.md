## terra — 2026-10-20

- 調整 `reservationManager.jsx`：報名管理預設顯示全部，科目／考場篩選皆提供「全部」，切換科目會清除考場條件，無結果時可一鍵清除篩選；側欄統計不再因預選條件而與清單不一致。
- 調整 `home.jsx` 與 `PublicExamDetails.jsx`：已報名場次導向「我的考試」，避免重複送出，場次詳情提供查看既有報名的 CTA。
- 調整 `myReserve.jsx`：付款證明限制 PNG/JPEG/WebP、5 MB，並在上傳期間鎖定關閉與輸入操作。
- 修正 `subjectManager.jsx` 的 Hook dependency lint 警告。`npm run lint`、`npm test`（46 項）與 `npm run build` 均通過；build 仍有既有 image 路徑 runtime-resolve 提示。

## sol — 2026-10-20

- GAS：修正同場次重複報名／改期、舊收款推估與部分付款調價、鎖內權限重查、中文錯誤分類及 Google 驗證暫時故障處理；初始化補上 Transaction.fileID。檔案：Main、Helpers.Auth／Response／Sheet、Routes.Reservation／Notification。
- 付款證明清理（Helper.Driver）改依交易檔案 ID 核對，預設只預覽，保留近期檔案、限制掃描量；未執行真實清理。
- src/api.js、config.js、features/booking/utils.js：請求有超時、進行中讀取合併、避免誤登出、不自動重試寫入；缺部署設定顯示中文提示；修正取消場次的匯出狀態與舊空白費用估算。
- tests/release-safety.test.mjs 新增 15 項回歸測試，並調整 booking-integrity／test-data 的 mock 與獨立改期目標；npm test 共 50 項、lint 零錯誤零警告、build 均通過，產物使用 /booking/。部署核對清單見 docs/booking-features.md。
- 待人工處理：GAS/* 目前被 Git 忽略，需另外保存並人工同步；正式 Google 驗收／部署、舊付款檔案權限與收款對帳未執行。三個既有 CSS 圖片路徑警告已請 luna 處理（docs/agent-requests.md）。
- 工作位置 D:\project\NutsReserve；未使用 GPU Server、未建立備份目的地。分支 main，HEAD 6c76ab8，變更未提交；沒有修改 Git 狀態、連線 Google 或發布。

## luna — 2026-10-20

- Added non-blocking success/info snackbars through `notify()`, plus reusable `ToastHost`, `Tooltip`, and `Breadcrumbs`; mounted the toast host and added accessible tooltips and wayfinding to shared/service UI.
- Updated `src/index.css` for shared primitives, contrast, reduced motion, and toast placement; removed the legacy white entry overlay and unresolved arrow/overlay image references. Files: `src/index.css`, `src/dialog.js`, `src/components/{ToastHost,Tooltip,Breadcrumbs}.jsx`, `src/components/header.jsx`, `src/layouts/Mainlayout.jsx`, `src/features/booking/ServiceUI.jsx`.
- Reviewed 15 routes in light/dark at 390/820/1366 using an offline local browser. Backend-disabled screens show empty/error states. Home CTA/title attributes and an 820px internal calendar overflow are handed to terra in `docs/agent-requests.md`. `npm test` (50), `npm run lint`, and `npm run build` pass. No external calls or commits.