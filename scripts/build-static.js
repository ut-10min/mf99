
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const esc = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const write = (p, s) => { const out = path.join(DIST, p); mkdir(path.dirname(out)); fs.writeFileSync(out, s, "utf8"); };

function copy(src, dest = src) {
  const from = path.join(ROOT, src);
  const to = path.join(DIST, dest);
  if (!fs.existsSync(from)) return;
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    mkdir(to);
    for (const name of fs.readdirSync(from)) copy(path.join(src, name), path.join(dest, name));
  } else {
    mkdir(path.dirname(to));
    fs.copyFileSync(from, to);
  }
}

function setConfig(html, key, value, asHtml = false) {
  if (!value) return html;
  const k = key.replace(".", "\\.");
  const re = new RegExp(`(<[^>]+data-config="${k}"[^>]*>)([\\s\\S]*?)(<\\/[^>]+>)`, "g");
  return html.replace(re, `$1${asHtml ? value : esc(value)}$3`);
}
function setMeta(html, key, value) {
  if (!value) return html;
  const k = key.replace(".", "\\.");
  const re = new RegExp(`(<meta[^>]+data-meta-config="${k}"[^>]+content=")[^"]*(")`, "g");
  return html.replace(re, `$1${esc(value)}$2`);
}
function setTitle(html, key, value) {
  if (!value) return html;
  const k = key.replace(".", "\\.");
  const re = new RegExp(`<title[^>]+data-config="${k}"[^>]*>[\\s\\S]*?<\\/title>`, "g");
  return html.replace(re, `<title data-config="${key}">${esc(value)}</title>`);
}
function setLinks(html, links, sns) {
  html = html.replace(/(<a\b[^>]*data-link="([^"]+)"[^>]*\bhref=")[^"]*(")/g, (_, a, k, b) => a + esc(links[k] || "#") + b);
  html = html.replace(/(<a\b(?=[^>]*\bhref="[^"]*")(?=[^>]*data-link="([^"]+)")[^>]*\bhref=")[^"]*(")/g, (_, a, k, b) => a + esc(links[k] || "#") + b);
  html = html.replace(/(<a\b[^>]*data-sns="([^"]+)"[^>]*\bhref=")[^"]*(")/g, (_, a, k, b) => a + esc(sns[k] || "#") + b);
  html = html.replace(/(<a\b(?=[^>]*\bhref="[^"]*")(?=[^>]*data-sns="([^"]+)")[^>]*\bhref=")[^"]*(")/g, (_, a, k, b) => a + esc(sns[k] || "#") + b);
  return html;
}
function removeClientJs(html) {
  return html
    .replace(/\s*<script src="js\/common\.js"><\/script>\s*/g, "\n")
    .replace(/\s*<script src="js\/talks\.js"><\/script>\s*/g, "\n")
    .replace(/\s*<script src="js\/timetable\.js"><\/script>\s*/g, "\n");
}
function runtime(html) {
  return html.includes("embed-runtime.js") ? html : html.replace("</body>", '  <script src="js/embed-runtime.js" defer></script>\n</body>');
}
function dtHtml(text) {
  const parts = String(text || "").split("／").filter(Boolean);
  let year = "";
  if (parts[0]) {
    const m = parts[0].match(/^([0-9]{4}年)(.*)$/);
    if (m) { year = m[1]; parts[0] = m[2]; }
  }
  if (!year && /^[0-9]{4}年$/.test(parts[0] || "")) year = parts.shift();
  return (year ? `<span class="date-year-full">${esc(year)}</span>` : "") + parts.map(p => `<span class="date-main">${esc(p)}</span>`).join("");
}
function duration(item) {
  const [sh, sm] = item.start.split(":").map(Number), [eh, em] = item.end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}
function slot(item, talkMap) {
  if (!item) return "";
  const long = duration(item) >= 50 ? " is-long-slot" : "";
  const badge = `<span class="duration-badge">${duration(item)}分</span>`;
  if (item.type === "break") return `<div class="slot-card break-slot-card${long}">${badge}<div class="break-slot">${esc(item.title || "休憩")}</div></div>`;
  const t = talkMap[item.talkId];
  if (!t) return `<div class="slot-card slot-detail-card${long}">${badge}<div class="break-slot">講演情報未設定</div></div>`;
  return `<div class="slot-card slot-detail-card${long}">
    ${badge}
    <div class="slot-detail-inner">
      <button class="talk-toggle" type="button" aria-expanded="false" aria-label="${esc(t.title)} の詳細を開く">
        <span class="slot-detail-title">${esc(t.title)}</span>
        <span class="slot-detail-speaker"><b>講演者：</b>${esc(t.speaker)}</span>
        <span class="slot-open-label">詳細を開く</span>
      </button>
      <div class="slot-detail" role="region" aria-label="${esc(t.title)} の講演詳細">
        <p class="slot-detail-affiliation"><b>所属・専攻：</b>${esc(t.affiliation)}｜${esc(t.field)}</p>
        <p class="slot-detail-abstract"><b>要旨：</b>${esc(t.description || "講演概要は準備中です。")}</p>
      </div>
    </div>
  </div>`;
}
function commonPage(html, cfg, page) {
  html = setMeta(html, `metaDescriptions.${page}`, cfg.metaDescriptions?.[page]);
  html = setTitle(html, `pageTitles.${page}`, cfg.pageTitles?.[page]);
  html = setConfig(html, "labels.top", cfg.labels?.top);
  html = setLinks(html, cfg.links || {}, cfg.sns || {});
  return html;
}
function renderMembers(cfg) {
  const ms = cfg.organizer?.members || [];
  if (!ms.length) return "";
  const groups = new Map();
  for (const m of ms) {
    const role = typeof m === "string" ? "運営メンバー" : (m.role || m.group || "運営メンバー");
    const name = typeof m === "string" ? m : (m.name || "");
    if (!name) continue;
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(name);
  }
  return [...groups.entries()].map(([role, names]) => {
    const roleHtml = role === "運営メンバー" ? "" : `<span class="member-role">${esc(role)}</span>`;
    const cls = role === "運営メンバー" ? "member-group member-group-no-role" : "member-group";
    return `<li class="${cls}">${roleHtml}<span class="member-names">${names.map(n=>`<span class="member-chip">${esc(n)}</span>`).join("")}</span></li>`;
  }).join("");
}
function renderIndex(cfg) {
  let html = commonPage(read("index.html"), cfg, "index");
  html = setConfig(html, "dateTimeText", dtHtml(cfg.dateTimeText), true);
  html = setConfig(html, "venueName", cfg.venueName);
  html = setConfig(html, "venueAddress", cfg.venueAddress);
  html = setConfig(html, "organizer.representative", cfg.organizer?.representative);
  html = html.replace(/<div class="video-container" id="video-container">[\s\S]*?<\/div>/, `<div class="video-container" id="video-container" data-embed="youtube" data-src="${esc(cfg.links?.youtubeEmbed || "")}"><p class="section-note">紹介動画を読み込めませんでした。</p></div>`);
  html = html.replace(/<div class="map-container" id="map-container">[\s\S]*?<\/div>/, `<div class="map-container" id="map-container" data-embed="map" data-src="${esc(cfg.links?.mapEmbed || "")}"><p class="section-note">地図を読み込めませんでした。Google Mapボタンからご確認ください。</p></div>`);
  const members = renderMembers(cfg);
  if (members) html = html.replace(/<div id="organizer-members" class="organizer-members" hidden>[\s\S]*?<\/div>/, `<div id="organizer-members" class="organizer-members"><h3>運営メンバー</h3><ul id="organizer-members-list">${members}</ul></div>`);
  return runtime(removeClientJs(html));
}
function renderTalks(cfg, talks, schedule) {
  let html = commonPage(read("talks.html"), cfg, "talks");
  const byTalk = new Map();
  for (const item of schedule) if (item.type === "talk") {
    if (!byTalk.has(item.talkId)) byTalk.set(item.talkId, []);
    byTalk.get(item.talkId).push(`${item.dateLabel} ${item.start}–${item.end}`);
  }
  const cards = [...talks].sort((a,b)=>String(a.speakerKana||a.speaker||"").localeCompare(String(b.speakerKana||b.speaker||""),"ja")).map(t =>
    `<article class="talk-card" id="${esc(t.id)}"><h3>${esc(t.title)}</h3><p class="talk-meta"><b>${esc(t.speaker)}</b>｜${esc(t.affiliation)}｜${esc(t.field)}</p><p>${esc(t.description || "講演概要は準備中です。")}</p><p class="talk-schedule"><b>登壇予定：</b>${esc((byTalk.get(t.id)||[]).join("、") || "調整中")}</p></article>`
  ).join("\n");
  html = html.replace(/<div id="talks-list" class="talk-card-grid" aria-live="polite"><\/div>/, `<div id="talks-list" class="talk-card-grid">${cards}</div>`);
  return removeClientJs(html);
}
function renderTimetable(cfg, talks, schedule) {
  let html = commonPage(read("timetable.html"), cfg, "timetable");
  const talkMap = Object.fromEntries(talks.map(t => [t.id, t]));
  const sorted = [...schedule].sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  const days = [...new Map(sorted.map(i=>[i.date, i.dateLabel])).entries()];
  const times = [...new Set(sorted.map(i=>`${i.start}-${i.end}`))].sort();
  const byKey = new Map(sorted.map(i=>[`${i.date}|${i.start}-${i.end}`, i]));
  const table = `<table class="timetable-table timetable-table-enhanced"><thead><tr><th>時間</th>${days.map(([,l])=>`<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${times.map(time=>`<tr><th>${esc(time.replace("-","–"))}</th>${days.map(([d])=>`<td>${slot(byKey.get(`${d}|${time}`), talkMap)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const grouped = new Map();
  for (const item of sorted) { if (!grouped.has(item.date)) grouped.set(item.date, []); grouped.get(item.date).push(item); }
  const mobile = [...grouped.entries()].map(([date, items], i) => ({ date, label: items[0].dateLabel, items, i }));
  const tabs = mobile.map(d=>`<button type="button" data-date="${esc(d.date)}" aria-selected="${d.i===0?"true":"false"}">${esc(d.label)}</button>`).join("");
  const panels = mobile.map(d=>`<div class="mobile-day-panel" data-date="${esc(d.date)}"${d.i===0?"":" hidden"}>${d.items.map(item=>`<article class="mobile-slot"><div class="mobile-time">${esc(item.start)}–${esc(item.end)}</div>${slot(item,talkMap)}</article>`).join("")}</div>`).join("");
  html = html.replace(/<div id="day-tabs" class="day-tabs" aria-label="日付切り替え"><\/div>/, `<div id="day-tabs" class="day-tabs" aria-label="日付切り替え">${tabs}</div>`);
  html = html.replace(/<div id="timetable-desktop" class="timetable-desktop table-wrapper"><\/div>/, `<div id="timetable-desktop" class="timetable-desktop table-wrapper">${table}</div>`);
  html = html.replace(/<div id="timetable-mobile" class="timetable-mobile"><\/div>/, `<div id="timetable-mobile" class="timetable-mobile">${panels}</div>`);
  return runtime(removeClientJs(html));
}
function writeRuntime() {
  write("js/embed-runtime.js", `document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll("[data-embed]").forEach(function(c){var s=c.getAttribute("data-src");if(!s)return;var f=document.createElement("iframe");f.src=s;f.title=c.dataset.embed==="map"?"会場のGoogle Map":"紹介動画";f.loading="lazy";f.referrerPolicy="no-referrer-when-downgrade";f.allowFullscreen=true;if(c.dataset.embed==="youtube")f.allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";c.innerHTML="";c.appendChild(f)});document.addEventListener("click",function(e){var b=e.target.closest(".talk-toggle");if(!b)return;var d=b.parentElement.querySelector(".slot-detail");var l=b.querySelector(".slot-open-label");var o=d.classList.toggle("is-open");b.setAttribute("aria-expanded",o?"true":"false");if(l)l.textContent=o?"詳細を閉じる":"詳細を開く"});document.addEventListener("click",function(e){var b=e.target.closest("#day-tabs button[data-date]");if(!b)return;var t=b.parentElement;t.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-selected",x===b?"true":"false")});document.querySelectorAll("#timetable-mobile .mobile-day-panel").forEach(function(p){p.hidden=p.dataset.date!==b.dataset.date})})});`);
}
function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  mkdir(DIST);
  copy("css"); copy("img"); copy("data");
  for (const f of fs.readdirSync(ROOT)) if (/^google.*\.html$/.test(f)) copy(f);
  const cfg = JSON.parse(read("data/config.json"));
  const talks = JSON.parse(read("data/talks.json"));
  const schedule = JSON.parse(read("data/schedule.json"));
  write("index.html", renderIndex(cfg));
  write("talks.html", renderTalks(cfg, talks, schedule));
  write("timetable.html", renderTimetable(cfg, talks, schedule));
  writeRuntime();
  console.log("Built static site to dist/");
}
main();
