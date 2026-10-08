> **如果你是 Agent：請先讀 [AGENTS.md](AGENTS.md)，接著讀 [安裝交接指示](setup/給Agent的交接指示.txt)，直接開始引導安裝。第一個問題是：「你有 Google、ChatGPT、Cloudflare 這三種帳號嗎？」缺哪一個，就帶使用者補哪一個。**

# 把瑣事交給你的 AI 秘書

不想每次都自己填行事曆、追待辦、想先做哪一件？

這個專案把 **ChatGPT、Google Calendar 和 Cloudflare** 串在一起。我們已經準備好給 Agent 使用的設定包和 ChatGPT 專案指示；設定完成後，你的 ChatGPT 就會多一個「AI 秘書」專案。

你用平常說話的方式交辦，它幫你：

- **每天提醒**：早上 9 點寄一封 Gmail，整理待辦和今日行程。
- **安排行事曆**：先查有沒有撞期，提出時間，經你確認後新增或改期。
- **分清輕重緩急**：依你交代的急迫性和期限，整理急件、近期截止與一般待辦。
- **追蹤進度**：在 Gmail 勾選完成，回到 ChatGPT 也查得到最新狀態。

**先看 1 分 35 秒：把設定交給 Agent，平常用 ChatGPT 交辦。**

https://github.com/user-attachments/assets/dfac838d-9a81-435f-af00-5409ba4eb1fc

[下載影片](https://github.com/RoyalMilkteaMaster/AI-Secretary-for-ChatGPT-user/raw/refs/heads/main/media/ai-secretary-intro.mp4) · [字幕](media/ai-secretary-intro.srt)

## 怎麼開始？

先準備 **Google、ChatGPT、Cloudflare** 三種帳號，再讓能操作本機的 Codex 或 Claude Code 帶你設定。目前設定包支援 **Windows**。

**沒有 Cloudflare 也沒關係。** Agent 會打開[官方註冊頁](https://dash.cloudflare.com/sign-up)，帶你建立帳號。本教學採免費方案；註冊免費，免費額度內不收費，不必先購買網域或加購方案。[免費方案說明](https://developers.cloudflare.com/workers/platform/pricing/)

1. [下載設定包](https://github.com/RoyalMilkteaMaster/AI-Secretary-for-ChatGPT-user/archive/refs/heads/main.zip)，解壓縮。
2. 用 Codex 或 Claude Code 開啟整個資料夾。
3. 把下面這句貼給它：

> 請讀 AGENTS.md，帶我設定自己的 AI 秘書。先確認我有沒有 Google、ChatGPT、Cloudflare 帳號；缺少的請帶我申請。你能做的設定直接做，需要我登入、授權或確認時，一次告訴我一個動作。

你負責登入、授權和確認結果；Agent 負責設定與檢查。每天寄信需要另一個專用 Gmail，Agent 會在用到時帶你準備。ChatGPT 是否有自訂連接功能，也會先替你核對，不用先猜該買哪個方案。

## 跟著畫面做

- **[操作圖解 PDF](docs/AI秘書完整操作圖解.pdf)**：第幾步、目的、紅框、怎麼做。
- [可編輯的 Word](docs/AI秘書完整操作圖解.docx) · [開始使用](SETUP.md) · [完整流程](docs/FLOW.md)

## 設定好之後，你可以這樣說

> 「週五前要寄出報名資料，幫我記起來。」
>
> 「明天下午找一個小時準備資料，先確認有沒有撞期。」
>
> 「這個時間可以，幫我排進行事曆。」
>
> 「我已經寄出了，接下來幫我追蹤回覆。」

日常在 ChatGPT 交辦；每天的提醒由 Cloudflare 定時寄出，電腦關機也能運作。行程與待辦分開保存，改期時 Agent 會分別核對。

<details>
<summary>Agent 與維護者文件</summary>

[安裝交接](setup/給Agent的交接指示.txt) · [執行手冊](setup/助手交接指示.txt) · [技術手冊](setup/操作手冊.html) · [專案指示](setup/專案指示.txt) · [日曆工具](docs/CALENDAR.md) · [驗證紀錄](docs/VERIFICATION.md) · [影片來源](video/README.md)

</details>
