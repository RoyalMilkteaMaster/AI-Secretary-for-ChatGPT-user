# 安裝與日常流程

```mermaid
flowchart TD
    A[把完整設定包交給 Agent] --> B{有 Google ChatGPT Cloudflare 帳號嗎}
    B -->|有缺| C[開官方頁 帶本人免費註冊]
    C --> D[檢查 ChatGPT 功能與 Windows 環境]
    B -->|都有| D
    D --> E[Agent 設定 本人登入授權]
    E --> F[ChatGPT 新建 AI 秘書專案並連接]
    F --> G[一封信驗收 日曆新增與改期驗收]
    G --> H[清理示範 本人確認開啟每天九點提醒]
    H --> I[第一次到點 實際核對收件]
```

| 你想做什麼 | 秘書怎麼做 |
|---|---|
| 交辦或更新待辦 | 讀取目前進度，保存後讀回 |
| 安排行程 | 查指定日曆、檢查撞期，提出時間 |
| 確認行程 | 再查一次，確認無新衝突後寫入並讀回 |
| 每天看提醒 | Cloudflare 在台灣 09:00 寄一封 Gmail，分類待辦與今日行程 |
| 完成一步 | Gmail 勾選保存；ChatGPT 讀到同一份最新進度 |

本人密碼、Google 與 Cloudflare 的登入授權由本人操作。Agent 不需要看到密碼。詳細命令留在 [Agent 手冊](../setup/助手交接指示.txt)，你只需看 [12 步圖解](AI秘書完整操作圖解.pdf)。
