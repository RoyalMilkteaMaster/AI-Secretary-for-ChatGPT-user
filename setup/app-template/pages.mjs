import {OWNER} from './owner-config.mjs';
const style = `body{margin:0;background:#f6f8fb;color:#203047;font:17px/1.8 system-ui,sans-serif}main{max-width:780px;margin:48px auto;padding:32px;background:white;border-radius:18px}h1{font-size:32px;line-height:1.3}h2{font-size:21px;margin-top:30px}a{color:#175bb5}small{color:#526279}nav{display:flex;gap:24px;border-bottom:1px solid #e2e8f0;padding-bottom:16px}@media(max-width:600px){main{margin:0;padding:24px;border-radius:0}}`;
const home = `<h1>AI Secretary Mail</h1><p>個人自用的 AI 秘書郵件服務，用於把待辦進度寄到帳戶持有人指定的信箱，並透過支援動態郵件的 Gmail 保存完成狀態。</p>
<h2>服務用途</h2><ul><li>寄送待辦與進度通知。</li><li>在郵件內勾選事項，保存完成狀態與時間。</li><li>重新開啟有效郵件時，讀取該事項的最新狀態。</li></ul>
<h2>Google 授權</h2><p>本服務以 Gmail SMTP 寄出保留動態內容的通知。Google SMTP 要求完整 Gmail 權限（https://mail.google.com/），授權能力包含閱讀、撰寫、傳送及永久刪除寄件信箱的郵件，因此由帳戶持有人以專用寄件帳號另行同意。本服務實際用途限定確認寄件帳號及寄送通知，不讀取或刪除郵件。授權可在 Google 帳戶中撤銷。</p>
<h2>日曆與聊天連接</h2><p>帳戶持有人另行同意日曆事件唯讀與背景授權，以便每日總覽查詢今日行程。Google 的授權範圍涵蓋可存取的日曆事件，程式固定只查本人指定的個人日曆，不新增、修改或刪除行程。私人 ChatGPT 外掛以 OAuth 讀寫共用待辦，與郵件勾選使用同一份進度；它不提供任意寄件或 Gmail 憑證存取。</p>
<h2>使用範圍</h2><p>僅供帳戶持有人自用，沒有開放公眾註冊。首頁不顯示個人待辦；郵件中的單一事項存取需要有效的簽章與期限。請使用 Gmail App 或 Gmail 網頁版；iPhone 內建「郵件」僅顯示一般郵件版本，無法操作信內格子。</p>
<p><a href="/privacy">閱讀隱私權政策</a></p>`;
const privacy = () => `<h1>隱私權政策</h1><p><small>AI Secretary Mail · 更新日期：${OWNER.policy_date||'尚未設定'}</small></p>
<h2>服務與資料用途</h2><p>本服務由帳戶持有人管理，供其個人寄送待辦與進度通知、保存事項完成狀態。只處理完成上述功能所需的資料。</p>
<h2>處理的資料</h2><ul><li>由使用者提供或授權建立的事項識別碼、標題、狀態、版本及完成時間。</li><li>指定的寄件與收件地址、產生的通知內容及寄送結果。</li><li>Google OAuth 用戶端憑證與授權 token，用於依本人授權以 SMTP 寄送郵件及讀取指定日曆。</li></ul>
<p>SMTP 寄件使用 Google 要求的 https://mail.google.com/ 完整 Gmail 權限，包含閱讀、撰寫、傳送及永久刪除郵件的能力。本服務實際只核對寄件帳號地址與寄送通知，不讀取、修改或刪除信箱中的郵件，不保存 Gmail 登入密碼。</p>
<h2>日曆與 ChatGPT 資料</h2><p>經本人同意後，服務使用 Google 日曆事件唯讀及背景存取，固定查詢指定個人日曆當天的行程識別碼、標題與起迄時間；不修改行程，也不查其他日曆。Google 的授權本身較程式查詢範圍寬。ChatGPT 透過私人 OAuth 連線讀寫使用者交辦的事項、期限、延期、來源聊天連結與必要備註；進度來源不是不可靠的聊天記憶。不保存附件全文、證件或登入密碼。日曆與寄信授權可在 Google 帳戶撤銷；進度外掛可在 ChatGPT 中斷連接。</p>
<h2>儲存與服務供應商</h2><p>Google Gmail 負責郵件授權與寄送；Google Calendar 提供經授權的行程查詢；Cloudflare Workers 與 D1 負責進度端點與資料保存。本機 OAuth 憑證使用 Windows 使用者加密保護。雲端日曆與寄信憑證保存於帳戶持有人管理的 Cloudflare Worker secrets。ChatGPT 連線 token 僅保存雜湊，存取 token 一小時、refresh token 九十天並於更新時輪替；中斷或到期後需重新連接。憑證不放入公開網頁、教材或版本庫。</p>
<h2>Google 使用者資料</h2><p>AI Secretary Mail 對 Google API 所取得資訊的使用與轉移，遵守 <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>，包括 Limited Use 要求。資料不出售、不用於廣告、不用於訓練通用 AI 模型，只用於本人要求的服務功能。本服務未加入廣告或第三方分析追蹤程式。</p>
<h2>保留、撤銷與刪除</h2><p>事項資料保留至帳戶持有人清除。郵件互動連結的有效期限最多七天；連結過期不代表資料自動刪除。使用者可在 Google 帳戶的第三方連結設定撤銷寄信授權。管理者可在其 Cloudflare 帳戶刪除相關 D1 資料及 Worker secrets，並清除本機加密憑證。已寄出的郵件由寄收件者各自依 Gmail 設定管理。</p>
<h2>聯絡方式</h2><p>如需支援或要求刪除資料，請聯絡 Google 授權畫面列出的「使用者支援電子郵件」。帳戶持有人亦可直接在其 Google Cloud 與 Cloudflare 專案中管理本服務。</p>`;
export function publicPage(pathname) {
  const body = pathname==='/' ? home : pathname==='/privacy' ? privacy() : null;
  if(!body) return null;
  const title=pathname==='/' ? 'AI Secretary Mail' : '隱私權政策｜AI Secretary Mail';
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${style}</style></head><body><main><nav><a href="/">AI Secretary Mail</a><a href="/privacy">隱私權政策</a></nav>${body}</main></body></html>`,{
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
  });
}
