# 日曆工具與安裝驗收

這份給 Agent 讀。使用者只看圖解的「安排行事曆」一步。

## 三個工具

| 工具 | 用途 | 寫入 Google 日曆 |
|---|---|---|
| `list_calendar_events` | 查指定日曆，含跨日、全天及重複行程實例；每次最多 31 天 | 否 |
| `propose_calendar_change` | 提議新增或改期，讀取舊版本、檢查撞期，保存 15 分鐘有效的提案 | 否 |
| `confirm_calendar_change` | 本人明確確認**這個提案**後，重新檢查、寫入、讀回 | 是 |

先向本人展示標題、台北日期與起迄時間、地點、修改前後、撞期結果。得到明確確認，才傳 `confirmed:true`。撞期時優先另找時間；只有本人明確接受已展示的撞期，才傳 `allow_conflict:true`。安裝同意不代表同意任何日曆安排。

新增與改期都要有明確結束時間。聚會只交代晚上 7 點時，詢問幾點結束，或明說建議時長再等本人確認。地點傳 `location`（最多 500 字），備註與活動 URL 傳 `description`（最多 4000 字）；省略時保留原欄位，明確要求清空才傳空字串。寫後讀回會核對這兩欄。全天用 `YYYY-MM-DD`，結束日不包含在內；其他用含時區的 ISO 時間。改期一定沿用原事件 ID。一般私人行程與某一次重複行程可修改；整組重複規則、邀請他人、受邀會議、特殊事件類型或刪除，帶本人在 Google Calendar 操作。

## 安裝與升級

新安裝按技術手冊正常執行。舊版日曆唯讀授權不能直接用來寫入，Agent 依序：

1. 更新分享模板，先執行 `node tools/prepare.mjs`，再執行 `node tools/d1-init.mjs --check`，再依本人既有部署授權執行 `node tools/d1-init.mjs`。只建立缺少的表，不刪資料。
2. `node tools/authorize.mjs --calendar --replace`：本人在 Google 選收件主帳號並同意新的 `calendar.events` 範圍。Google 範圍能存取帳號可存取的多本日曆，程式固定只管理設定中的一本，不可說 Google 本身只授權一本。
3. `node tools/install-secrets.mjs --only calendar`，再 `node tools/prepare.mjs`、`node tools/deploy.mjs`。不可改 `work/app`。
4. 把 `work/專案指示.已填.txt` 更新到本人的「AI 秘書」專案。重新連接或更新 ChatGPT 的工具清單，確認看得到三個日曆工具。
5. 本人選一件真實想安排的私人行程。Agent 提案，本人確認後才寫入，回報事件 ID 與讀回結果；本人到 Google Calendar 核對，再指定一次改期並確認，確保還是同一筆。不要擅自建立、刪除測試行程。

本版本的 Google 授權儲存鍵仍叫 `calendar-reader`，只是相容舊版的內部名稱；驗證器會拒絕只讀範圍。資料表 `calendar_proposals` 保存提案與結果供去重核對。

## 失敗時怎麼處理

- `CALENDAR_CONFLICT_NEEDS_CONFIRMATION`：展示撞期並詢問是否換時間。不可自行接受。
- `CALENDAR_CONFLICTS_CHANGED`、`CALENDAR_EVENT_CHANGED`、`PROPOSAL_EXPIRED`：重新讀取、重新提案、重新讓本人確認；不強制覆蓋。
- `CALENDAR_WRITE_PERMISSION_REQUIRED`：核對正確 Google 帳號、日曆寫入權限及新授權；不要把授權 token 存在就說寫入已通過。
- `CALENDAR_BUSY`：有另一筆正在寫入。先等它回傳；`get_service_status.calendar_unresolved` 可查未解決的提案 ID。超過兩分鐘，只重查該 ID 的結果。
- `CALENDAR_RESULT_UNCERTAIN_CHECK_GOOGLE`：只重試**同一 proposal_id** 做讀回核對，不重寫。若仍無法核對，請本人看 Google Calendar 並確認結果；不可另開提案重做同一件事。
- `CALENDAR_USE_GOOGLE_FOR_THIS_EVENT`：帶本人到 Google Calendar 處理這筆多人、整組重複或特殊行程。

提案與確認時都查撞期；其他裝置仍可能在最後一次查詢後新建行程，Google 不提供跨事件的原子排程鎖。確認後可再查看當日清單；有新的重疊就回報本人，不擅自更改其他行程。

## 驗證依據

`tests/t10-calendar.mjs` 用虛構帳號、離線 HTTP 與 D1 驗證：確認前零寫入、撞期與邊界、分頁不完整拒絕、改期保留原 ID 與無關欄位、ETag 防覆寫、地點與來源保存、改期保留／明確清空欄位、長度限制、地點讀回不符拒絕宣稱成功、寫後讀回、遺失回覆不重寫、同時確認互斥、過期及舊只讀授權拒絕。這不代表已在任何使用者的正式帳號實測。

API 依據：[查詢](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)、[新增](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)、[版本條件](https://developers.google.com/workspace/calendar/api/guides/version-resources)。
