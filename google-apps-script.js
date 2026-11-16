/**
 * 血壓紀錄 → Google 雲端硬碟 上傳程式 (Google Apps Script)
 *
 * Setup (one time, on a computer):
 * 1. Go to https://script.google.com and click "新專案 / New project".
 * 2. Delete the sample code and paste this whole file. Then:
 *      - FOLDER_ID: paste your Drive folder ID (the part after /folders/ in the folder's link)
 *      - SECRET: change to your own password
 * 3. Click "部署 / Deploy" → "新增部署作業 / New deployment" → type "網頁應用程式 / Web app".
 *      執行身分 / Execute as: 我 / Me
 *      誰可以存取 / Who has access: 任何人 / Anyone
 *    Click Deploy, then allow access with your Google account.
 * 4. Copy the "網頁應用程式網址 / Web app URL" (ends in /exec).
 * 5. In the iPhone app: 設定 → 自動上傳到 Google 雲端硬碟 → paste the URL and the same password → 測試連線.
 */
const FOLDER_ID = 'PASTE-FOLDER-ID-HERE'; // ← from https://drive.google.com/drive/folders/<FOLDER_ID>
const SECRET = 'CHANGE-ME'; // ← change to your own password (the same one goes in the app)

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (SECRET === 'CHANGE-ME' || body.secret !== SECRET) return out({ ok: false, error: '密碼錯誤' });
    if (FOLDER_ID === 'PASTE-FOLDER-ID-HERE') return out({ ok: false, error: 'Apps Script 尚未填寫 FOLDER_ID' });
    const folder = DriveApp.getFolderById(FOLDER_ID);
    if (body.test) return out({ ok: true, folder: folder.getName() });

    const name = String(body.name || '').replace(/[\\/:*?"<>|]/g, '_');
    if (!/\.xlsx$/i.test(name)) return out({ ok: false, error: '檔名不正確' });

    // Replace an older upload of the same month
    const old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);

    const blob = Utilities.newBlob(Utilities.base64Decode(body.data), MimeType.MICROSOFT_EXCEL, name);
    const file = folder.createFile(blob);
    return out({ ok: true, name: name, url: file.getUrl() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
