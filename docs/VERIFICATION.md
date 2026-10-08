# 驗證紀錄

## 2026-10-09：三個生活例子與新 Agent 安裝檢查

- 新封面是使用者指定的「秘書拿筆在平板記錄」版本。首頁 WebP 149,670 bytes，原圖 2,298,309 bytes；縮小 93.5%，點圖仍可看新原圖。
- 成片 74.8 秒，1280 × 720、30 fps，2,130,344 bytes；舊版 5,294,662 bytes，減少 59.8%。H.264 / AAC，已核對 moov 位於 mdat 之前（faststart）。這是傳輸量改善，不宣稱每種網路的首播秒數相同。
- GitHub 新附件在 README 編輯預覽中實際播放，currentTime 從 0 前進至 17.01 秒，duration=74.8、paused=false、readyState=4，沒有媒體錯誤。發布後再於首頁核對新版 WebP 已載入，影片從 0 前進至 12.94 秒並播完 74.8 秒結尾，無錯誤；從首頁播放器下載的影片與 repo MP4 SHA-256 完全相同。
- 影片改成朋友聚會、活動連結與寫信給林老師；已移除 Claude、重開保存狀態、準備報名資料的舊說法。設定步驟、建立新 ChatGPT 專案與放入指示，交給有瀏覽器能力的 Codex；本人登入、授權、確認。
- 配樂重新生成，實測鼓點約 114 BPM；16 個後續畫面落定點量化至 30 fps，與最近打擊樂拍點最大差 15.37 ms。原生通用節拍偵測產生不合適的 165 BPM，未拿來對拍。實際落點保存在 video/beat-sync.json。
- Google Puck 一次生成 72.92 秒旁白，未分句剪接。人聲頻段避讓強度降為 0.36，保留鼓點與 bass。實際 MP4 抽出聲音由 Gemini 3.5 Flash Lite 模型審查：清晰度與自然度 5/5、律動 4/5；說話期間仍可聽見鼓點，無異常停頓、滋聲或破音。模型審查不等於人類實聽。成片 -16.2 LUFS，true peak -1.1 dBFS。
- HyperFrames 0.8.142 的 lint/runtime/layout/contrast 均為零 error、零 warning；33 筆 layout info 來自進出場。Codex 目視檢查 17 張實際成片畫面，均為示意圖，沒有私人電腦截圖。
- 全新本機資料夾只複製分享包檔案，執行 npm.cmd ci，再跑 node tests/run-all.mjs：7 組通過、0 失敗；包含 Windows DPAPI。敏感資料掃描 56 檔、0 筆。
- 日曆新增 location/description，測試確認前零寫入、地點與來源保存、改期保留、明確清空、長度限制及地點讀回不符不宣稱成功。
- 新 Agent 文件補齊僅收到 URL 時的下載、Windows 預檢、固定相依版本、新 Cloudflare 子網域、Google 憑證即時下載、長時間授權工作階段、Codex 代填專案，以及未完成日曆驗收就不能開每日提醒的規則。

**結論範圍：** 設定包的乾淨環境安裝、程式模擬測試與引導文件已驗證；沒有拿新 Google／Cloudflare／ChatGPT 帳號走一次真正雲端安裝，不宣稱實機端到端完成。登入授權、功能是否開放、真實收信、日曆寫入與首次 09:00 收信，仍須安裝者當場驗收。Repo 保持 private，未授權者無法只憑網址開始。

官方依據：[Cloudflare 子網域](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[Google 用戶端秘密只在建立時完整下載](https://support.google.com/cloud/answer/15549257?hl=en)。

## Fable 5 最終審查

Claude Code 使用實際模型 `claude-fable-5` 唯讀初審與定向複查，兩輪均判定 pass。七項需求全部核對通過；README 差異、首頁影片檔案比對與 npm 安裝腳本提示的證據缺口已補齊。舊的空白差異檔也已移除。模型未親自播放音訊或操作新帳號；實際瀏覽器驗證與離線測試由 Codex 執行。詳見 [審查摘要](FABLE_REVIEW.md)。

## 先前驗證紀錄


2026-10-08，引導安裝版。這份紀錄涵蓋分享設定包；未部署作者的正式服務，也未操作作者的真實日曆、待辦或寄信排程。

## 設定包

Windows 本機執行 `node tests/run-all.mjs`，七組全部通過、零失敗。`node tools/scan-kit.mjs` 掃描 55 個文字與程式檔案，零筆疑似敏感資料；圖片另外目視核對。

| 測試 | 涵蓋 |
|---|---|
| 設定與產生副本 | 不完整設定拒絕、每日預設關閉、已改副本拒絕部署 |
| 服務行為 | 簽章、版本隔離、信內保存、一次寄信、OAuth、日曆讀取 |
| 帳號限制 | 寄收件一致、實際帳號、用戶端與授權範圍核對 |
| 本機驗收 | 同筆待辦改期、預覽、模擬保存讀回、示範清理與啟用條件 |
| 秘密處理 | 秘密不進命令參數、輸出或分享檔案 |
| Windows 儲存 | DPAPI 加密讀寫、不覆寫既有項目、拒絕空值與路徑跳脫 |
| 日曆安排 | 提案不寫入、明確確認、撞期重查、全天與循環實例、版本保護、保留其他欄位、寫後讀回、失去回覆不重寫、並行隔離、過期與舊範圍拒絕 |

Claude Opus 5.5 唯讀審查日曆實作、相關授權程式與測試，再複查修正。受邀會議辨識、全天與指定時段互轉、長請求期限及時間格式問題已修正；複查未發現修正中的重大缺陷。仍有低優先的測試涵蓋建議，以及極少數逾時可能保守標成結果不確定的情況；後者只會要求人工核對，不會自動重複寫入。Claude 沒有執行測試，七組通過由 Codex 實際執行確認。

上述日曆測試使用離線 Google 回應與本機資料庫，未宣稱真實 Google 帳號寫入已通過。每位使用者仍要依 [日曆驗收](CALENDAR.md) 完成新增、改期、撞期和讀回核對；服務只允許設定的一本日曆。

## 圖解

Word 匯出 PDF，共 12 頁，每頁一個步驟；逐頁轉圖並由 Codex 檢查。每步只有目的、圖、操作與必要提醒。Cloudflare 註冊使用依 [官方流程](https://developers.cloudflare.com/fundamentals/account/create-account/) 繪製的中文紅框示意，沒有冒稱取得未登入的實際截圖。兩張歷史實機參考已匿名化；其餘都是明示的操作示意。

## 影片與聲音

- 最終 MP4 為 1920 × 1080、30 fps、H.264 / AAC，94.50 秒、約 5.3 MB。全片示意動畫，零張真實電腦截圖。
- HyperFrames 0.8.141：lint、runtime、layout、contrast 均為零 error、零 warning。54 筆 layout info 位於元素進出場的推移過程；本地字型隨工程提供，並非單檔內嵌。
- Codex 抽查實際輸出的 22 張主要畫面，修正驗收信誤標早上 9 點，再重新輸出並核對。
- Google Puck 92.28 秒單段旁白，未逐句拼接。Google gemini-3.5-flash-lite 審查完整實際 MP4 混音：清晰度與自然度 5/5、配樂可聽且不蓋過旁白，未指出滋聲、破音或句中異常停頓。這是模型音訊審查，不冒稱人類實聽。
- 成片 -15.6 LUFS，True Peak -1.3 dBFS。最終影片抽出的聲音與已審查音檔 SHA-256 相同。
- README 改用 GitHub 附件播放器，另保留 MP4 與字幕下載。GitHub 的影片附件格式與大小規則見 [官方說明](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)。

2026-10-09 已從 GitHub 正式首頁實際點擊播放：94.5 秒影片成功載入，播放進度由 26.02 秒前進到 48.42 秒，readyState=4，沒有媒體錯誤。另核對 GitHub 上的新版 PDF 檔案大小與提交版本一致。

## 實際安裝仍要驗收

收件匣送達、Gmail 手機互動、本人 ChatGPT 的連接功能、Google 日曆真實讀寫、首次台北 09:00 收件及各平台當時的授權要求，須由每位使用者在自己的帳號驗收。倉庫仍為私人；這次更新沒有變更可見性。
