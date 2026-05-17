const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const DEFAULT_TIMETABLE_DATE = "2026-05-17";

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeDist(file, content) {
  const out = path.join(DIST, file);
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, content, "utf8");
}

function copyRecursive(src, dest = src) {
  const from = path.join(ROOT, src);
  const to = path.join(DIST, dest);
  if (!fs.existsSync(from)) return;

  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    ensureDir(to);
    for (const name of fs.readdirSync(from)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }

  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function replaceByDataConfig(html, key, value, htmlMode = false) {
  if (value === undefined || value === null || value === "") return html;
  const escapedKey = key.replaceAll(".", "\\.");
  const pattern = new RegExp(`(<[^>]+data-config="${escapedKey}"[^>]*>)([\\s\\S]*?)(<\\/[^>]+>)`, "g");
  return html.replace(pattern, `$1${htmlMode ? value : escapeHtml(value)}$3`);
}

function replaceMeta(html, key, value) {
  if (!value) return html;
  const escapedKey = key.replaceAll(".", "\\.");
  const pattern = new RegExp(`(<meta[^>]+data-meta-config="${escapedKey}"[^>]+content=")[^"]*(")`, "g");
  return html.replace(pattern, `$1${escapeAttr(value)}$2`);
}

function replaceLinks(html, links = {}, sns = {}) {
  html = html.replace(/(<a\b[^>]*data-link="([^"]+)"[^>]*\bhref=")[^"]*(")/g, (_m, before, key, after) => {
    return before + escapeAttr(links[key] || "#") + after;
  });
  html = html.replace(/(<a\b(?=[^>]*\bhref="[^"]*")(?=[^>]*data-link="([^"]+)")[^>]*\bhref=")[^"]*(")/g, (_m, before, key, after) => {
    return before + escapeAttr(links[key] || "#") + after;
  });
  html = html.replace(/(<a\b[^>]*data-sns="([^"]+)"[^>]*\bhref=")[^"]*(")/g, (_m, before, key, after) => {
    return before + escapeAttr(sns[key] || "#") + after;
  });
  html = html.replace(/(<a\b(?=[^>]*\bhref="[^"]*")(?=[^>]*data-sns="([^"]+)")[^>]*\bhref=")[^"]*(")/g, (_m, before, key, after) => {
    return before + escapeAttr(sns[key] || "#") + after;
  });
  return html;
}

function removeClientJsonScripts(html) {
  return html.replace(
    /\s*<script\b[^>]*\bsrc=["']js\/(?:common|talks|timetable)\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\s*/g,
    "\n"
  );
}

function addEmbedRuntime(html) {
  if (html.includes("js/embed-runtime.js")) return html;
  return html.replace("</body>", '  <script src="js/embed-runtime.js?v=20260517-single-day-v2" defer></script>\n</body>');
}

function dateTimeHtml(value) {
  if (!value) return "XXXX年X月XX日 XX:XX–XX:XX";

  const parts = String(value).split("／").filter(Boolean);
  let year = "";

  if (parts.length > 0) {
    const match = parts[0].match(/^([0-9]{4}年)(.*)$/);
    if (match) {
      year = match[1];
      parts[0] = match[2];
    }
  }

  if (!year && parts[0] && /^[0-9]{4}年$/.test(parts[0])) {
    year = parts.shift();
  }

  return [
    year ? `<span class="date-year-full">${escapeHtml(year)}</span>` : "",
    ...parts.map((part) => `<span class="date-main">${escapeHtml(part)}</span>`)
  ].join("");
}

function timeToMinutes(time) {
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
}

function durationMinutes(item) {
  return Math.max(0, timeToMinutes(item.end) - timeToMinutes(item.start));
}

function durationLabel(item) {
  return `${durationMinutes(item)}分`;
}

function applyConfigToPage(html, config, pageKey) {
  html = replaceMeta(html, `metaDescriptions.${pageKey}`, config.metaDescriptions?.[pageKey]);
  html = replaceByDataConfig(html, `pageTitles.${pageKey}`, config.pageTitles?.[pageKey]);
  html = replaceByDataConfig(html, "labels.top", config.labels?.top);
  html = replaceLinks(html, config.links || {}, config.sns || {});
  return html;
}

function renderMembers(config) {
  const members = config.organizer?.members || [];
  if (members.length === 0) return "";

  const groups = new Map();

  for (const member of members) {
    const role = typeof member === "string" ? "運営メンバー" : (member.role || member.group || "運営メンバー");
    const name = typeof member === "string" ? member : (member.name || "");
    if (!name) continue;

    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(name);
  }

  return [...groups.entries()].map(([role, names]) => {
    const roleHtml = role === "運営メンバー" ? "" : `<span class="member-role">${escapeHtml(role)}</span>`;
    const groupClass = role === "運営メンバー" ? "member-group member-group-no-role" : "member-group";
    const namesHtml = names.map((name) => `<span class="member-chip">${escapeHtml(name)}</span>`).join("");
    return `<li class="${groupClass}">${roleHtml}<span class="member-names">${namesHtml}</span></li>`;
  }).join("\n");
}

function renderIndex(config) {
  let html = readText("index.html");

  html = applyConfigToPage(html, config, "index");
  html = replaceByDataConfig(html, "dateTimeText", dateTimeHtml(config.dateTimeText), true);
  html = replaceByDataConfig(html, "venueName", config.venueName);
  html = replaceByDataConfig(html, "venueAddress", config.venueAddress);
  html = replaceByDataConfig(html, "organizer.representative", config.organizer?.representative);

  html = html.replace(
    /<div class="video-container" id="video-container">[\s\S]*?<\/div>/,
    `<div class="video-container" id="video-container" data-embed="youtube" data-src="${escapeAttr(config.links?.youtubeEmbed || "")}">
          <p class="section-note">紹介動画を読み込めませんでした。</p>
        </div>`
  );

  html = html.replace(
    /<div class="map-container" id="map-container">[\s\S]*?<\/div>/,
    `<div class="map-container" id="map-container" data-embed="map" data-src="${escapeAttr(config.links?.mapEmbed || "")}">
          <p class="section-note">地図を読み込めませんでした。Google Mapボタンからご確認ください。</p>
        </div>`
  );

  const membersHtml = renderMembers(config);
  if (membersHtml) {
    html = html.replace(
      /<div id="organizer-members" class="organizer-members" hidden>[\s\S]*?<\/div>/,
      `<div id="organizer-members" class="organizer-members">
          <h3>運営メンバー</h3>
          <ul id="organizer-members-list">${membersHtml}</ul>
        </div>`
    );
  }

  return addEmbedRuntime(removeClientJsonScripts(html));
}

function scheduleTextByTalk(schedule) {
  const result = new Map();

  for (const item of schedule) {
    if (item.type !== "talk") continue;
    if (!result.has(item.talkId)) result.set(item.talkId, []);
    result.get(item.talkId).push(`${item.dateLabel} ${item.start}–${item.end}`);
  }

  return result;
}

function renderTalkCard(talk, scheduleText) {
  return `<article class="talk-card" id="${escapeAttr(talk.id)}">
          <h3>${escapeHtml(talk.title)}</h3>
          <p class="talk-meta"><b>${escapeHtml(talk.speaker)}</b>｜${escapeHtml(talk.affiliation)}｜${escapeHtml(talk.field)}</p>
          <p>${escapeHtml(talk.description || "講演概要は準備中です。")}</p>
          <p class="talk-schedule"><b>登壇予定：</b>${escapeHtml(scheduleText || "調整中")}</p>
        </article>`;
}

function renderTalks(config, talks, schedule) {
  let html = readText("talks.html");

  html = applyConfigToPage(html, config, "talks");

  const byTalk = scheduleTextByTalk(schedule);
  const cards = [...talks]
    .sort((a, b) => String(a.speakerKana || a.speaker || "").localeCompare(String(b.speakerKana || b.speaker || ""), "ja"))
    .map((talk) => renderTalkCard(talk, (byTalk.get(talk.id) || []).join("、")))
    .join("\n");

  html = html.replace(
    /<div id="talks-list" class="talk-card-grid" aria-live="polite"><\/div>/,
    `<div id="talks-list" class="talk-card-grid">${cards}</div>`
  );

  return removeClientJsonScripts(html);
}

function slotContent(item, talkMap) {
  if (!item) return "";

  const longClass = durationMinutes(item) >= 45 ? " is-long-slot" : "";
  const cancelledClass = item.status === "cancelled" ? " is-cancelled-slot" : "";
  const badge = `<span class="duration-badge">${durationLabel(item)}</span>`;
  const statusBadge = item.status === "cancelled" ? `<span class="status-badge status-cancelled">${escapeHtml(item.statusLabel || "中止")}</span>` : "";
  const statusNote = item.note ? `<p class="slot-status-note">${escapeHtml(item.note)}</p>` : "";

  if (item.type === "break") {
    return `<div class="slot-card break-slot-card${longClass}${cancelledClass}">
        ${badge}
        <div class="break-slot">${escapeHtml(item.title || "休憩")}</div>
      </div>`;
  }

  const talk = talkMap[item.talkId];

  if (!talk) {
    return `<div class="slot-card slot-detail-card${longClass}${cancelledClass}">
        ${badge}
        ${statusBadge}
        <div class="break-slot">講演情報未設定</div>
        ${statusNote}
      </div>`;
  }

  const closedLabel = item.status === "cancelled" ? "中止・詳細を開く" : "詳細を開く";

  return `<div class="slot-card slot-detail-card${longClass}${cancelledClass}">
      ${badge}
      ${statusBadge}
      <div class="slot-detail-inner">
        <button class="talk-toggle" type="button" aria-expanded="false" aria-label="${escapeAttr(talk.title)} の詳細を開く">
          <span class="slot-detail-title">${escapeHtml(talk.title)}</span>
          <span class="slot-detail-speaker"><b>講演者：</b>${escapeHtml(talk.speaker)}</span>
          ${statusNote}
          <span class="slot-open-label">${closedLabel}</span>
        </button>
        <div class="slot-detail" role="region" aria-label="${escapeAttr(talk.title)} の講演詳細">
          <p class="slot-detail-affiliation"><b>所属・専攻：</b>${escapeHtml(talk.affiliation)}｜${escapeHtml(talk.field)}</p>
          <p class="slot-detail-abstract"><b>要旨：</b>${escapeHtml(talk.description || "講演概要は準備中です。")}</p>
        </div>
      </div>
    </div>`;
}

function renderTimetable(config, talks, schedule) {
  let html = readText("timetable.html");

  html = applyConfigToPage(html, config, "timetable");

  const talkMap = Object.fromEntries(talks.map((talk) => [talk.id, talk]));
  const sorted = [...schedule].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  const grouped = new Map();
  for (const item of sorted) {
    if (!grouped.has(item.date)) grouped.set(item.date, []);
    grouped.get(item.date).push(item);
  }

  const days = [...grouped.entries()].map(([date, items], index) => ({
    date,
    label: items[0].dateLabel,
    items,
    index
  }));
  const activeDate = days.some((day) => day.date === DEFAULT_TIMETABLE_DATE)
    ? DEFAULT_TIMETABLE_DATE
    : (days[0] ? days[0].date : "");

  const tabs = days.map((day) =>
    `<button type="button" data-date="${escapeAttr(day.date)}" aria-selected="${day.date === activeDate ? "true" : "false"}">${escapeHtml(day.label)}</button>`
  ).join("");

  const desktop = days.map((day) => {
    const rows = day.items.map((item) => `<tr>
              <th>${escapeHtml(item.start)}–${escapeHtml(item.end)}</th>
              <td>${slotContent(item, talkMap)}</td>
            </tr>`).join("");

    return `<div class="desktop-day-panel${day.date === activeDate ? " is-active" : ""}" data-date="${escapeAttr(day.date)}"${day.date === activeDate ? "" : " hidden"}>
          <h3 class="desktop-day-title">${escapeHtml(day.label)}</h3>
          <table class="timetable-table timetable-table-enhanced timetable-table-single-day">
            <thead>
              <tr>
                <th>時間</th>
                <th>講演</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
  }).join("");

  const panels = days.map((day) =>
    `<div class="mobile-day-panel${day.date === activeDate ? " is-active" : ""}" data-date="${escapeAttr(day.date)}"${day.date === activeDate ? "" : " hidden"}>
          ${day.items.map((item) => `<article class="mobile-slot">
            <div class="mobile-time">${escapeHtml(item.start)}–${escapeHtml(item.end)}</div>
            ${slotContent(item, talkMap)}
          </article>`).join("")}
        </div>`
  ).join("");

  html = html.replace(/<div id="day-tabs" class="day-tabs" aria-label="日付切り替え"><\/div>/, `<div id="day-tabs" class="day-tabs" aria-label="日付切り替え">${tabs}</div>`);
  html = html.replace(/<div id="timetable-desktop" class="timetable-desktop table-wrapper"><\/div>/, `<div id="timetable-desktop" class="timetable-desktop table-wrapper">${desktop}</div>`);
  html = html.replace(/<div id="timetable-mobile" class="timetable-mobile"><\/div>/, `<div id="timetable-mobile" class="timetable-mobile">${panels}</div>`);

  return addEmbedRuntime(removeClientJsonScripts(html));
}

function writeEmbedRuntime() {
  const runtime = `document.addEventListener("DOMContentLoaded", function () {
  function activateDay(date) {
    document.querySelectorAll("#day-tabs button[data-date]").forEach(function (btn) {
      btn.setAttribute("aria-selected", btn.dataset.date === date ? "true" : "false");
    });

    document.querySelectorAll(".desktop-day-panel, .mobile-day-panel").forEach(function (panel) {
      var isActive = panel.dataset.date === date;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });
  }

  document.querySelectorAll("[data-embed]").forEach(function (container) {
    var src = container.getAttribute("data-src");
    if (!src) return;

    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = container.dataset.embed === "map" ? "会場のGoogle Map" : "紹介動画";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.allowFullscreen = true;

    if (container.dataset.embed === "youtube") {
      iframe.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    }

    container.innerHTML = "";
    container.appendChild(iframe);
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".talk-toggle");
    if (!button) return;

    var detail = button.parentElement.querySelector(".slot-detail");
    var label = button.querySelector(".slot-open-label");
    if (!detail) return;

    var isOpen = detail.classList.toggle("is-open");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (label) {
      var cancelled = button.closest(".is-cancelled-slot");
      label.textContent = isOpen ? "詳細を閉じる" : (cancelled ? "中止・詳細を開く" : "詳細を開く");
    }
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("#day-tabs button[data-date]");
    if (!button) return;
    activateDay(button.dataset.date);
  });

  var selected = document.querySelector("#day-tabs button[aria-selected='true']") || document.querySelector("#day-tabs button[data-date]");
  if (selected) activateDay(selected.dataset.date);
});
`;

  writeDist("js/embed-runtime.js", runtime);
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);

  copyRecursive("css");
  copyRecursive("img");
  copyRecursive("data");

  for (const file of fs.readdirSync(ROOT)) {
    if (/^google.*\.html$/.test(file)) copyRecursive(file);
  }

  const config = readJson("data/config.json");
  const talks = readJson("data/talks.json");
  const schedule = readJson("data/schedule.json");

  writeDist("index.html", renderIndex(config));
  writeDist("talks.html", renderTalks(config, talks, schedule));
  writeDist("timetable.html", renderTimetable(config, talks, schedule));
  writeEmbedRuntime();

  console.log("Built static site to dist/");
}

main();
