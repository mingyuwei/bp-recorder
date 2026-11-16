'use strict';
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日一二三四五六';
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStartOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
/** yy/mm/dd */
const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${y.slice(2)}/${m}/${d}`; };
const fmtDateWd = (s) => `${fmtDate(s)}（${WD[parseDate(s).getDay()]}）`;
/** 12-hour, e.g. 下午2:00 */
const fmtTime = (t) => { let [h, m] = t.split(':').map(Number); const ap = h < 12 ? '上午' : '下午'; h = h % 12 || 12; return `${ap}${h}:${pad(m)}`; };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const r0 = (x) => (x == null ? '–' : Math.round(x));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const uid = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const cmp = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

/* ---------- storage ---------- */
const KEY = 'bp.records.v1', SKEY = 'bp.settings.v1';
const safeJSON = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
let records = [];
let settings = { seenReport: '', dailyTime: '08:00' };
try { records = safeJSON(localStorage.getItem(KEY), []); } catch {}
try { Object.assign(settings, safeJSON(localStorage.getItem(SKEY), {})); } catch {}
records.sort(cmp);
function persist() {
  records.sort(cmp);
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch (e) { toast('儲存失敗：' + e.message); }
}
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {} }
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

/* ---------- classification ---------- */
function category(s, d) {
  if (s > 180 || d > 120) return { k: 'crisis', t: '請再量一次' };
  if (s >= 140 || d >= 90) return { k: 'h2', t: '需注意' };
  if (s >= 130 || d >= 80) return { k: 'h1', t: '多留意' };
  if (s >= 120) return { k: 'elev', t: '正常偏上' };
  if (s < 90 || d < 60) return { k: 'low', t: '血壓偏低' };
  return { k: 'ok', t: '正常' };
}
const badge = (c) => `<span class="badge b-${c.k}">${c.t}</span>`;

/* ---------- stats ---------- */
function stats(list) {
  if (!list.length) return null;
  const sys = list.map((r) => r.sys), dia = list.map((r) => r.dia), pul = list.filter((r) => r.pulse).map((r) => r.pulse);
  const part = (l) => (l.length ? { n: l.length, sys: avg(l.map((r) => r.sys)), dia: avg(l.map((r) => r.dia)) } : null);
  return {
    n: list.length, sys: avg(sys), dia: avg(dia), pulse: avg(pul),
    sysMax: Math.max(...sys), sysMin: Math.min(...sys), diaMax: Math.max(...dia), diaMin: Math.min(...dia),
    am: part(list.filter((r) => r.time < '12:00')), pm: part(list.filter((r) => r.time >= '12:00')),
  };
}
function weeks(list = records) {
  const m = new Map();
  for (const r of list) {
    const k = isoDate(weekStartOf(parseDate(r.date)));
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, l]) => ({ start: k, end: isoDate(addDays(parseDate(k), 6)), list: l, s: stats(l) }));
}
/** The most recent week (Sun–Sat) whose report has been released (released every Sunday 10:00). */
function latestReportStart(now = new Date()) {
  const s = weekStartOf(now);
  const release = new Date(s); release.setHours(10, 0, 0, 0);
  return isoDate(addDays(s, now >= release ? -7 : -14));
}

/* ---------- voice / quick text parsing ---------- */
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnNum(s) {
  if (!/[十百]/.test(s)) return Number([...s].map((c) => CN[c]).join(''));
  let total = 0, cur = 0, last = 1;
  for (const c of s) {
    if (c in CN) cur = CN[c];
    else if (c === '百') { total += (cur || 1) * 100; cur = 0; last = 100; }
    else if (c === '十') { total += (cur || 1) * 10; cur = 0; last = 10; }
  }
  if (cur && last === 100 && !/[零〇]/.test(s)) cur *= 10; // 一百二 → 120
  return total + cur;
}
function parseSpoken(raw) {
  let t = ' ' + raw.replace(/[零〇一二兩两三四五六七八九十百]+/g, (m) => cnNum(m))
    .replace(/／/g, '/').replace(/：/g, ':').replace(/[，。,]/g, ' ') + ' ';
  const out = {}, today = new Date();
  // relative day
  if (/前天/.test(t)) out.date = isoDate(addDays(today, -2));
  else if (/昨天|昨日|昨晚/.test(t)) out.date = isoDate(addDays(today, -1));
  else if (/今天|今晚|今早/.test(t)) out.date = isoDate(today);
  t = t.replace(/昨晚|今晚/g, ' 晚上 ').replace(/今早/g, ' 早上 ').replace(/前天|昨天|昨日|今天/g, ' ');
  // explicit month/day
  const md = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]?/);
  if (md && +md[1] <= 12 && +md[2] <= 31) {
    let d = new Date(today.getFullYear(), +md[1] - 1, +md[2]);
    if (d > today) d = new Date(today.getFullYear() - 1, +md[1] - 1, +md[2]);
    out.date = isoDate(d); t = t.replace(md[0], ' ');
  }
  // time
  const PER = /上午|早上|清晨|凌晨|中午|下午|傍晚|晚上|夜裡|\bam\b|\bpm\b/i;
  const tm = t.match(/(上午|早上|清晨|凌晨|中午|下午|傍晚|晚上|夜裡)?\s*(\d{1,2})\s*(?:點|点|時|:)(半|\d{1,2}(?!\d))?分?/);
  if (tm) {
    let h = +tm[2];
    const mi = tm[3] === '半' ? 30 : tm[3] ? +tm[3] : 0;
    const per = (tm[1] || (t.match(PER) || [''])[0]).toLowerCase();
    if (/下午|傍晚|晚上|夜|pm/.test(per) && h < 12) h += 12;
    else if (per === '中午' && h < 11) h += 12;
    else if (/上午|早上|清晨|凌晨|am/.test(per) && h === 12) h = 0;
    if (h <= 23 && mi <= 59) { out.time = `${pad(h)}:${pad(mi)}`; t = t.replace(tm[0], ' '); }
  }
  t = t.replace(new RegExp(PER.source, 'gi'), ' ');
  // labelled values
  const grab = (re) => { const m = t.match(re); if (m) { t = t.replace(m[0], ' '); return +m[1]; } };
  out.sys = grab(/(?:收縮壓?|收缩压?|高壓|上壓|systolic)\D{0,4}?(\d{2,3})/i);
  out.dia = grab(/(?:舒張壓?|舒张压?|低壓|下壓|diastolic)\D{0,4}?(\d{2,3})/i);
  out.pulse = grab(/(?:脈搏|脉搏|心跳|心率|脈|pulse)\D{0,4}?(\d{2,3})/i);
  // remaining numbers in order: sys, dia, pulse
  const nums = (t.match(/\d{2,3}/g) || []).map(Number);
  for (const k of ['sys', 'dia', 'pulse']) if (out[k] == null && nums.length) out[k] = nums.shift();
  if (out.sys && out.dia && out.sys < out.dia) [out.sys, out.dia] = [out.dia, out.sys];
  for (const k in out) if (out[k] == null) delete out[k];
  return out;
}

/* ---------- forms ---------- */
const FIELDS = `
  <div class="voice-row">
    <button type="button" class="mic" aria-label="語音輸入">🎤</button>
    <input type="text" name="quick" placeholder="說或打：下午2點 125 80 脈搏72" enterkeyhint="done">
  </div>
  <div class="row2">
    <label>日期<input type="date" name="date" required></label>
    <label>時間<input type="time" name="time" required></label>
  </div>
  <div class="when"></div>
  <div class="row3">
    <label>收縮壓<input type="number" name="sys" inputmode="numeric" pattern="[0-9]*" placeholder="120"></label>
    <label>舒張壓<input type="number" name="dia" inputmode="numeric" pattern="[0-9]*" placeholder="80"></label>
    <label>脈搏<input type="number" name="pulse" inputmode="numeric" pattern="[0-9]*" placeholder="選填"></label>
  </div>
  <label>備註<input type="text" name="note" placeholder="選填，例如：服藥前、運動後" maxlength="100"></label>
  <div class="cat"></div>`;

function setupForm(form) {
  $('.fields', form).innerHTML = FIELDS;
  const el = form.elements;
  const update = () => {
    $('.when', form).textContent = el.date.value && el.time.value ? `${fmtDateWd(el.date.value)} ${fmtTime(el.time.value)}` : '';
    const s = +el.sys.value, d = +el.dia.value;
    $('.cat', form).innerHTML = s && d ? `${badge(category(s, d))} <small class="muted">${s}/${d} mmHg</small>` : '';
  };
  form._update = update;
  ['date', 'time', 'sys', 'dia'].forEach((n) => el[n].addEventListener('input', update));
  // auto-advance: after typing 3 digits of systolic, jump to diastolic
  el.sys.addEventListener('input', () => { if (el.sys.value.length >= 3) el.dia.focus(); });
  el.quick.addEventListener('change', () => applyQuick(form));
  el.quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyQuick(form); el.quick.blur(); } });
  $('.mic', form).addEventListener('click', () => startVoice(form));
}
function fillForm(form, r) {
  const el = form.elements;
  el.date.value = r.date; el.time.value = r.time;
  el.sys.value = r.sys ?? ''; el.dia.value = r.dia ?? ''; el.pulse.value = r.pulse ?? '';
  el.note.value = r.note ?? ''; el.quick.value = '';
  form._update();
}
function readForm(form) {
  const el = form.elements;
  const sys = +el.sys.value, dia = +el.dia.value, pulse = el.pulse.value ? +el.pulse.value : null;
  let err = '';
  if (!el.date.value || !el.time.value) err = '請填寫日期與時間';
  else if (!sys || sys < 50 || sys > 300) err = '收縮壓請輸入 50–300';
  else if (!dia || dia < 30 || dia > 200) err = '舒張壓請輸入 30–200';
  else if (sys <= dia) err = '收縮壓應大於舒張壓';
  else if (pulse != null && (pulse < 30 || pulse > 220)) err = '脈搏請輸入 30–220';
  if (err) { toast(err); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return null; }
  return { date: el.date.value, time: el.time.value, sys, dia, pulse, note: el.note.value.trim() };
}
function applyQuick(form) {
  const el = form.elements, txt = el.quick.value.trim();
  if (!txt) return;
  const p = parseSpoken(txt);
  for (const k of ['date', 'time', 'sys', 'dia', 'pulse']) if (p[k] != null) el[k].value = p[k];
  form._update();
  if (p.sys && p.dia) toast(`已辨識：${p.sys}/${p.dia}${p.pulse ? ' 脈搏' + p.pulse : ''}${p.time ? ' ' + fmtTime(p.time) : ''}，確認後按儲存`);
  else toast('沒聽清楚數值，請再說一次或直接輸入');
}
let activeRec = null;
function startVoice(form) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const q = form.elements.quick, btn = $('.mic', form);
  const fallback = () => { q.focus(); toast('請按鍵盤上的 🎤 聽寫，例如說「下午兩點 125 80」'); };
  if (!SR) return fallback();
  if (activeRec) { activeRec.stop(); return; }
  const rec = new SR();
  rec.lang = 'zh-TW'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let gotFinal = false;
  rec.onresult = (e) => {
    q.value = [...e.results].map((r) => r[0].transcript).join('');
    if (e.results[e.results.length - 1].isFinal) { gotFinal = true; applyQuick(form); }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fallback();
    else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('語音辨識失敗，可改用鍵盤上的 🎤 聽寫');
  };
  rec.onend = () => { btn.classList.remove('listening'); activeRec = null; if (!gotFinal && q.value) applyQuick(form); };
  try { rec.start(); activeRec = rec; btn.classList.add('listening'); toast('請說：「下午兩點 125 80 脈搏72」'); }
  catch { fallback(); }
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.classList.remove('show'); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 3000);
}

/* ---------- record list markup ---------- */
function recItem(r, showDate) {
  const c = category(r.sys, r.dia);
  return `<li class="rec" data-id="${esc(r.id)}">
    <div class="rec-time">${showDate ? `<span class="d">${fmtDate(r.date)}</span>` : ''}${fmtTime(r.time)}</div>
    <div class="rec-val"><b>${r.sys}/${r.dia}</b>${r.pulse ? `<small>♥ ${r.pulse}</small>` : ''}
      ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</div>
    ${badge(c)}<span class="chev">›</span></li>`;
}
function groupedList(list) {
  if (!list.length) return '<p class="empty">這段期間沒有紀錄</p>';
  const by = new Map();
  for (const r of [...list].sort(cmp).reverse()) { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r); }
  return [...by.entries()].map(([d, l]) => {
    const s = stats(l);
    return `<div class="day-h">${fmtDateWd(d)}${l.length > 1 ? `<span>平均 ${r0(s.sys)}/${r0(s.dia)}</span>` : ''}</div>
      <ul class="recs">${l.map((r) => recItem(r)).join('')}</ul>`;
  }).join('');
}

/* ---------- home ---------- */
function renderHome() {
  $('#todayLabel').textContent = fmtDateWd(isoDate(new Date()));
  const k = latestReportStart(), ws = weeks();
  const w = ws.find((x) => x.start === k);
  const endK = isoDate(addDays(parseDate(k), 6));
  const cur = ws.find((x) => x.start === isoDate(weekStartOf(new Date())));
  const curLine = cur ? `<small class="muted">本週目前 ${cur.s.n} 次，平均 ${r0(cur.s.sys)}/${r0(cur.s.dia)}</small>` : '';
  let html;
  if (!w) {
    html = `<div class="card report" data-go="week"><div class="report-head"><span>📊 週報</span><small class="muted">每週日 10:00 結算</small></div>
      <p class="muted" style="margin:6px 0">上週（${fmtDate(k)} – ${fmtDate(endK)}）沒有紀錄。</p>${curLine}</div>`;
  } else {
    const isNew = settings.seenReport !== k;
    html = `<div class="card report ${isNew ? 'new' : ''}" data-go="week">
      <div class="report-head"><span>📊 上週平均${isNew ? '<span class="pill">NEW</span>' : ''}</span><small class="muted">${fmtDate(w.start)} – ${fmtDate(w.end)}</small></div>
      <div class="report-val"><span class="big">${r0(w.s.sys)}/${r0(w.s.dia)}</span><span class="unit">mmHg</span>${badge(category(w.s.sys, w.s.dia))}</div>
      <small class="muted">量測 ${w.s.n} 次${w.s.pulse ? ` · 脈搏 ${r0(w.s.pulse)}` : ''}${w.s.am && w.s.pm ? ` · 早 ${r0(w.s.am.sys)}/${r0(w.s.am.dia)} 晚 ${r0(w.s.pm.sys)}/${r0(w.s.pm.dia)}` : ''}</small><br>${curLine}</div>`;
    if (isNew && $('#view-add').classList.contains('active') && document.visibilityState === 'visible') { settings.seenReport = k; saveSettings(); }
  }
  $('#reportBanner').innerHTML = html;
  const recent = [...records].reverse().slice(0, 6);
  $('#recentList').innerHTML = recent.length
    ? `<ul class="recs">${recent.map((r) => recItem(r, true)).join('')}</ul>`
    : '<p class="empty">還沒有紀錄，從上方開始第一筆吧 🐱</p>';
}

/* ---------- calendar ---------- */
const today0 = new Date();
const cal = { y: today0.getFullYear(), m: today0.getMonth(), day: null, picker: false, py: today0.getFullYear() };
const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const monthRecords = (y, m) => records.filter((r) => r.date.startsWith(monthKey(y, m)));
function renderCal() {
  $('#calTitle').textContent = `${cal.y}年${cal.m + 1}月`;
  const list = monthRecords(cal.y, cal.m);
  const by = new Map();
  for (const r of list) { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r); }
  const first = new Date(cal.y, cal.m, 1), days = new Date(cal.y, cal.m + 1, 0).getDate(), todayS = isoDate(new Date());
  let g = [...WD].map((w) => `<div class="wd">${w}</div>`).join('');
  g += '<div></div>'.repeat(first.getDay());
  for (let d = 1; d <= days; d++) {
    const ds = `${monthKey(cal.y, cal.m)}-${pad(d)}`, l = by.get(ds);
    let inner = '';
    if (l) {
      const s = stats(l), c = category(s.sys, s.dia);
      inner = `<span class="v">${r0(s.sys)}/${r0(s.dia)}</span><span class="dot b-${c.k}"></span>`;
    }
    const cls = ['day', l && 'has', ds === todayS && 'today', ds === cal.day && 'sel'].filter(Boolean).join(' ');
    g += `<button class="${cls}" data-day="${ds}" aria-label="${fmtDate(ds)}${l ? `，${l.length}筆` : ''}">${d}${inner}</button>`;
  }
  $('#calGrid').innerHTML = `<div class="grid">${g}</div>`;

  const picker = $('#monthPicker');
  picker.hidden = !cal.picker;
  $('#calGrid').hidden = cal.picker;
  if (cal.picker) {
    let mh = '';
    for (let m = 0; m < 12; m++) {
      const n = monthRecords(cal.py, m).length;
      mh += `<button class="mbtn ${cal.py === cal.y && m === cal.m ? 'cur' : ''} ${n ? '' : 'none'}" data-month="${m}">${m + 1}月<small>${n ? n + ' 筆' : '—'}</small></button>`;
    }
    picker.innerHTML = `<div class="yr"><button class="icon-btn" data-py="-1" aria-label="前一年">‹</button>${cal.py} 年<button class="icon-btn" data-py="1" aria-label="後一年">›</button></div><div class="months">${mh}</div>`;
  }

  const shown = cal.day ? list.filter((r) => r.date === cal.day) : list;
  const s = stats(list);
  $('#monthStats').innerHTML = `<div class="report-head" style="margin-bottom:10px"><span>${cal.m + 1}月 統計</span>
      ${list.length ? `<button class="btn" id="expMonth" style="min-height:36px;padding:6px 12px">📤 匯出本月</button>` : ''}</div>` +
    (s ? `<div class="statrow">
      <div class="stat"><b>${r0(s.sys)}/${r0(s.dia)}</b><span>平均</span></div>
      <div class="stat"><b>${s.sysMax}/${s.diaMax}</b><span>最高</span></div>
      <div class="stat"><b>${s.n}</b><span>次數</span></div></div>
      <div style="margin-top:10px">${badge(category(s.sys, s.dia))}${s.pulse ? ` <small class="muted">平均脈搏 ${r0(s.pulse)}</small>` : ''}</div>`
      : '<p class="empty">本月沒有紀錄</p>');
  $('#monthList').innerHTML = (cal.day ? `<button class="filter-chip" id="clearDay">${fmtDateWd(cal.day)} ✕</button>` : `<h2>${cal.m + 1}月 全部紀錄</h2>`) + groupedList(shown);
}
function shiftMonth(n) {
  const d = new Date(cal.y, cal.m + n, 1);
  cal.y = d.getFullYear(); cal.m = d.getMonth(); cal.py = cal.y; cal.day = null;
  renderCal();
}

/* ---------- weekly ---------- */
function chartSVG(ws) {
  if (ws.length < 2) return '<p class="muted">累積兩週以上的紀錄後，這裡會顯示趨勢圖。</p>';
  const W = 340, H = 180, pl = 30, pr = 12, pt = 14, pb = 26;
  const vals = ws.flatMap((w) => [w.s.sys, w.s.dia]);
  const lo = Math.min(65, ...vals) - 5, hi = Math.max(145, ...vals) + 5;
  const x = (i) => pl + (i * (W - pl - pr)) / (ws.length - 1);
  const y = (v) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
  const line = (k, color) => `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${ws.map((w, i) => `${x(i).toFixed(1)},${y(w.s[k]).toFixed(1)}`).join(' ')}"/>` +
    ws.map((w, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(w.s[k]).toFixed(1)}" r="3.5" fill="${color}"><title>${fmtDate(w.start)}：${r0(w.s[k])}</title></circle>`).join('');
  const refs = [[80, 'var(--dia)'], [130, 'var(--sys)']].map(([v, c]) => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-opacity=".45" stroke-dasharray="4 4"/><text x="${pl - 4}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`).join('');
  const step = Math.ceil(ws.length / 6);
  const labels = ws.map((w, i) => (i % step === 0 || i === ws.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${w.start.slice(5).replace('-', '/')}</text>` : '').join('');
  const lastI = ws.length - 1;
  const lastLbl = (k, color, dy) => `<text x="${x(lastI)}" y="${y(ws[lastI].s[k]) + dy}" text-anchor="end" font-size="11" font-weight="700" fill="${color}">${r0(ws[lastI].s[k])}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每週平均血壓趨勢">${refs}${line('sys', 'var(--sys)')}${line('dia', 'var(--dia)')}${lastLbl('sys', 'var(--sys)', -8)}${lastLbl('dia', 'var(--dia)', 16)}${labels}</svg>
    <div class="legend"><span><i style="background:var(--sys)"></i>收縮壓</span><span><i style="background:var(--dia)"></i>舒張壓</span><span>虛線：目標 130/80</span></div>`;
}
function renderWeek() {
  const ws = weeks();
  $('#weekChart').innerHTML = chartSVG(ws.slice(0, 12).reverse());
  const curStart = isoDate(weekStartOf(new Date()));
  const released = latestReportStart();
  $('#weekList').innerHTML = ws.length ? ws.map((w) => {
    const c = category(w.s.sys, w.s.dia);
    const status = w.start === curStart ? '<span class="pill">進行中</span>' : w.start > released ? '<span class="pill">週日10:00結算</span>' : '';
    return `<div class="week"><div class="week-top"><div><div class="muted" style="font-size:13px">${fmtDate(w.start)} – ${fmtDate(w.end)} ${status}</div>
      <b>${r0(w.s.sys)}/${r0(w.s.dia)}</b> <small class="muted">mmHg</small></div>${badge(c)}</div>
      <div class="week-sub">量測 ${w.s.n} 次${w.s.pulse ? ` · 脈搏 ${r0(w.s.pulse)}` : ''} · 範圍 ${w.s.sysMin}–${w.s.sysMax} / ${w.s.diaMin}–${w.s.diaMax}
      ${w.s.am ? `<br>早上平均 ${r0(w.s.am.sys)}/${r0(w.s.am.dia)}（${w.s.am.n}次）` : ''}${w.s.pm ? `${w.s.am ? ' · ' : '<br>'}下午/晚上 ${r0(w.s.pm.sys)}/${r0(w.s.pm.dia)}（${w.s.pm.n}次）` : ''}</div></div>`;
  }).join('') : '<p class="empty">還沒有紀錄</p>';
}

/* ---------- settings ---------- */
function renderSettings() {
  $('#dailyTime').value = settings.dailyTime;
  if (!$('#expFrom').value) $('#expFrom').value = records[0]?.date || isoDate(new Date());
  if (!$('#expTo').value) $('#expTo').value = isoDate(new Date());
  const first = records[0], last = records[records.length - 1];
  $('#driveUrl').value = settings.driveUrl || '';
  $('#driveSecret').value = settings.driveSecret || '';
  $('#driveAuto').checked = settings.driveAuto !== false;
  const lu = settings.lastUpload;
  $('#driveStatus').innerHTML = `<small>${!driveReady() ? '尚未設定' : lu ? `上次上傳：${esc(lu.name)}（${fmtDate(isoDate(new Date(lu.at)))} ${fmtTime(new Date(lu.at).toTimeString().slice(0, 5))}）` : '已設定，尚未上傳'}${settings.lastUploadError ? `<br>⚠️ 上次自動上傳失敗：${esc(settings.lastUploadError)}` : ''}</small>`;
  $('#dataInfo').innerHTML =`<small>目前共 ${records.length} 筆紀錄${first ? `（${fmtDate(first.date)} – ${fmtDate(last.date)}）` : ''}</small>`;
}
function renderAll() { renderHome(); renderCal(); renderWeek(); renderSettings(); if (typeof autoUpload === 'function' && booted) autoUpload(); }
let booted = false;

/* ---------- export / files ---------- */
async function saveBlob(blob, name) {
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function exportExcel(list, label) {
  if (!list.length) return toast('此範圍沒有紀錄');
  saveBlob(buildWorkbook(list), `血壓紀錄_${label}.xlsx`);
}
function buildWorkbook(list) {
  const asc = [...list].sort(cmp);
  const one = (x) => (x == null ? '' : Math.round(x * 10) / 10);
  const recRows = [['日期', '星期', '時間', '收縮壓', '舒張壓', '脈搏', '分類', '備註'],
    ...asc.map((r) => [{ date: r.date }, '週' + WD[parseDate(r.date).getDay()], fmtTime(r.time), r.sys, r.dia, r.pulse ?? '', category(r.sys, r.dia).t, r.note || ''])];
  const wkRows = [['週起(日)', '週迄(六)', '次數', '平均收縮壓', '平均舒張壓', '平均脈搏', '早上平均收縮壓', '早上平均舒張壓', '下午晚上平均收縮壓', '下午晚上平均舒張壓', '最高收縮壓', '最高舒張壓', '分類'],
    ...weeks(asc).reverse().map((w) => [{ date: w.start }, { date: w.end }, w.s.n, one(w.s.sys), one(w.s.dia), one(w.s.pulse), one(w.s.am?.sys), one(w.s.am?.dia), one(w.s.pm?.sys), one(w.s.pm?.dia), w.s.sysMax, w.s.diaMax, category(w.s.sys, w.s.dia).t])];
  const months = new Map();
  for (const r of asc) { const k = r.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(r); }
  const moRows = [['月份', '次數', '平均收縮壓', '平均舒張壓', '平均脈搏', '最高收縮壓', '最低收縮壓', '分類'],
    ...[...months.entries()].map(([k, l]) => { const s = stats(l); return [k.slice(2).replace('-', '/'), s.n, one(s.sys), one(s.dia), one(s.pulse), s.sysMax, s.sysMin, category(s.sys, s.dia).t]; })];
  return XLSXMini.build([
    { name: '血壓紀錄', rows: recRows, widths: [11, 7, 11, 9, 9, 8, 14, 30] },
    { name: '每週平均', rows: wkRows, widths: [11, 11, 7, 11, 11, 10, 14, 14, 18, 18, 11, 11, 14] },
    { name: '每月平均', rows: moRows, widths: [9, 7, 11, 11, 10, 11, 11, 14] },
  ]);
}

/* ---------- Google Drive upload (via the user's own Apps Script web app) ---------- */
const driveReady = () => !!(settings.driveUrl && settings.driveSecret);
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = rej;
  fr.readAsDataURL(blob);
});
async function drivePost(payload) {
  // text/plain body avoids a CORS preflight, which Apps Script does not answer
  const res = await fetch(settings.driveUrl, { method: 'POST', body: JSON.stringify({ secret: settings.driveSecret, ...payload }) });
  const data = await res.json().catch(() => ({ ok: false, error: '回應格式不正確，請確認網址' }));
  if (!data.ok) throw new Error(data.error || '上傳失敗');
  return data;
}
/** A short signature of a month's records, so edits after upload trigger a re-upload. */
function monthSig(list) {
  let h = 0;
  for (const c of JSON.stringify(list.map((r) => [r.date, r.time, r.sys, r.dia, r.pulse, r.note]))) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${list.length}:${h}`;
}
async function uploadMonth(y, m) {
  const list = monthRecords(y, m);
  if (!list.length) throw new Error(`${y}年${m + 1}月沒有紀錄`);
  const name = `血壓紀錄_${String(y).slice(2)}${pad(m + 1)}.xlsx`;
  const data = await blobToBase64(buildWorkbook(list));
  await drivePost({ name, data });
  settings.uploaded = { ...(settings.uploaded || {}), [monthKey(y, m)]: monthSig(list) };
  settings.lastUpload = { name, at: new Date().toISOString() };
  saveSettings(); renderSettings();
  return name;
}
let uploading = false;
const isLastDayOfMonth = (d = new Date()) => addDays(d, 1).getDate() === 1;
/**
 * Runs when the app opens, comes to the foreground, or a record changes.
 * - On the last day of the month: uploads this month's file (re-uploads after each new reading that day).
 * - Catch-up: if last month's file is missing or out of date (e.g. app not opened on the last day), uploads it.
 */
async function autoUpload() {
  if (uploading || !driveReady() || settings.driveAuto === false || !navigator.onLine) return;
  const d = new Date(), prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const due = [[prev.getFullYear(), prev.getMonth()]];
  if (isLastDayOfMonth(d)) due.push([d.getFullYear(), d.getMonth()]);
  uploading = true;
  try {
    for (const [y, m] of due) {
      const list = monthRecords(y, m);
      if (!list.length || settings.uploaded?.[monthKey(y, m)] === monthSig(list)) continue;
      try {
        const name = await uploadMonth(y, m);
        settings.lastUploadError = ''; saveSettings(); renderSettings();
        toast(`☁️ 已自動上傳 ${name} 到 Google 雲端硬碟`);
      } catch (e) { settings.lastUploadError = e.message; saveSettings(); renderSettings(); }
    }
  } finally { uploading = false; }
}
function nextWeekday(dow, hh, mm) {
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  while (d.getDay() !== dow || d < new Date()) d.setDate(d.getDate() + 1);
  return d;
}
function icsStamp(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; }
function downloadICS(name, uidStr, start, rrule, summary, desc) {
  const now = new Date();
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BP Recorder//ZH-TW', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${uidStr}`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${icsStamp(start)}`,
    `DURATION:PT5M`, `RRULE:${rrule}`, `SUMMARY:${summary}`, `DESCRIPTION:${desc}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* ---------- events ---------- */
const addForm = $('#addForm'), editForm = $('#editForm'), dlg = $('#editDlg');
setupForm(addForm); setupForm(editForm);
function resetAdd() {
  fillForm(addForm, { date: isoDate(new Date()), time: nowTime() });
}
resetAdd();

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const r = readForm(addForm);
  if (!r) return;
  r.id = uid();
  records.push(r); persist();
  document.activeElement?.blur();
  const c = category(r.sys, r.dia);
  toast(`已儲存 ${r.sys}/${r.dia}（${c.t}）`, { label: '復原', fn: () => { records = records.filter((x) => x.id !== r.id); persist(); renderAll(); } });
  if (c.k === 'crisis') setTimeout(() => alert('血壓超過 180/120！請休息 5 分鐘後再量一次；若仍偏高或有胸痛、頭痛、呼吸困難等症狀，請立即就醫。'), 300);
  resetAdd(); renderAll();
});

let editingId = null;
function openEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  editingId = id; fillForm(editForm, r);
  dlg.showModal();
  document.activeElement?.blur();
}
editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const r = readForm(editForm);
  if (!r) return;
  const i = records.findIndex((x) => x.id === editingId);
  if (i >= 0) { records[i] = { ...records[i], ...r }; persist(); toast('已更新'); }
  dlg.close(); renderAll();
});
$('#cancelBtn').onclick = () => dlg.close();
$('#delBtn').onclick = () => {
  const i = records.findIndex((x) => x.id === editingId);
  if (i < 0) return;
  const [removed] = records.splice(i, 1); persist(); dlg.close(); renderAll();
  toast(`已刪除 ${fmtDate(removed.date)} ${removed.sys}/${removed.dia}`, { label: '復原', fn: () => { records.push(removed); persist(); renderAll(); } });
};
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  window.scrollTo(0, 0);
  if (name === 'add') renderHome();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

document.addEventListener('click', (e) => {
  const rec = e.target.closest('.rec');
  if (rec) return openEdit(rec.dataset.id);
  const go = e.target.closest('[data-go]');
  if (go) return showTab(go.dataset.go);
  const day = e.target.closest('[data-day]');
  if (day) { cal.day = cal.day === day.dataset.day ? null : day.dataset.day; renderCal(); return; }
  const mon = e.target.closest('[data-month]');
  if (mon) { cal.y = cal.py; cal.m = +mon.dataset.month; cal.day = null; cal.picker = false; renderCal(); return; }
  const py = e.target.closest('[data-py]');
  if (py) { cal.py += +py.dataset.py; renderCal(); return; }
  if (e.target.id === 'clearDay') { cal.day = null; renderCal(); return; }
  if (e.target.id === 'expMonth') exportExcel(monthRecords(cal.y, cal.m), `${String(cal.y).slice(2)}${pad(cal.m + 1)}`);
});
$('#prevMonth').onclick = () => shiftMonth(-1);
$('#nextMonth').onclick = () => shiftMonth(1);
$('#calTitle').onclick = () => { cal.picker = !cal.picker; cal.py = cal.y; renderCal(); };
// swipe to change month
let sx = null, sy = null;
$('#calGrid').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$('#calGrid').addEventListener('touchend', (e) => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  sx = null;
}, { passive: true });

$('#expAll').onclick = () => exportExcel(records, '全部_' + fmtDate(isoDate(new Date())).replace(/\//g, ''));
$('#expRange').onclick = () => {
  const f = $('#expFrom').value, t = $('#expTo').value;
  if (!f || !t || f > t) return toast('請選擇正確的日期範圍');
  exportExcel(records.filter((r) => r.date >= f && r.date <= t), `${fmtDate(f).replace(/\//g, '')}-${fmtDate(t).replace(/\//g, '')}`);
};
$('#icsWeekly').onclick = () => downloadICS('血壓週報提醒.ics', 'bp-weekly-report@bp-recorder', nextWeekday(0, 10, 0), 'FREQ=WEEKLY;BYDAY=SU', '查看本週血壓平均', '打開「血壓紀錄」App 查看上週平均');
$('#dailyTime').onchange = (e) => { settings.dailyTime = e.target.value || '08:00'; saveSettings(); };
$('#icsDaily').onclick = () => {
  const [h, m] = ($('#dailyTime').value || '08:00').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1);
  downloadICS(`量血壓提醒_${fmtTime(`${pad(h)}:${pad(m)}`)}.ics`, `bp-daily-${pad(h)}${pad(m)}@bp-recorder`, d, 'FREQ=DAILY', '量血壓時間到了 🩺', '量完記得打開「血壓紀錄」App 記錄');
};
function saveDriveSettings() {
  settings.driveUrl = $('#driveUrl').value.trim();
  settings.driveSecret = $('#driveSecret').value.trim();
  settings.driveAuto = $('#driveAuto').checked;
  saveSettings();
}
['driveUrl', 'driveSecret', 'driveAuto'].forEach((id) => $('#' + id).addEventListener('change', () => { saveDriveSettings(); renderSettings(); }));
async function driveAction(btn, fn) {
  saveDriveSettings();
  if (!driveReady()) return toast('請先填寫上傳網址和密碼');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(settings.driveUrl)) return toast('網址應以 https://script.google.com/ 開頭');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '處理中…';
  try { toast(await fn()); settings.lastUploadError = ''; saveSettings(); renderSettings(); }
  catch (e) { toast('失敗：' + (e.message === 'Failed to fetch' || e.message === 'Load failed' ? '連線失敗，請檢查網址或網路' : e.message)); }
  finally { btn.disabled = false; btn.textContent = label; }
}
$('#driveTest').onclick = (e) => driveAction(e.target, async () => `✅ 連線成功：資料夾「${(await drivePost({ test: true })).folder}」`);
$('#driveNowPrev').onclick = (e) => driveAction(e.target, async () => {
  const p = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  return `☁️ 已上傳 ${await uploadMonth(p.getFullYear(), p.getMonth())}`;
});
$('#driveNowCur').onclick = (e) => driveAction(e.target, async () => `☁️ 已上傳 ${await uploadMonth(new Date().getFullYear(), new Date().getMonth())}`);

$('#backup').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'bp-recorder', version: 1, exported: new Date().toISOString(), records }, null, 1)], { type: 'application/json' });
  saveBlob(blob, `血壓備份_${fmtDate(isoDate(new Date())).replace(/\//g, '')}.json`);
};
$('#restoreBtn').onclick = () => $('#restoreFile').click();
$('#restoreFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const data = safeJSON(await f.text(), null);
  const list = Array.isArray(data) ? data : data?.records;
  if (!Array.isArray(list)) return toast('檔案格式不正確');
  const seen = new Set(records.map((r) => r.id)), sig = new Set(records.map((r) => `${r.date}${r.time}${r.sys}${r.dia}`));
  let added = 0;
  for (const r of list) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.date) || !/^\d{2}:\d{2}$/.test(r?.time) || !(+r.sys > 0) || !(+r.dia > 0)) continue;
    const s = `${r.date}${r.time}${r.sys}${r.dia}`;
    if (seen.has(r.id) || sig.has(s)) continue;
    records.push({ id: r.id || uid(), date: r.date, time: r.time, sys: +r.sys, dia: +r.dia, pulse: r.pulse ? +r.pulse : null, note: String(r.note || '') });
    sig.add(s); added++;
  }
  persist(); renderAll();
  toast(`已還原 ${added} 筆紀錄`);
};
$('#wipe').onclick = () => {
  if (!records.length) return toast('目前沒有資料');
  if (!confirm(`確定要刪除全部 ${records.length} 筆紀錄嗎？\n建議先「備份資料」。`)) return;
  if (!confirm('再次確認：刪除後無法復原。')) return;
  records = []; persist(); renderAll(); toast('已清除所有資料');
};

// refresh weekly banner when the Sunday 10:00 release passes or the app returns to foreground
let lastReportKey = latestReportStart(), lastDay = isoDate(new Date());
function tick() {
  const k = latestReportStart(), d = isoDate(new Date());
  if (k !== lastReportKey || d !== lastDay) {
    lastReportKey = k; lastDay = d;
    if (!dlg.open && !addForm.contains(document.activeElement)) resetAdd();
    renderAll();
  }
}
setInterval(tick, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick();
  // keep the new-record time current when coming back to the app
  if (!addForm.elements.sys.value && !dlg.open) resetAdd();
  renderHome();
  autoUpload();
});
window.addEventListener('online', autoUpload);

renderAll();
booted = true;
autoUpload();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
