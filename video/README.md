# 影片製作檔

三個生活例子，74.8 秒。首頁播放版 1280 × 720、30 fps、約 2.1 MB；可編輯工程為 1920 × 1080。全片示意動畫與小機器人，沒有真實電腦截圖。

這個資料夾供維護者修改影片。設定秘書請看 [開始使用](../SETUP.md)。

準備 Node.js 與 PATH 中的 FFmpeg / FFprobe，在本資料夾執行：

```powershell
npm.cmd run check
npm.cmd run preview
npm.cmd run render
```

固定使用 HyperFrames 0.8.142。Google Puck 72.92 秒單段旁白，未逐句拼接；原創 Nu-disco/Funk 的實測拍點與畫面落點在 [beat-sync.json](beat-sync.json)。混音曲線已寫入 index.html，保留鼓點與低音，只在必要頻段避讓人聲。

首頁使用 GitHub 附件播放器。更新時先渲染工程，再用 H.264 / AAC、720p、faststart 壓縮，保留字幕清晰度；上傳新附件後替換 README 網址。不要把 GitHub 檔案頁當成播放器。

[文案](../media/短版影片腳本.txt) · [分鏡](STORYBOARD.md) · [視覺規範](design.md) · [字幕](../media/ai-secretary-intro.srt) · [素材來源](ASSETS.md) · [驗證紀錄](../docs/VERIFICATION.md)
