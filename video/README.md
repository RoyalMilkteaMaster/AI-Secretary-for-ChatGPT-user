# 影片製作檔

親友版，1 分 53 秒，1920 × 1080、30 fps。使用者已核准文案；全片是原創示意動畫與選定的小機器人，沒有真實電腦截圖。

這個資料夾只供維護者修改影片；使用者設定秘書請回到 [開始使用](../SETUP.md)。

## 重製

準備 Node.js 與 FFmpeg / FFprobe，並確認後兩者位於 PATH。在本資料夾執行：

```powershell
npm run check
npm run preview
npm run render
```

使用固定版本 HyperFrames 0.8.141；首次執行會下載該工具。音樂的語音避讓與淡入淡出已寫入 index.html，不必重新產生聲音。完整旁白為同一段連續錄製，沒有逐句拼接。

[文案](../media/短版影片腳本.txt) · [分鏡](STORYBOARD.md) · [視覺規範](design.md) · [字幕](../media/ai-secretary-intro.srt) · [素材來源](ASSETS.md)

影片標為「操作示意」，實際頁面位置請看 PDF。日曆仍是唯讀；改行程回 Google 日曆。
