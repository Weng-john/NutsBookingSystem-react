# 報名功能與 GAS 整合交付紀錄

本次修改限於 `D:\project\NutsReserve`，未部署前端或 GAS、未執行正式資料操作、未寄送真實郵件，也未提交、合併或推送 Git。工作分支為 `main`；開始時工作區已有其他協作者的修改，這些修改保留。本次沒有編輯 CSS。

## 已實作的七項功能

| 功能 | 使用方式 | 後端與處理方式 |
| --- | --- | --- |
| 取消／改期／退費 | 我的考試 → 點選報名 → 報名詳細資訊 | 取消（未繳費）與改期立即生效；已繳費的取消走退費申請，管理員在「報名管理 → 退費申請」分頁處理，以版本號防止覆寫。紀錄存在 ReservationRequests |
| 自動通知與提醒 | 通知中心、個人提醒偏好；管理員通知管理 | 審核及場次異動寫入佇列；排程產生繳費與考前提醒，寄送結果與失敗重試可查 |
| 須知與 FAQ | 頁尾及場次詳細資訊 → 考試須知 | 公開 getExamGuidelines；可搜尋及按分類篩選。正式證件、報到、申請期限、退費比例仍待學苑填入 |
| 名單匯出與統計 | 管理員 → 名單匯出與統計 | 可按考試日期、場次、科目、考場、狀態篩選；顯示人數、待審、收款、未收、退費及淨收款；匯出篩選名單 CSV |
| 行事曆與確認單 | 我的考試 → 點選報名 → 報名詳細資訊 | Google 行事曆連結、Apple／其他日曆使用的 ICS；列印確認單並以瀏覽器另存 PDF，確認單不代表已付款 |
| 管理操作紀錄 | 管理員 → 管理操作紀錄 | 審核、退件、申請處理、修改、會員權限及管理資料異動留下操作者、時間、修改前後及說明 |
| 公開完整場次資訊 | 首頁點擊場次即可查看 | 公開安全欄位，不傳會員名單；報名時要求登入，登入及補完會員資料後重新查詢場次再接續 |

新增元件集中在 `src/features/booking/`，GAS 新功能已依主題併入原有檔案（設定在 `Config.gs`、共用工具在 `Helpers.*.gs`、各路由在對應的 `Routes.*.gs`／`Route.Transaction.gs`），原有路由保留名稱。

## 啟用順序（由部署者在 Google 端操作）

1. 備份現有試算表與 Apps Script，將本次 **全部 GAS 檔案** 同步到同一專案；只同步新增檔案會缺少路由、欄位及安全修正。保留該環境正確的 Spreadsheet、Google OAuth client、付款證明 folder、管理員聯絡設定。
2. 在 Script Properties 設定 `RECAPTCHA_SECRET_KEY`。原始碼原先存在硬編碼 secret，已改為屬性讀取；請在 reCAPTCHA 管理介面更換原 secret，再設定新值。不要把 secret 放回原始碼或前端環境變數。
3. 設定 Script Property `PAYMENT_INSTRUCTIONS` 為正式付款資訊，例如銀行代碼、戶名、帳號、付款說明。尚未設定時，畫面要求考生向學苑取得資訊，沒有示範銀行帳號。
4. 確認付款證明資料夾為私人存取，只保留必要的部署者及授權同仁。新上傳檔案使用 PRIVATE 權限，透過有身分／資料所有權檢查的 API 查看。PRIVATE 的分享設定仍可能保留個別受邀者；需一併核對資料夾與檔案成員。[Google Drive 分享權限文件](https://developers.google.com/apps-script/reference/drive/permission)。
5. 在 Apps Script 編輯器手動執行 `initializeBookingFeatures()`，核對新增表與原表欄位。它只在既有欄位後追加新欄位；遇到欄位順序不符會中止，不會重排原資料。正式資料不要執行 `testData.gs` 的造資料／重設工具。
6. 核對 `GAS/Config.gs`「報名服務」區塊的 FAQ、加購費用及截止日設定。未設定個別場次截止日時沿用考前三天；前端既有加購費用設定也應保持一致。申請核准由管理員依正式規則處理，程式沒有自行制定退費比例。
7. 由 **部署者帳號** 在編輯器執行 `installBookingNotificationTrigger()`，授權 Sheets、Drive、Mail 所需範圍。安裝每 15 分鐘執行的 `runBookingNotifications`；同一帳號重跑不重複安裝。它不是公開 API，不會因開啟前端自行安裝。
8. 在觸發條件管理頁檢查其他帳號是否也安裝過相同排程。`getProjectTriggers()` 只列目前帳號的觸發條件；可安裝觸發條件依建立者授權執行，並受 Google 配額影響。通知管理頁的排程狀態也只代表執行帳號可見的觸發條件。[Apps Script 安裝型觸發條件文件](https://developers.google.com/apps-script/guides/triggers/installable)。
9. 手動更新 Web App 部署版本，確認前端環境指向正確的 GAS `/exec`，再部署匹配的前端版本。前端新 API 不支援未更新的舊 GAS 部署。
10. 使用測試用會員及測試場次做一次實際登入、報名、退件、付款、改期、取消、退費、通知、私人證明查看與 CSV／行事曆／確認單驗收；驗證角色及手機畫面。本次沒有操作正式 Google 部署。

原始碼未見原有定期繳費／考前提醒排程；Google 端是否已另設觸發條件，仍需部署者查看。本次佇列也承接原本手動寄信流程；未安裝新排程時，手動聯絡／提醒只會排入佇列。

## 狀態與金額

- 申請：`pending → processing / approved / rejected`、`processing → approved / rejected`、`approved → completed / rejected`。考生只能撤回 pending，版本不符必須重新整理。
- 核准申請不會立即變更報名。完成取消才釋出名額；完成改期在鎖內重新檢查同科目、截止日及容量，再移轉一個名額。
- 取消已付款報名不會自動退款，仍需退費申請。完成退費須填實際退款憑證／交易編號，累計不得超過已確認付款，並取消原報名。系統登記退款結果，沒有對銀行或金流發起轉帳。
- 有待審付款時不能完成取消、改期或退費，需先核對該筆款項。改期目標費用低於已付款時會中止，要求先處理財務問題。
- 報名保存基本費、加購費、應付金額快照，後續場次調價不改動原報名金額。付款證明的預期金額不是收款憑證；管理員必須輸入實際核對金額。部分付款保留未付餘額，可以再上傳另一筆證明。
- 新資料的 `paidAmount` 是累計實際確認收款，`refundedAmount` 是累計退款，淨收款為兩者差額。已取消報名不再列入有效應收／未收，已收及已退仍保留。
- 舊資料缺少 `amountDue` 時報表標示金額推估。舊已付款資料不能直接以推估金額核准退款；部署者須按原始收款證明及交易紀錄，人工核對並填入 `baseFee`、`additionalFee`、`amountDue`、`paidAmount`、`refundedAmount` 後再處理。舊未付款資料提交證明時固定當時費用快照。初始化不會自行把推估值寫成實際收款。

新增表為 `ReservationRequests`、`AuditLog`、`Notifications`、`NotificationPreferences`。原表追加：

| 原表 | 追加欄位 |
| --- | --- |
| Reserved | reservationStatus, baseFee, additionalFee, amountDue, paidAmount, refundedAmount, paymentDeadline, version, submissionKey, attendance, score, examResult, resultNote, resultUpdatedAt |
| Exam | registrationDeadline, paymentDeadline |
| Transaction | fileID |

## 前後端對接檢查及安全修正

| 發現／風險 | 本次處理 |
| --- | --- |
| 會員、科目、報名 API 的回傳包裝讀取不一致 | 修正 adapters，並以實際 GAS handler 的 mock 回應驗證 |
| 前端取得驗證碼但會員／科目操作 API 未傳入 | 接上 captchaToken；每次請求只消耗一次 reCAPTCHA，避免外層與舊路由重複驗證 |
| 用戶可偽造前端角色或 `_user` | 入口刪除 caller `_user`，用 Google token 與 Users 資料決定權限；部分高權限操作在取得鎖後再次核對 |
| Token 快取可能超過有效期限、帳號刪除後仍呼叫 API | 快取與未快取均查 exp、aud、iss、sub、已驗證 email；SHA-256 快取鍵與受剩餘效期限制的 TTL；GoogleSub 不符／Users 不存在則拒絕 |
| 公開場次及其他會員個資的邊界 | 公開場次採欄位白名單；我的報名、申請、通知、付款證明核對所有權；名單匯出、完整收款資料、紀錄及排程管理限 admin |
| 付款證明用公開 Drive 連結 | 新檔私人保存；證明 API 不接受任意 caller fileID；限定 JPEG／PNG／WebP，檢查 MIME、檔頭與 5 MB 上限，先查所有權再建立檔案 |
| 付款證明、費用、退款資料混用 | 實際收款人工核對；快照及累計欄位；退款上限與憑證必填；禁止對已取消場次繼續上傳付款證明 |
| 超額報名、改期同時修改、重送 | Script lock 保護名額及寫入；submissionKey 去重、申請版本檢查；全案寫入失敗時用暫存日誌復原涉及的表 |
| 寫入一半失敗留下無交易的付款證明 | 復原交易／報名列，僅把該次新建檔案移到垃圾桶；清理失敗留下部署者可核對的紀錄 |
| 刪除場次／科目／考場破壞歷史，刪除會員留下財務孤兒 | 已有報名場次需改為取消；有場次的科目／考場不能刪除；會員有財務、待審付款、有效報名或未結案申請時中止自動刪除；保護最後一位管理員 |
| 初次退件沒記原因、已通過報名被直接退件 | 修正初次退件紀錄；已通過報名須透過申請流程處理 |
| GAS／CSV／列印內容注入 | 寫入外部文字及復原資料時處理公式前綴；CSV 加 BOM、引號逸出及公式前綴防護，電話保留前導零；確認單逸出 HTML |
| Debug 洩漏 token、證明或收款資料 | 遞迴過濾敏感欄位、限制日誌長度；錯誤回應不含 stack；AuditLog 只存必要欄位，不存原始付款圖片或 refundDetails |
| 長時間寄信占住報名鎖、過期提醒 | 每封訊息間釋放鎖；上限每次 25 封／約四分鐘與每日配額；寄送前再查即時狀態／偏好；失敗最多自動嘗試三次，可由管理員重新排入 |
| 聯絡信件濫用 | 要求登入及 captcha，限制主旨／內容長度，同內容去重，每會員每小時最多五封 |
| 日期重複附加時區、資料串接多次全表搜尋 | 新增／更新場次統一台北時間，檢查狀態／費用／關聯；用索引合併報名資料，先按本人 email 篩選，快取單次執行的 Spreadsheet／Sheet |

## 新 API 合約

全部沿用 `{ ok, message, data }` 成功包裝；失敗為 `{ ok: false, error, code }`。除公開須知外，前端傳 `idToken`，後端會以 Users 即時權限判斷。修改申請及管理設定傳 `captchaToken`。

| Route | 權限 | 主要資料 |
| --- | --- | --- |
| getExamGuidelines | 公開 | `data.items` |
| submitReservationRequest | 本人 | reserveID, type, reason, targetExamID?, refundDetails?, submissionKey, captchaToken；回傳 `data.request` |
| getMyReservationRequests | 本人 | `data.items`；收款資料遮罩 |
| withdrawReservationRequest | 本人 | requestID, version, captchaToken |
| getReservationRequestsAdmin | admin | status?, type?, query?, page?, pageSize?；`items, total, page, pageSize` |
| processReservationRequest | admin | requestID, version, status, comment, approvedAmount?, refundReference?, captchaToken |
| getReservationReport | admin | from?, to?, examID?, subjectID?, roomID?, status?；`items, summary, groups, options` |
| getAuditLogs | admin | entityID?, actor?, action?, from?, to?, page?, pageSize? |
| getMyNotifications / markNotificationRead | 本人 | 通知列表／notificationID；不得操作他人通知 |
| getNotificationPreferences / updateNotificationPreferences | 本人 | `preferences: { paymentReminder, examReminder }` |
| getNotificationRules / updateNotificationRules | admin | `rules: { paymentReminder, paymentHours, examReminder, examHours }`；修改需 captchaToken；小時範圍 1–720 |
| getNotificationDeliveryLogs / retryNotification | admin | status?, page?／notificationID, captchaToken；僅 failed 可重排 |
| getPaymentProof | 本人或 admin／teacher | reserveID；回傳 `data.dataUrl`，不傳公開圖片網址 |

原有審核 `updateReservationStatus` 核准付款時新增必填 `confirmedAmount`。`deleteMe` 現在也要求 captchaToken；前端 API 已接受此參數。其他既有 routes 名稱保留。

## 整併與介面調整（2026-10-10）

### GAS 檔案整併

原本的 `GAS/Booking.*.gs` 八個檔案已併入既有檔案並刪除。函式內容沒有改寫，只是搬移；原有路由改為直接放實作（不再是一行轉呼叫）。

| 原檔案 | 併入位置 |
| --- | --- |
| Booking.Config.gs | `Config.gs`「報名服務：費用、申請、稽核與通知」區塊 |
| Booking.Helpers.gs | 身分與權限 → `Helpers.Auth.gs`；鎖定、復原、資料列工具、`initializeBookingFeatures` → `Helpers.Sheet.gs`；稽核紀錄 → `Helpers.Debug.gs`；金額與報名明細 → `Routes.Reservation.gs`；場次截止時間 → `Routes.Exam.gs` |
| Booking.Security.gs | `bookingLegacyRoute_` → `Main.gs`；付款證明讀取 → `Route.Transaction.gs`（`getPaymentProofRoute_`）；日誌遮罩 → `Helpers.Debug.gs` |
| Booking.Exams.gs | `Routes.Exam.gs`（`getExamsRoute_`、`updateExamRoute_`） |
| Booking.Reservations.gs | `Routes.Reservation.gs`（`submitReservationRoute_`、`updateReservationRoute_`、`updateReservationStatusRoute_`、`getReservationReportRoute_`） |
| Booking.Requests.gs | `Routes.Reservation.gs`「取消／改期／退費申請」區塊 |
| Booking.Payments.gs | 上傳證明 → `Route.Transaction.gs`（`submitPaymentProofRoute_`）；手動信件 → `Routes.Notification.gs` |
| Booking.Notifications.gs | `Routes.Notification.gs`「通知中心與提醒設定」「排程寄送」區塊 |

貼到 Apps Script 專案時，請把舊的 `Booking.*` 檔案一併刪除，否則同名函式會重複宣告。

### 後端的小幅補強

- `getMyReservationRequests`／`getReservationRequestsAdmin` 的每筆申請多一個 `context`：考生姓名、科目、原場次時間與考場、目標場次時間與考場、應付／已付／已退金額，清單不必只顯示編號。
- `getMyReservationsWithDetails`／`getAllReservationsAdmin` 的每筆報名多一個 `openRequest`（`{ type, status }` 或 `null`），前端用來說明為什麼不能再提出新申請。
- 通知信內容改成給人看的格式：時間為 `yyyy/MM/dd HH:mm`（原本是 ISO 字串）、申請與場次狀態為中文（原本會出現 `approved`、`Open`）、提醒信主旨用科目名稱（原本是報名序號）。去重用的鍵值沒有變。
- 聯絡信與管理員寄信的稽核紀錄，對象類型由 `reservation` 改為 `recipient`（對象其實是收件人信箱）。

### 前端介面

- 共用元件在 `src/features/booking/ServiceUI.jsx`（分頁列、頁面外框、篩選列、分頁、狀態標籤、開關、時間軸），樣式集中在 `src/index.css` 第 13 節，只使用既有的顏色變數，深色模式自動適用。
- 入口：見下方「流程簡化」。沒有頁面之間的切換列；各頁從導覽列或右上角使用者選單進入。
- 各頁填滿可用高度，只有內容區捲動；手機上篩選條件可收合、分頁列與篩選按鈕可左右滑動。
- 通知展開時自動標為已讀；報名確認單改為可列印的版面。

### 已用瀏覽器走過的流程

以種子資料（10 筆報名、6 件申請、23 則通知、41 筆稽核，全部經由真正的路由建立）驗證：各頁讀取與顯示、送出取消申請（成功與「已有未結案申請」被拒絕兩種情況）、撤回申請、管理員推進申請狀態、切換提醒偏好、展開通知標為已讀、儲存提醒規則、重新排入失敗通知、場次詳細資訊、報名服務視窗；並檢查了桌機、平板、手機寬度與深色模式。

沒有實際操作到的部分：Google 行事曆與列印視窗的開啟（需要彈出視窗）、CSV 下載的檔案內容（由單元測試涵蓋格式）、付款證明圖片的顯示、改期與退費申請的送出（後端有測試涵蓋）、真實的 reCAPTCHA 與 Google 登入。

## 流程簡化（2026-10-10）

### 取消、改期、退費

| 情況 | 行為 |
| --- | --- |
| 取消，尚未有確認的款項 | 立即生效：報名改為已取消、名額釋出，寄出確認通知 |
| 改期 | 立即生效：新場次需為相同科目、開放報名、未過報名截止且有名額；名額同時移轉，應付金額改為新場次費用加原本的加購。新費用高於已付金額時狀態回到待繳費；低於已付金額時拒絕，需由管理員處理 |
| 取消，已有確認的款項 | 不能直接取消，改為退費申請（待審核 → 核准金額 → 登記退款憑證並完成）。完成時才取消報名並釋出名額 |
| 繳費證明審核中 | 審核完成前不能改期或取消 |
| 考試已開始 | 不能再取消或改期（退費申請不受此限） |

立即生效的取消與改期仍會在 ReservationRequests 留下一筆「已完成」的紀錄，並寫入操作紀錄。`submitReservationRequest` 的回傳多一個 `executed`（是否已立即生效）。「考試開始後不能取消或改期」是目前程式採用的界線，學苑若要更早截止（例如報名截止後就不能取消），需要再調整。

### 頁面與入口

- **我的考試**：點選任一筆報名開啟「報名詳細資訊」，狀態與下一步（修改資料／上傳繳費證明）、報名內容、行事曆與確認單、改期、取消或退費、退費進度都在同一個視窗。原本的「報名服務」按鈕與「我的申請」頁面已移除。
- **報名管理**：左側多一個「退費申請」分頁（只有管理員看得到），點選報名即可處理退費。原本的「申請管理」頁面已移除。這個分頁不套用科目／考場／日期的欄位篩選，也不受開考時間限制。
- **通知中心**、**名單與統計**、**操作紀錄**、**通知管理**：各自獨立一頁，從右上角使用者選單進入（後三項只有管理員看得到）。
- **考試須知**：使用者選單、頁尾，以及未登入時的導覽列。首頁月曆與「我的考試」不再放連結。

### 「我的考試」的分頁與考試成績

左側的進度查詢由八個狀態收成四組，細部狀態看每筆報名上的標籤（規則在 `src/features/booking/utils.js` 的 `reservationGroup`）：

| 分頁 | 內容 |
| --- | --- |
| 待處理 | 未繳費、報名審核不通過、付款審核未通過，以及場次被取消但款項尚未退還的報名 |
| 審核中 | 報名審核中、繳費審核中 |
| 已完成報名 | 已繳費、尚未開考 |
| 歷史紀錄 | 已應考（已繳費且考試已開始，顯示成績）、缺考、已取消、已過期（未完成審核或繳費） |

「待處理」「審核中」「歷史紀錄」底下還有第二層分頁，一個狀態一個（未繳費／付款審核未通過／報名審核不通過；報名審核中／繳費審核中；已應考／缺考／已取消／已過期），各自顯示筆數，進入時停在第一個有項目的。定義在 `src/config.js` 的 `reserveGroups[].statuses`。

成績由管理員或老師在「報名管理 → 成績登記」分頁登記：出席或缺考、分數（0–1000，可先不填）、通過／未通過、給考生的備註，登記後可以再修改。只有已繳費、未取消且考試已開始的報名可以登記。填了分數或結果時，考生會收到「成績公布」通知（信件不含分數）。

- 新路由 `setReservationResult`（admin／teacher，需 captchaToken）：`reserveID, attendance, score?, result?, note?`。
- Reserved 工作表在最後追加五個欄位：`attendance, score, examResult, resultNote, resultUpdatedAt`。部署後第一次讀寫時會自動補上表頭，也可以先手動執行 `initializeBookingFeatures()`。
- 「成績登記」分頁和其他分頁一樣會套用表頭的科目／考場篩選（預設選第一個科目），所以清單筆數可能少於分頁上的數字。

### API 的變動

- `getMyReservationsWithDetails`／`getAllReservationsAdmin` 的每筆報名附上最近一件申請 `request`（取代先前的 `openRequest`）。退款帳戶只在管理員呼叫 `getAllReservationsAdmin` 時回傳，考生與老師拿到的是遮罩後的內容。
- `getMyReservationRequests`、`getReservationRequestsAdmin` 兩條路由仍在後端，但前端已不再使用。

## 驗證結果與限制

- `npm test`：截至 2026-10-20 共 50 項通過，涵蓋完整 GAS 語法載入與路由對照、API adapters、所有權、角色、重送、容量衝突、成功改期、版本、部分付款、退款、寫入失敗復原、私人證明、舊金額處理、提醒去重／狀態重查、單次 captcha、追加欄位、匯出逸出。
- `npm run build`：通過。既有 CSS 的 `image/arrow.svg`、`image/dark-arrow.svg`、`image/overlay.png` 有資產解析警告，報名服務各頁的樣式在 `src/index.css` 第 13 節。
- `npm run lint`：2026-10-20 驗證零錯誤、零警告（terra 已修正 subjectManager 的 dependency）。
- `npm audit --json`：前次紀錄為零已知套件弱點（共 211 項相依項目）；本輪沒有連線重查，不能視為目前弱點資料庫結果。
- 測試以 Node VM 模擬 Sheets、Drive、Google token/captcha、Mail 與排程，沒有連正式 Google API。瀏覽器驗收是把同一套測試 harness 包成本機 HTTP 服務、讓前端實際接上 GAS 程式後以無頭 Chrome 操作（見下方「整併與介面調整」），仍然沒有連正式 Google API，也沒有在實體手機上測試。

仍需部署者處理的資料安全事項：

1. **既有公開付款檔案未自動撤銷分享**。新程式不會把舊公開檔案改成私人；請人工盤點付款資料夾及舊連結的權限，撤銷不必要的分享並驗證新證明 API 可讀取。原本網址已被第三方保存的副本無法由此程式收回。
2. **Google token 仍保存在 localStorage**，有 XSS 時可能被竊取。此部署架構未新增 HttpOnly cookie／伺服器 session；如改成正式驗證服務，應重新規劃憑證保存與撤銷。
3. **Google 驗證仍使用既有 tokeninfo 架構**，雖已增加 claim、有效期及帳號一致性檢查，正式規模應改用支援簽章驗證的驗證服務。Google 文件建議正式環境使用驗證函式庫，tokeninfo 適合開發診斷。[Google ID token 驗證文件](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)。
4. **Sheets 不是具備持久交易的資料庫**。寫入失敗有補償，但執行程序突然終止、復原本身失敗、人工直接修改試算表，仍需人工對帳。付款檔案建立與 Sheet 寫入也不是原子交易。大量資料時全表讀取、暫存復原及 Script lock 可能碰到執行時間限制，應搬到資料庫。[Apps Script LockService 文件](https://developers.google.com/apps-script/reference/lock/lock-service)。
5. **郵件不能保證恰好一次**。寄出後若程序在標記 sent 前終止，下次可能再次寄出；佇列去重及鎖只能降低重複，無法消除外部寄信與資料落地之間的空隙。須留意部署者 Mail 配額、寄信失敗紀錄及可能的延遲。
6. **審計表仍可被試算表擁有者／編輯者修改**，不是防竄改保存系統；本次記錄成功的業務異動，拒絕／失敗紀錄由 Debug 記錄。個資、收款資料、證明及紀錄的保存期限、分享成員、備份與刪除規則仍由學苑訂定。
7. 行事曆匯出是資訊快照，不是同步訂閱。ICS 採 UTC、穩定 UID、CRLF、文字逸出與 75 UTF-8 byte 行折疊；收到異動請人工更新行事曆。[RFC 5545](https://www.rfc-editor.org/info/rfc5545/)。

正式上線前請先完成上述 Google 端設定與測試環境驗收。

## 發布前核對清單（sol，2026-10-20）

本輪只修改本機程式並以模擬服務驗證；沒有連線 Google、執行正式造資料、上傳、寄信或部署。

- [ ] 先保存完整試算表、Apps Script 與現行部署版本。**目前 `GAS/*` 被現有 `.gitignore` 忽略**，一般 Git 差異／提交不會包含後端修正；請另外保存整個 GAS 目錄並由部署者人工核對，勿只依前端 Git 版本判斷後端是否已更新。
- [ ] 核對 `GAS/Config.gs` 的試算表 ID、私人付款證明資料夾 ID、OAuth client ID 與管理員信箱。前後端 OAuth client 必須一致。
- [ ] Script Properties 設定已輪替的 `RECAPTCHA_SECRET_KEY` 與正式 `PAYMENT_INSTRUCTIONS`。提醒規則由管理員介面維護 `BOOKING_NOTIFICATION_RULES`，未設定則沿用程式預設。密鑰不得放進 VITE 變數。
- [ ] 同步全部目前的 `GAS/*.gs`，移除 Apps Script 專案內舊的八個 `Booking.*.gs` 同名實作。正式專案不執行 `testData.gs` 的生成、重設與清理工具。
- [ ] 由部署者在編輯器執行 `initializeBookingFeatures()`，核對新增四表，以及 Reserved、Exam、Transaction 的追加欄位。這次已補上初始化 Transaction，包含 `fileID`；Reserved 成績五欄也會追加。標題不符時先核對原始表，不要重排／清空原資料。
- [ ] 舊已付款資料逐筆對帳：除了應付金額，也要填實際 `paidAmount` 和 `refundedAmount`。只有應付金額、沒有實收數字的已付款資料仍標記推估，禁止核准退款。
- [ ] 核對付款資料夾及舊檔個別分享權限。舊孤兒清理排程目前預設只預覽；`cleanUpOrphanPaymentProofs_()` 不移動檔案。以交易 fileID／舊連結 ID 保護已引用檔案，無 ID 的舊交易才保守比對檔名；跳過 24 小時內檔案，單次最多掃描 200 筆。若回傳 `truncated: true`，代表尚未盤點完整資料夾，須人工處理，不能宣稱已清乾淨。確認預覽內容後，部署者才考慮明確傳入 `false` 執行。
- [ ] 部署者執行 `installBookingNotificationTrigger()`，核對唯一的每 15 分鐘排程、執行帳號授權與通知寄送紀錄。既有其他帳號建立的排程仍需人工盤點。
- [ ] 建立新版 Web App 部署，確認存取設定與前端使用的 `/exec` URL，保留可回復的舊版本。新前端與新 GAS 成對發布。
- [ ] 前端環境填入 `VITE_GAS_ID`、`VITE_GAS_MODE=exec`、`VITE_GOOGLE_CLIENT_ID`、`VITE_RECAPTCHA_SITE_KEY`。執行 `npm test`、`npm run lint`、`npm run build`；將 dist 內容提供於 `/booking/`。本輪確認產出 HTML 的 JS、CSS、favicon 都指向 `/booking/assets/`。
- [ ] 正式主機設定 `/booking` 導向 `/booking/`，以及子路徑重新整理時的 SPA fallback；Vite 內的轉址外掛只涵蓋開發與 preview。
- [ ] 用隔離的驗收試算表與測試帳號檢查登入、重複報名、名額競爭、部分付款、改期／退費、跨帳號權限、私人證明、通知、CSV／行事曆／確認單，再由擁有者批准正式發布。

### 本輪行為與相容性

- GAS 失敗回應仍為 `{ ok: false, error, code }`，error 為繁體中文；code 區分 `UNAUTHORIZED`、`FORBIDDEN`、`CAPTCHA_FAILED`、`BUSY`、`NOT_FOUND`、`REQUEST_FAILED`。未知英文內部例外不再直接顯示給考生。Google tokeninfo 的 429／5xx 是服務暫時故障，不是登入失效。
- 前端缺少 GAS 部署 ID 時會直接顯示中文設定錯誤（不發送無效網址）；部署模式未填時預設 exec。前端依明確的 UNAUTHORIZED 判斷登出，且只有請求所帶 token 仍等於目前 token 才清除登入；舊帳號的延遲回應不會登出新帳號。公開請求遇到登入錯誤只顯示功能尚未啟用。
- 正式 API 不再等待 ping 完成；背景 ping 上限 8 秒、其餘請求含 JSON 讀取上限 45 秒。同帳號同參數的進行中讀取會合併，完成後不保留回應快取；寫入不自動合併或重試。超時不代表伺服器未寫入，請先重新查詢結果再重送。
- 相同 submissionKey 的重送仍回傳原紀錄；即使換了 key，同帳號也不能再報名同一個有效場次，改期不能移到本人已有有效報名的目標場次。取消完成後可以重新報名。
- 部分付款後修改加購，應付不能低於已確認收款。異動路由及通知偏好在取得鎖後重查帳號／權限，避免等待期間權限被撤銷後仍寫入。
- 已取消場次的 ICS 標為 CANCELLED，確認單顯示「場次已取消」；舊資料的空白基本費／加購欄位依相同估算規則處理，明確的零元保留為零。

既有 localStorage token、tokeninfo 架構、非持久交易的 Sheets、舊公開檔案與郵件可能重複投遞的限制仍適用，見上方安全事項。正式 Google 環境驗收與部署由擁有者執行。
