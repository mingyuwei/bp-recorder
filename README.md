# 血壓紀錄 Blood Pressure Recorder

An iPhone home-screen web app (PWA): no App Store, works offline, and data stays on the phone.

## Features
| Need | How it works |
|---|---|
| Daily recording | **記錄** tab: date and time (pre-filled with now), 收縮壓 / 舒張壓, optional 脈搏 and 備註. Shown as `yy/mm/dd` and 12-hour time (e.g. `26/11/16 下午2:00`). |
| Voice input | 🎤 button, or the iPhone keyboard's dictation mic in the 「說或打」 box. Say e.g. 「下午兩點 一百二十五 八十 脈搏七十二」 or 「早上8點半 128/82」. Understands Chinese numerals, 收縮壓/舒張壓/脈搏 keywords, 今天/昨天/昨晚 and 上午/下午. |
| Edit / delete | Tap any record → edit dialog → 儲存 or 刪除 (with 復原 undo). |
| Weekly average | Weeks run Sunday to Saturday. Each **Sunday 10:00 AM** the past week's report appears on the home screen (marked NEW). The **週報** tab shows every week, morning vs. evening averages, ranges, and a 12-week trend chart. |
| Sunday 10 AM alert | **設定 → 每週日 上午10:00 查看週報** adds a repeating iPhone Calendar alert. There's also an optional daily "time to measure" reminder. |
| Excel | **設定 → 匯出 Excel** for all records or a date range, or **月曆 → 匯出本月**. The `.xlsx` has 3 sheets: 血壓紀錄, 每週平均, 每月平均. |
| Monthly paging + calendar | **月曆** tab: swipe or ‹ › to change month. Tap the month title for a 12-month picker with record counts. Each day shows its average and a colour dot. Tap a day to filter. |
| Google Drive auto-upload | On the **last day of each month**, opening the app or saving a reading uploads that month's Excel (`血壓紀錄_yymm.xlsx`) to your Drive folder. Each new upload replaces the earlier file with the same name. If the app isn't opened on the last day, it uploads the next time it's opened. Uses your own Apps Script; see `google-apps-script.js` for the one-time setup. |
| App icon | The cat image (`icons/`). |
| Backup | **設定 → 備份資料 / 從備份檔還原** (JSON). Back up monthly to iCloud Drive. |

Blood-pressure categories follow AHA/Taiwan thresholds. They are for reference only, not a medical diagnosis.

## Put it on the iPhone
The app must be served over **https** once. After that it runs offline.

**Easiest: Netlify Drop (free, about 2 minutes)**
1. On the Mac, go to https://app.netlify.com/drop.
2. Drag this whole folder onto the page. You get a link like `https://xxxx.netlify.app`.
3. On the iPhone, open that link in **Safari** → Share ⬆︎ → **加入主畫面 (Add to Home Screen)**.

(GitHub Pages works too. The site contains only the app code. Blood-pressure data never leaves the phone.)

## Files
- `index.html`: layout and styles
- `app.js`: app logic (storage, voice parsing, calendar, weekly stats, export)
- `xlsx.js`: small built-in Excel writer, no external libraries
- `sw.js`: offline cache (bump `VERSION` after changing files)
- `manifest.webmanifest`, `icons/`: home-screen app name and icon
