function groupBy(array, keyFn) {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function makeTalkMap(talks) {
  return talks.reduce((acc, talk) => {
    acc[talk.id] = talk;
    return acc;
  }, {});
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function durationMinutes(item) {
  return Math.max(0, timeToMinutes(item.end) - timeToMinutes(item.start));
}

function durationLabel(item) {
  return `${durationMinutes(item)}分`;
}

function slotContent(item, talkMap) {
  const minutes = durationMinutes(item);
  const isLong = minutes >= 45;
  const isCancelled = item && item.status === "cancelled";
  const durationClass = `${isLong ? " is-long-slot" : ""}${isCancelled ? " is-cancelled-slot" : ""}`;

  if (!item) {
    return "";
  }

  if (item.type === "break") {
    return `
      <div class="slot-card break-slot-card${durationClass}">
        <span class="duration-badge">${durationLabel(item)}</span>
        <div class="break-slot">${item.title || "休憩"}</div>
      </div>
    `;
  }

  const statusBadge = isCancelled ? `<span class="status-badge status-cancelled">${item.statusLabel || "中止"}</span>` : "";
  const statusNote = item.note ? `<p class="slot-status-note${isCancelled ? "" : " slot-status-note-pending"}">${item.note}</p>` : "";

  const talk = talkMap[item.talkId];
  if (!talk) {
    return `
      <div class="slot-card slot-detail-card${durationClass}">
        <span class="duration-badge">${durationLabel(item)}</span>
        ${statusBadge}
        <div class="slot-detail-inner">
          <span class="slot-detail-title">${item.title || "講演タイトル未定"}</span>
          <span class="slot-detail-speaker"><b>講演者：</b>${item.speaker || "発表者未定"}</span>
          ${statusNote}
          <span class="slot-open-label">${isCancelled ? "中止" : "準備中"}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="slot-card slot-detail-card${durationClass}">
      <span class="duration-badge">${durationLabel(item)}</span>
      ${statusBadge}
      <div class="slot-detail-inner">
        <button class="talk-toggle" type="button" aria-expanded="false" aria-label="${talk.title} の詳細を開く">
          <span class="slot-detail-title">${talk.title}</span>
          <span class="slot-detail-speaker"><b>講演者：</b>${talk.speaker}</span>
          ${statusNote}
          <span class="slot-open-label">${isCancelled ? "中止・詳細を開く" : "詳細を開く"}</span>
        </button>
        <div class="slot-detail" role="region" aria-label="${talk.title} の講演詳細">
          <p class="slot-detail-affiliation"><b>所属・専攻：</b>${talk.affiliation}｜${talk.field}</p>
          <p class="slot-detail-abstract"><b>要旨：</b>${talk.description}</p>
        </div>
      </div>
    </div>
  `;
}

function renderDesktop(schedule, talkMap) {
  const desktop = document.getElementById("timetable-desktop");
  if (!desktop) return;

  // 旧版の「2日横並び」テーブルがキャッシュ等で残っていても、ここで必ず置き換える。

  const grouped = groupBy(schedule, (item) => item.date);
  const days = Object.keys(grouped).map((date) => ({
    date,
    label: grouped[date][0].dateLabel
  }));

  desktop.innerHTML = days.map((day, index) => {
    const items = grouped[day.date].sort((a, b) =>
      `${a.start}-${a.end}`.localeCompare(`${b.start}-${b.end}`)
    );

    const rows = items.map((item) => `
      <tr>
        <th>${item.start}–${item.end}</th>
        <td>${slotContent(item, talkMap)}</td>
      </tr>
    `).join("");

    return `
      <div class="desktop-day-panel" data-date="${day.date}" ${index !== 0 ? "hidden" : ""}>
        <h3 class="desktop-day-title">${day.label}</h3>
        <table class="timetable-table timetable-table-enhanced timetable-table-single-day">
          <thead>
            <tr>
              <th>時間</th>
              <th>講演</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");
}

function renderMobile(schedule, talkMap) {
  const tabs = document.getElementById("day-tabs");
  const mobile = document.getElementById("timetable-mobile");
  if (!tabs || !mobile) return;

  const grouped = groupBy(schedule, (item) => item.date);
  const days = Object.keys(grouped).map((date) => ({
    date,
    label: grouped[date][0].dateLabel
  }));

  tabs.innerHTML = "";
  mobile.innerHTML = "";

  days.forEach((day, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.textContent = day.label;
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.dataset.date = day.date;
    tabs.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "mobile-day-panel";
    panel.dataset.date = day.date;
    if (index !== 0) panel.hidden = true;

    const items = grouped[day.date].sort((a, b) => `${a.start}-${a.end}`.localeCompare(`${b.start}-${b.end}`));
    panel.innerHTML = items.map((item) => `
      <article class="mobile-slot">
        <div class="mobile-time">${item.start}–${item.end}</div>
        ${slotContent(item, talkMap)}
      </article>
    `).join("");

    mobile.appendChild(panel);
  });

  tabs.onclick = (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;

    tabs.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-selected", btn === button ? "true" : "false");
    });

    mobile.querySelectorAll(".mobile-day-panel").forEach((panel) => {
      panel.hidden = panel.dataset.date !== button.dataset.date;
    });

    document.querySelectorAll(".desktop-day-panel").forEach((panel) => {
      panel.hidden = panel.dataset.date !== button.dataset.date;
    });
  };
}

function setupDetailsToggle() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".talk-toggle");
    if (!button) return;

    const detail = button.parentElement.querySelector(".slot-detail");
    const label = button.querySelector(".slot-open-label");
    const isOpen = detail.classList.toggle("is-open");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (label) {
      const cancelled = button.closest(".is-cancelled-slot");
      label.textContent = isOpen ? "詳細を閉じる" : (cancelled ? "中止・詳細を開く" : "詳細を開く");
    }
  });
}

async function renderTimetable() {
  try {
    const legacyDesktop = document.getElementById("timetable-desktop");
    if (legacyDesktop) {
      legacyDesktop.remove();
    }
    const [talks, schedule] = await Promise.all([
      loadJson("data/talks.json"),
      loadJson("data/schedule.json")
    ]);

    schedule.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    const talkMap = makeTalkMap(talks);

    renderMobile(schedule, talkMap);
    setupDetailsToggle();
  } catch (error) {
    console.error(error);
    const desktop = document.getElementById("timetable-desktop");
    if (desktop) desktop.innerHTML = '<p class="section-note">タイムテーブルを読み込めませんでした。</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderTimetable);
