# ChatGPT 專案指示

範本：[setup/專案指示.txt](setup/專案指示.txt)。包含待辦追蹤、輕重緩急、每天的提醒，以及「查撞期 → 提案 → 本人確認 → 日曆寫入並讀回」的規則。

Agent 在 `setup/` 執行 `node tools/prepare.mjs --instructions-only`，產生 `work/專案指示.已填.txt`，有已授權瀏覽器能力時由 Codex 直接建立新專案並放入指示；否則逐步帶本人完成。

使用更新版日曆功能時，原來的唯讀授權需要重新授權；詳見 [日曆工具與升級](docs/CALENDAR.md)。
