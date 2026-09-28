# MCP、OpenChatX 與備份

## 先分清楚兩條路線

本秘書基本路線使用 ChatGPT 的 Google Calendar 連線。在作者的設定頁顯示開發者為 OpenAI、授權方式為 OAuth；日曆工具也是由這條連線呼叫。這不是把作者電腦上的 OpenChatX 程式當作 Calendar 的必要依賴。

[OpenChatX](https://github.com/XiaoPuOuO/openchatx-mcp) 是另一套第三方開源工具：在自己的電腦運行 MCP，讓 ChatGPT 經連線呼叫本機工具與其他 MCP。要使用它，仍需設定執行環境、帳號／連線與相關授權。原始碼下載不會自動把服務切到自己的電腦。

## 本次保留的上游版本

- 上游：https://github.com/XiaoPuOuO/openchatx-mcp
- 版本：`1.0.0-beta.2`
- Commit：`22901d5dc7bd53a9dc0d521aaf05340e6601969b`
- 原始授權：MIT，保留上游 LICENSE 與 copyright。
- 備份日期：2026-09-29。

這是原始碼封存版本，不代表已執行完整服務驗收或安全審查。分享教學沒有重新打包或執行該第三方程式。

## 你也可以自己備份

有 Git 的電腦可以執行：

```sh
git clone https://github.com/XiaoPuOuO/openchatx-mcp.git
git -C openchatx-mcp bundle create ../openchatx-mcp-backup.bundle --all
git -C openchatx-mcp bundle verify ../openchatx-mcp-backup.bundle
```

第一個資料夾是可讀的原始碼與 Git 歷史，第二個 bundle 是單檔離線歷史備份。保留一份在另一個磁碟或自己的備份空間；只有同一顆磁碟上的兩份，不能防硬碟損壞。

之後上游暫時無法連線，可以從 bundle 恢復：

```sh
git clone -b main ./openchatx-mcp-backup.bundle openchatx-restored
git -C openchatx-restored rev-parse HEAD
```

要保留上面指定的版本，可另外建立檢查用 checkout：

```sh
git -C openchatx-restored checkout --detach 22901d5dc7bd53a9dc0d521aaf05340e6601969b
```

不要直接對正在工作的 runtime checkout 做切版。若上游使用 Git LFS／submodule，需另行備份實際物件與子專案；一般 bundle 不包這些外部內容。本次封存仍不包含 npm 套件快取、安裝檔、作業系統憑證或雲端狀態。

## 備份能保護什麼

它能保留這個版本的程式碼與版本歷史，讓你檢查、修改或之後重新部署。它不能保證外部服務永遠可用，不能備份 ChatGPT／Google 的後端，也不能讓 OAuth token、MCP tunnel 或套件來源永不過期。

不熟程式的親友先用 [基本設定](SETUP.md) 即可。只有真正需要本機工具時才評估 OpenChatX；不能把「已下載備份」寫成「已切換自架、無第三方依賴」。
