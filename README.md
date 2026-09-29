# AI 秘書：ChatGPT × Google 行事曆

把活動網址或 PDF 交給 ChatGPT，請它整理日期、準備事項與提醒。這份專案分享可複製的秘書規則、設定步驟與製作經驗，讓每個人使用自己的帳號與行事曆。

**這是設定範本與教學，不是一個已替你登入、部署完成的服務。** 不需要先安裝程式或購買模型 API。是否能直接改行事曆，取決於你的 ChatGPT 帳號實際提供哪些連線工具。

## 親友從這裡開始

1. 在 ChatGPT 建立自己的「AI秘書」專案。
2. 依 [設定教學](SETUP.md) 連接自己的 Google Calendar，確認要管理的個人日曆。
3. 複製 [專案指示範本](PROJECT_INSTRUCTIONS.md)，填入你的日曆 ID 與時區，貼到專案的「指示」。
4. 通過教學中的小型驗收後，貼上活動網址或 PDF 開始交辦。

可用 Git clone、GitHub「Code → Download ZIP」取得同一包文件；沒有 Git 也能照做。第一次 Google 登入、授權與通知設定仍要本人完成。不要共用作者的日曆、ChatGPT 專案或登入憑證。

## 日常會怎麼用

> 我要參加這個活動。幫我查官方資料，整理目前需要做的事，再把確定的時程加入我的個人行事曆。

> 這件事三天內要做完，請在行事曆用紅色系標示，並在原聊天提供可以再次打開的進度卡片。

> 這件完成了，幫我停止相關提醒。請確認聊天進度與相關提醒實際同步了哪些。

一件活動可以有多個里程碑，但不因官方每個日期就增加一堆待辦。一般活動按主題分色；急件紅色優先。卡片與聊天處理「目前進度」，行事曆處理「哪天發生／需要處理」。

## 功能狀態：2026-09-29

| 功能 | 狀態 |
|---|---|
| 秘書語氣、單一個人日曆、排除共用日曆、配色與急件規則 | 範本已提供 |
| ChatGPT 讀寫 Google Calendar | 在作者帳號實測；每人仍須驗證自己的連線 |
| Gmail 接收 Google／ChatGPT 提醒 | 作者已確認收件；親友須各自測試 |
| 原聊天中的互動進度卡片 | 作者桌面已實測重開、自由補充、取消與再次回報；本人手機 App／網頁的本地互動正常，但目前卡片的直接回報方法不可用 |
| 卡片未送出草稿 | 重開後未保留；不保證跨裝置草稿同步 |
| 每日 09:00 依聊天回報巡查、完成後停催 | **尚未完成跨聊天整合驗收**；不得只貼提示詞就宣稱啟用 |

範本不是授權憑證，也不會替帳號開通原本沒有的功能。無法使用 Calendar 寫入工具時，先輸出建議供本人加入，不能說已新增。進度在原聊天回報，不要求 Google Tasks、Cloudflare、外部資料庫或自架 MCP。卡片送出需按 ChatGPT 原生確認，出現回報訊息及秘書確認才算完成；卡片不是即時同步看板。

## 專案內容

- [SETUP.md](SETUP.md)：不懂程式也能照做的設定、驗收與排錯。
- [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md)：通用秘書人設與操作規則。
- [BUILD_LOG.md](BUILD_LOG.md)：從需求到實測的製作過程、修正與未完成項目。
- [CARD_GUIDE.md](CARD_GUIDE.md)：卡片入口、回報方式與已知限制。
- [MCP_BACKUP.md](MCP_BACKUP.md)：OpenChatX 是什麼、原始碼備份與恢復方式。

## 資料與費用

本儲存庫不放個人日曆 ID、真實活動、聊天連結、PDF、憑證或實際排程 ID。範本中的 `YOUR_CALENDAR_ID` 是待填欄位。Gmail 用來收提醒，不要求把整個信箱授權給秘書。

基本路線使用你原有的 ChatGPT 方案與 Google 服務；沒有呼叫付費模型 API 的程式。ChatGPT 的方案、地區、工作區權限與工具支援仍可能影響使用，不能保證每個帳號都具備相同功能。

這份教學使用 Google Calendar 連線，不把 OpenChatX 當成必要依賴。OpenChatX 是獨立的第三方開源工具；備份程式碼不代表已備份 Google／OpenAI 的雲端服務或你的授權。

## 官方參考

- [ChatGPT 專案](https://learn.chatgpt.com/docs/projects)：專案指示、聊天與來源。
- [ChatGPT 外掛與分享](https://learn.chatgpt.com/docs/build-plugins)：每個使用者仍需自己的 app 存取權與帳號連線。
- [ChatGPT 排程](https://learn.chatgpt.com/docs/automations)：背景工作與可用工具，雲端和本機執行的差異。
- [ChatGPT Visualize](https://learn.chatgpt.com/docs/visualizations)：內嵌互動入口及平台可用性。

本專案不是 OpenAI、Google 或 OpenChatX 的官方產品；來源與功能有變更時，以實際帳號及官方文件為準。
