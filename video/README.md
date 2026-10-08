# 影片製作檔

親友版，約 1 分 35 秒，1920 × 1080、30 fps。全片是原創示意動畫與選定的小機器人，沒有真實電腦截圖。

這個資料夾供維護者修改影片。設定自己的秘書請看 [開始使用](../SETUP.md)。

## 重製

準備 Node.js 與 FFmpeg / FFprobe，確認後兩者位於 PATH。在本資料夾執行：

```powershell
npm run check
npm run preview
npm run render
```

使用固定版本 HyperFrames 0.8.141；首次執行會下載該工具。音樂避讓旁白的音量曲線與淡入淡出已寫入 index.html，不必重新生成聲音。旁白為一段 92.28 秒的連續生成，沒有逐句拼接。

GitHub 首頁使用附件播放器；另保留壓縮後的 MP4 供下載。重新發布時，以 H.264 / AAC、faststart 匯出並將附件壓在 10 MB 以下，再替換 README 的 GitHub 附件網址。

[文案](../media/短版影片腳本.txt) · [分鏡](STORYBOARD.md) · [視覺規範](design.md) · [字幕](../media/ai-secretary-intro.srt) · [素材來源](ASSETS.md) · [驗證紀錄](../docs/VERIFICATION.md)

畫面標示「操作示意」，實際操作參考 PDF。行事曆先提案，經本人確認才寫入；改期更新同一筆行程。
