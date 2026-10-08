# Agent 入口

如果使用者要安裝自己的 AI 秘書，先讀 `setup/給Agent的交接指示.txt`，然後直接開始引導。

**第一次回覆先問：**

> 我會帶你完成設定。你目前有 Google、ChatGPT、Cloudflare 這三種帳號嗎？沒有 Cloudflare 也沒關係，註冊免費，我會帶你申請。

已經告訴你的帳號狀態不用重問。缺少 Cloudflare 時，用已授權的瀏覽器開啟 https://dash.cloudflare.com/sign-up ，對照 `docs/AI秘書完整操作圖解.pdf` 的第 2 步引導本人註冊與驗證信箱；不要要求先買網域、開付費方案或填信用卡。Google 和 ChatGPT 缺少時，同樣先帶本人到官方頁面。本人輸入密碼、完成驗證及授權。

之後依交接指示預檢功能、準備專用寄件 Gmail、執行設定與驗收。不要一口氣丟給使用者所有資料、後台名詞或命令。能由你完成的就處理；需要本人接手時，只說「第幾步、目的、現在做一個什麼動作」。

命令在 `setup/` 執行。完整命令與排錯見 `setup/助手交接指示.txt`、`setup/操作手冊.html`；PDF 是本人接手的圖解。私人設定、授權資料、生成的工作副本不可加入 Git；只使用本人的帳號。首次每日寄信關閉，驗收後再由本人確認啟用。

## 只有網址時，先取得設定包

這份設定包需要本人的 **Windows 本機**、命令執行能力及 Node.js 22.15 以上。不要在雲端 Linux 或 WSL 安裝；授權資料使用 Windows DPAPI。已經開啟本機資料夾就直接使用，不重複下載。

只有 repo 網址時，先核對存取權，下載到本機不會雲端同步的新資料夾。有 Git 可只取安裝需要的部分，避免連影片與歷史一起下載：

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/RoyalMilkteaMaster/AI-Secretary-for-ChatGPT-user.git AI秘書設定
Set-Location AI秘書設定
git sparse-checkout set setup docs
```

沒有 Git 就下載 ZIP 並解壓。遇到 404 或無權限，先處理 repo 存取或請本人提供下載包；不要把私人倉庫當成空專案重新製作。不主動改倉庫可見性。

具備已授權的瀏覽器能力時，連「新建 ChatGPT AI 秘書專案、放入已填指示、填寫 MCP 連線」也由你代做。本人只處理登入、權限同意、秘密與驗收；沒有瀏覽器能力才逐步引導本人。完整分工見交接指示。

## 維護倉庫時

如果任務是修改、審查或維護這份分享倉庫，**不要啟動安裝、部署、寄信或操作真實帳號**。只修改分享文件、模板、工具與測試。必要程式修改後，在 `setup/` 執行 `node tests/run-all.mjs` 和 `node tools/scan-kit.mjs`。
