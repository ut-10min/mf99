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
  if (!item) return "";

  const minutes = durationMinutes(item);
  const isLong = minutes >= 45;
  const isCancelled = item.status === "cancelled";
  const slotClass = `${isLong ? " is-long-slot" : ""}${isCancelled ? " is-cancelled-slot" : ""}`;
  const statusBadge = isCancelled ? `<span class="status-badge status-cancelled">${item.statusLabel || "中止"}</span>` : "";
  const statusNote = item.note ? `<p class="slot-status-note">${item.note}</p>` : "";

  if (item.type === "break") {
    return `
      <div class="slot-card break-slot-card${slotClass}">
        <span class="duration-badge">${durationLabel(item)}</span>
        <div class="break-slot">${item.title || "休憩"}</div>
      </div>
    `;
  }

  const talk = talkMap[item.talkId];
  if (!talk) {
    return `
      <div class="slot-card slot-detail-card${slotClass}">
        <span class="duration-badge">${durationLabel(item)}</span>
        ${statusBadge}
        <div class="slot-detail-inner">
          <span class="slot-detail-title">${item.title || "講演タイトル未設定"}</span>
          <span class="slot-detail-speaker"><b>講演者：</b>${item.speaker || "発表者未設定"}</span>
          ${statusNote}
          <span class="slot-open-label">${isCancelled ? "中止" : "準備中"}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="slot-card slot-detail-card${slotClass}">
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

function scheduleDays(schedule) {
  const grouped = groupBy(schedule, (item) => item.date);
  return Object.keys(grouped).sort().map((date) => ({
    date,
    label: grouped[date][0].dateLabel,
    items: grouped[date].sort((a, b) => `${a.start}-${a.end}`.localeCompare(`${b.start}-${b.end}`))
  }));
}

function renderTabs(days) {
  const tabs = document.getElementById("day-tabs");
  if (!tabs) return;

  tabs.innerHTML = days.map((day, index) => `
    <button type="button" data-date="${day.date}" aria-selected="${index === 0 ? "true" : "false"}">${day.label}</button>
  `).join("");
}

function renderDesktop(days, talkMap) {
  const desktop = document.getElementById("timetable-desktop");
  if (!desktop) return;

  desktop.innerHTML = days.map((day, index) => {
    const rows = day.items.map((item) => `
      <tr>
        <th>${item.start}–${item.end}</th>
        <td>${slotContent(item, talkMap)}</td>
      </tr>
    `).join("");

    return `
      <div class="desktop-day-panel${index === 0 ? " is-active" : ""}" data-date="${day.date}"${index === 0 ? "" : " hidden"}>
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

function renderMobile(days, talkMap) {
  const mobile = document.getElementById("timetable-mobile");
  if (!mobile) return;

  mobile.innerHTML = days.map((day, index) => `
    <div class="mobile-day-panel${index === 0 ? " is-active" : ""}" data-date="${day.date}"${index === 0 ? "" : " hidden"}>
      ${day.items.map((item) => `
        <article class="mobile-slot">
          <div class="mobile-time">${item.start}–${item.end}</div>
          ${slotContent(item, talkMap)}
        </article>
      `).join("")}
    </div>
  `).join("");
}

function activateDay(date) {
  const tabs = document.getElementById("day-tabs");
  if (tabs) {
    tabs.querySelectorAll("button[data-date]").forEach((button) => {
      button.setAttribute("aria-selected", button.dataset.date === date ? "true" : "false");
    });
  }

  document.querySelectorAll(".desktop-day-panel, .mobile-day-panel").forEach((panel) => {
    const isActive = panel.dataset.date === date;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });
}

function setupDayTabs(days) {
  const tabs = document.getElementById("day-tabs");
  if (!tabs || days.length === 0) return;

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    activateDay(button.dataset.date);
  });

  activateDay(days[0].date);
}

function setupDetailsToggle() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".talk-toggle");
    if (!button) return;

    const detail = button.parentElement.querySelector(".slot-detail");
    const label = button.querySelector(".slot-open-label");
    if (!detail) return;

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
    const [talks, schedule] = await Promise.all([
      loadJson("data/talks.json"),
      loadJson("data/schedule.json")
    ]);

    schedule.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    const talkMap = makeTalkMap(talks);
    const days = scheduleDays(schedule);

    renderTabs(days);
    renderDesktop(days, talkMap);
    renderMobile(days, talkMap);
    setupDayTabs(days);
    setupDetailsToggle();
  } catch (error) {
    console.error(error);
    const desktop = document.getElementById("timetable-desktop");
    if (desktop) desktop.innerHTML = '<p class="section-note">タイムテーブルを読み込めませんでした。</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderTimetable);
