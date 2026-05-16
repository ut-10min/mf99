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


let timetableState = {
  schedule: [],
  talkMap: {},
  grouped: {},
  days: [],
  activeDate: ""
};

function buildTimetableState(schedule, talkMap) {
  const grouped = groupBy(schedule, (item) => item.date);
  const days = Object.keys(grouped)
    .sort()
    .map((date) => ({
      date,
      label: grouped[date][0].dateLabel
    }));

  timetableState = {
    schedule,
    talkMap,
    grouped,
    days,
    activeDate: days[0] ? days[0].date : ""
  };
}

function renderDayTabs() {
  const tabs = document.getElementById("day-tabs");
  if (!tabs) return;

  tabs.innerHTML = timetableState.days.map((day) => `
    <button
      type="button"
      data-date="${day.date}"
      aria-selected="${day.date === timetableState.activeDate ? "true" : "false"}">
      ${day.label}
    </button>
  `).join("");

  tabs.onclick = (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;

    timetableState.activeDate = button.dataset.date;
    renderDayTabs();
    renderActiveDay();
  };
}

function renderActiveDay() {
  const panel = document.getElementById("timetable-panel");
  if (!panel) return;

  const day = timetableState.days.find((item) => item.date === timetableState.activeDate);
  if (!day) {
    panel.innerHTML = '<p class="section-note placeholder-message">タイムテーブルは現在準備中です。</p>';
    return;
  }

  const items = [...(timetableState.grouped[day.date] || [])].sort((a, b) =>
    `${a.start}-${a.end}`.localeCompare(`${b.start}-${b.end}`)
  );

  panel.innerHTML = `
    <h3 class="timetable-panel-title">${day.label}</h3>
    <div class="timetable-panel-list">
      ${items.map((item) => `
        <article class="timetable-panel-slot">
          <div class="timetable-panel-time">${item.start}–${item.end}</div>
          <div class="timetable-panel-content">
            ${slotContent(item, timetableState.talkMap)}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

async function renderTimetable() {
  try {
    const [talks, schedule] = await Promise.all([
      loadJson("data/talks.json"),
      loadJson("data/schedule.json")
    ]);

    if (!Array.isArray(schedule) || schedule.length === 0) {
      const panel = document.getElementById("timetable-panel");
      if (panel) {
        panel.innerHTML = '<p class="section-note placeholder-message">タイムテーブルは現在準備中です。講演時間が決まり次第、掲載します。</p>';
      }
      return;
    }

    schedule.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    const talkMap = makeTalkMap(Array.isArray(talks) ? talks : []);

    buildTimetableState(schedule, talkMap);
    renderDayTabs();
    renderActiveDay();
    setupDetailsToggle();
  } catch (error) {
    console.error(error);
    const panel = document.getElementById("timetable-panel");
    if (panel) panel.innerHTML = '<p class="section-note">タイムテーブルを読み込めませんでした。</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderTimetable);
