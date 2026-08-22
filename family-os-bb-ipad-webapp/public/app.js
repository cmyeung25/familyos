const HK_TZ = "Asia/Hong_Kong";
const RECENT_RECORD_RESUME_GUARD_MS = 1500;
const STORAGE_KEYS = {
  activeBottle: "family-os-bb-ipad:active-bottle",
  language: "family-os-bb-ipad:language",
  logs: "family-os-bb-ipad:logs-cache",
};

const intensityLabels = {
  none: { long: "無" },
  small: { long: "少量" },
  medium: { long: "中量" },
  large: { long: "多量" },
};

const I18N = {
  zh: {
    age: "6 週 3 天（45 日）", home: "首頁", stats: "統計圖表", settings: "設定",
    quickLog: "快速記錄", current: "現在 / 進行中", todayOverview: "今日概覽", todayRange: "（00:00 至現在）",
    diaperLog: "換片記錄", nowTime: "現在時間", now: "現在", adjusted: "已調整", recording: "記錄中...", recordDiaper: "記錄換片",
    bottleLog: "沖奶記錄", milkAmount: "沖奶量", perBlock: "（每格 30 ml）", startMilkTimer: "開始沖奶計時",
    temperatureLog: "探熱記錄", latest: "最新", recordTemperature: "記錄體溫", temperature: "體溫", time: "時間",
    peeAmount: "尿尿分量", pooAmount: "便便分量", pee: "尿尿", poo: "便便", none: "無", small: "少量", medium: "中量", large: "多量",
    milkTimer: "沖奶計時器", noActiveMilk: "未有進行中的沖奶", noActiveHelp: "開始沖奶後，60 分鐘計時會顯示在這裡",
    milkTimerRunning: "沖奶計時中", expired: "已過期", remainingTime: "剩餘時間", preparedAmount: "沖奶量", startTime: "開始時間",
    validUntil: "有效期至 {time}（1 小時內飲用）", medicineGiven: "今次有餵藥", finishFeed: "完成飲奶",
    drinkDuration: "飲用時間", confirmActual: "確認實際飲奶量", fullFeed: "全飲", noMilk: "無飲", gaveMedicine: "餵藥", confirmFeed: "確認飲奶紀錄",
    recentLogs: "最近記錄", viewAll: "查看全部 ›", noRecent: "未有最近 BB 紀錄", diaperRecord: "換片記錄", feedingRecord: "飲奶記錄", temperatureRecord: "體溫記錄",
    actualMilk: "實際奶量", feeds: "{count} 次餵奶", preparedMilk: "沖奶量", leftover: "剩餘", past26: "過去 26 小時", average: "平均每次", sinceLastFeed: "距離上次餵奶", lastFeedHeader: "上次餵奶", noFeedYet: "未有餵奶記錄", timeline26: "26 小時時間軸",
    all: "全部", feeding: "飲奶", diaper: "換片", refresh: "刷新", showing: "顯示最新 {count} 筆", dataPathDescription: "目前實際讀寫路徑", dataSource: "資料來源", dataSourceAppsScriptSheets: "Google Sheets（Apps Script API）", dataSourceMariaDb: "MariaDB（NAS BB Data API）", dataSourceUnknown: "未能確認", localCache: "本機快取", records: "{count} 筆", clearTimer: "清除沖奶計時",
    submitWait: "記錄中，請勿關閉或切換頁面", submitFailed: "未能提交紀錄", retry: "返回再試", gotIt: "知道了", today: "今日", yesterday: "昨日", currentLabel: "現在",
    justNow: "剛剛", minutesAgo: "{minutes} 分鐘前", hoursMinutesAgo: "{hours} 小時 {minutes} 分鐘前", hoursAgo: "{hours} 小時前", minutesDuration: "{minutes} 分鐘", hoursMinutesDuration: "{hours} 小時 {minutes} 分鐘", hoursDuration: "{hours} 小時",
    refreshed: "已刷新紀錄", refreshedDetail: "{count} 筆 BB 紀錄", connectionFailed: "未能連接", apiOffline: "Family OS API 暫時離線",
    missingAmount: "未選擇分量", chooseOne: "請至少選擇一項", diaperSaving: "記錄換片", diaperSuccess: "換片記錄成功",
    milkTimerStarted: "已開始沖奶計時", feedSaving: "記錄飲奶", feedSuccess: "飲奶記錄成功", tempSaving: "記錄體溫", tempSuccess: "已成功記錄體溫", timerCleared: "已清除沖奶計時", localTimerRemoved: "本機計時已移除",
    switchLanguage: "Switch to English", settingsLabel: "設定", close: "關閉", checking: "檢查中", saveFailed: "儲存失敗", noValue: "沒有",
    startedDetail: "{ml} ml · {time} 開始{medicine}", medicineSuffix: " · 有餵藥", diaperDetail: "{time} · 尿尿{pee} · 便便{poo}",
    editRecord: "修改記錄", editShort: "修改", editHint: "按修改按鈕可更改記錄", recordDate: "記錄日期", saveChanges: "儲存修改", deleteRecord: "刪除記錄",
    deleteConfirmTitle: "確定刪除這筆記錄？", deleteConfirmBody: "記錄會從介面隱藏，原資料及更改歷史仍會保留。", cancel: "取消", confirmDelete: "確定刪除",
    recordUpdating: "正在更新記錄", recordUpdated: "記錄已更新", recordDeleting: "正在刪除記錄", recordDeleted: "記錄已刪除", unsupportedEdit: "這類記錄暫不支援修改",
    recordChanged: "記錄已在另一部裝置更改，請刷新後再試。", actualAmount: "實際飲奶量", changePreparedAmount: "沖奶量", previousDay: "前一日", nextDay: "後一日",
    times: "次", hour10: "10時", hour14: "14時", hour16: "16時", hour18: "18時", hour22: "22時", hour02: "02時", hour04: "04時", hour06: "06時",
    statsTitle: "統計與趨勢", statsSubtitle: "掌握小桃B最近生活節奏與變化", statsToday: "今日", stats7: "7日", stats30: "30日", statsCustom: "自訂", statsLoading: "正在載入統計資料…", statsAverage: "平均", recentAverage: "近期日均",
    perDay: "/ 日", comparedWithAverage: "今日較日均 {delta}", closeToAverage: "與近期日均接近", aboveAverage: "較近期日均多 {value}", belowAverage: "較近期日均少 {value}", noComparison: "未有足夠資料比較",
    lifeTimeline: "24 小時生活時間軸", summaryToday: "今日摘要", versusAverage: "今日 vs {days}日平均", milkTrend: "每日奶量趨勢", diaperTrend: "尿片與大便次數", temperatureTrend: "體溫趨勢", feedDistribution: "每餐奶量分佈", rawRecent: "最近記錄",
    urineShort: "尿片", stoolShort: "大便", latestTemp: "最新體溫", avgDaily: "日均", totalFeeds: "總餵奶次數", averageInterval: "平均間隔", dateRange: "日期範圍", startDate: "開始日期", endDate: "結束日期", applyRange: "套用日期", invalidRange: "日期範圍必須為 1 至 30 日",
    milkNearInsight: "奶量與小桃B近期日均接近", milkHighInsight: "今日奶量較近期日均多", milkLowInsight: "今日奶量較近期日均少", pooHighInsight: "今日大便次數較近期多", pooNearInsight: "大便次數與近期日均接近", tempInsight: "最新體溫為 {value}", noDataInsight: "這個範圍未有足夠記錄",
  },
  en: {
    age: "6 weeks 3 days (45 days)", home: "Home", stats: "Insights", settings: "Settings",
    quickLog: "Quick log", current: "Now / Active", todayOverview: "Today", todayRange: "(00:00 to now)",
    diaperLog: "Diaper log", nowTime: "Use current time", now: "Now", adjusted: "Adjusted", recording: "Saving...", recordDiaper: "Save diaper",
    bottleLog: "Bottle prep", milkAmount: "Prepared milk", perBlock: "(30 ml per block)", startMilkTimer: "Start milk timer",
    temperatureLog: "Temperature", latest: "Latest", recordTemperature: "Record temperature", temperature: "Temperature", time: "Time",
    peeAmount: "Urine amount", pooAmount: "Stool amount", pee: "Urine", poo: "Stool", none: "None", small: "Small", medium: "Medium", large: "Large",
    milkTimer: "Milk timer", noActiveMilk: "No active bottle", noActiveHelp: "A 60-minute timer appears here after bottle preparation",
    milkTimerRunning: "Milk timer active", expired: "Expired", remainingTime: "Time remaining", preparedAmount: "Prepared", startTime: "Started",
    validUntil: "Use by {time} (within 1 hour)", medicineGiven: "Medicine given", finishFeed: "Finish feeding",
    drinkDuration: "Elapsed", confirmActual: "Confirm actual milk intake", fullFeed: "All", noMilk: "None", gaveMedicine: "Medicine given", confirmFeed: "Confirm feeding log",
    recentLogs: "Recent logs", viewAll: "View all ›", noRecent: "No recent baby logs", diaperRecord: "Diaper log", feedingRecord: "Feeding log", temperatureRecord: "Temperature log",
    actualMilk: "Actual milk", feeds: "{count} feeds", preparedMilk: "Prepared", leftover: "Left", past26: "Past 26 hours", average: "Average feed", sinceLastFeed: "Since last feed", lastFeedHeader: "Last feed", noFeedYet: "No feeding record", timeline26: "26-hour timeline",
    all: "All", feeding: "Feeding", diaper: "Diaper", refresh: "Refresh", showing: "Showing latest {count}", dataPathDescription: "Current verified read/write path", dataSource: "Data source", dataSourceAppsScriptSheets: "Google Sheets (Apps Script API)", dataSourceMariaDb: "MariaDB (NAS BB Data API)", dataSourceUnknown: "Not confirmed", localCache: "Local cache", records: "{count} records", clearTimer: "Clear milk timer",
    submitWait: "Saving. Do not close or switch pages.", submitFailed: "Could not save", retry: "Back and retry", gotIt: "Done", today: "Today", yesterday: "Yesterday", currentLabel: "Now",
    justNow: "Just now", minutesAgo: "{minutes} min ago", hoursMinutesAgo: "{hours} hr {minutes} min ago", hoursAgo: "{hours} hr ago", minutesDuration: "{minutes} min", hoursMinutesDuration: "{hours} hr {minutes} min", hoursDuration: "{hours} hr",
    refreshed: "Logs refreshed", refreshedDetail: "{count} baby logs", connectionFailed: "Connection failed", apiOffline: "Family OS API is offline",
    missingAmount: "No amount selected", chooseOne: "Select at least one item", diaperSaving: "Saving diaper", diaperSuccess: "Diaper saved",
    milkTimerStarted: "Milk timer started", feedSaving: "Saving feeding", feedSuccess: "Feeding saved", tempSaving: "Saving temperature", tempSuccess: "Temperature saved", timerCleared: "Milk timer cleared", localTimerRemoved: "Local timer removed",
    switchLanguage: "切換至中文", settingsLabel: "Settings", close: "Close", checking: "Checking", saveFailed: "Save failed", noValue: "None",
    startedDetail: "{ml} ml · started {time}{medicine}", medicineSuffix: " · medicine given", diaperDetail: "{time} · urine {pee} · stool {poo}",
    editRecord: "Edit record", editShort: "Edit", editHint: "Use the edit button to change a record", recordDate: "Record date", saveChanges: "Save changes", deleteRecord: "Delete record",
    deleteConfirmTitle: "Delete this record?", deleteConfirmBody: "It will be hidden from the app while the original data and change history remain available.", cancel: "Cancel", confirmDelete: "Delete",
    recordUpdating: "Updating record", recordUpdated: "Record updated", recordDeleting: "Deleting record", recordDeleted: "Record deleted", unsupportedEdit: "This record type cannot be edited yet",
    recordChanged: "This record changed on another device. Refresh and try again.", actualAmount: "Actual milk", changePreparedAmount: "Prepared milk", previousDay: "Previous day", nextDay: "Next day",
    times: "times", hour10: "10h", hour14: "14h", hour16: "16h", hour18: "18h", hour22: "22h", hour02: "02h", hour04: "04h", hour06: "06h",
    statsTitle: "Insights & trends", statsSubtitle: "See Siu To B's recent rhythm and changes", statsToday: "Today", stats7: "7 days", stats30: "30 days", statsCustom: "Custom", statsLoading: "Loading insight data…", statsAverage: "Average", recentAverage: "Recent daily avg",
    perDay: "/ day", comparedWithAverage: "Today vs daily avg {delta}", closeToAverage: "Close to recent daily avg", aboveAverage: "{value} above recent avg", belowAverage: "{value} below recent avg", noComparison: "Not enough data to compare",
    lifeTimeline: "24-hour life timeline", summaryToday: "Today summary", versusAverage: "Today vs {days}-day avg", milkTrend: "Daily milk trend", diaperTrend: "Urine and stool counts", temperatureTrend: "Temperature trend", feedDistribution: "Feed amount distribution", rawRecent: "Recent logs",
    urineShort: "Urine", stoolShort: "Stool", latestTemp: "Latest temperature", avgDaily: "Daily avg", totalFeeds: "Total feeds", averageInterval: "Average interval", dateRange: "Date range", startDate: "Start date", endDate: "End date", applyRange: "Apply range", invalidRange: "Date range must be between 1 and 30 days",
    milkNearInsight: "Milk is close to Siu To B's recent daily average", milkHighInsight: "Today's milk is above the recent daily average", milkLowInsight: "Today's milk is below the recent daily average", pooHighInsight: "Today's stool count is above the recent average", pooNearInsight: "Stool count is close to the recent daily average", tempInsight: "Latest temperature is {value}", noDataInsight: "Not enough logs in this range",
  },
};

const state = {
  now: new Date(),
  activeTab: "panel",
  lang: localStorage.getItem(STORAGE_KEYS.language) === "en" ? "en" : "zh",
  timelineFilter: "all",
  statsRangeMode: "7",
  statsLogs: [],
  statsFrom: "",
  statsTo: "",
  statsLoading: false,
  statsLoadedKey: "",
  statsCustomOpen: false,
  statsCustomFrom: "",
  statsCustomTo: "",
  apiStatus: { ok: null, text: "", textKey: "checking" },
  dataPath: null,
  logs: readJson(STORAGE_KEYS.logs, []),
  saving: "",
  notice: null,
  noticeTimer: null,
  submitFlow: null,
  submitTimer: null,
  recordEditor: null,
  temperatureOpen: false,
  finishOpen: false,
  actualMl: 120,
  times: {
    diaper: new Date(),
    bottle: new Date(),
    temperature: new Date(),
  },
  timeFollowing: { diaper: true, bottle: true, temperature: true },
  diaper: { pee: "medium", poo: "none" },
  preparedMl: 120,
  medicineGiven: false,
  temperature: 36.8,
  activeBottle: readJson(STORAGE_KEYS.activeBottle, null),
};

const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
const headerDate = document.querySelector("#header-date");
const headerClock = document.querySelector("#header-clock");
const headerAge = document.querySelector("#header-age");
const lastFeedGlance = document.querySelector("#last-feed-glance");
const headerLastFeedLabel = document.querySelector("#header-last-feed-label");
const headerLastFeedTime = document.querySelector("#header-last-feed-time");
const headerLastFeedElapsed = document.querySelector("#header-last-feed-elapsed");
const languageButton = document.querySelector("#language-button");

let lastTouchEnd = 0;
let lastTouchTarget = null;
let recentRecordLockedUntil = Date.now() + RECENT_RECORD_RESUME_GUARD_MS;
document.addEventListener("touchend", (event) => {
  if (event.changedTouches.length !== 1) return;
  const now = Date.now();
  const target = event.target.closest?.("button") || event.target;
  if (now - lastTouchEnd < 300 && target === lastTouchTarget) event.preventDefault();
  lastTouchEnd = now;
  lastTouchTarget = target;
}, { passive: false });

document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);
window.addEventListener("online", () => refreshData("online"));
window.addEventListener("focus", () => {
  lockRecentRecordActions();
  refreshData("focus");
});
window.addEventListener("pageshow", lockRecentRecordActions);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    recentRecordLockedUntil = Number.POSITIVE_INFINITY;
    return;
  }
  lockRecentRecordActions();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

render();
refreshData("load");
setInterval(() => {
  state.now = new Date();
  render();
}, 1000);

function handleClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action } = button.dataset;

  if (action === "tab") setTab(button.dataset.tab);
  if (action === "toggle-language") toggleLanguage();
  if (action === "refresh") refreshData("manual");
  if (action === "time-step") adjustTime(button.dataset.scope, Number(button.dataset.minutes));
  if (action === "time-now") setTimeNow(button.dataset.scope);
  if (action === "set-intensity") setIntensity(button.dataset.kind, button.dataset.value);
  if (action === "set-prepared-ml") setPreparedMl(Number(button.dataset.ml));
  if (action === "toggle-medicine") toggleMedicine();
  if (action === "toggle-active-medicine") toggleActiveMedicine();
  if (action === "start-bottle") startBottle();
  if (action === "open-finish") openFinishBottle();
  if (action === "close-finish") closeFinishBottle();
  if (action === "finish-step") setActualMl(state.actualMl + Number(button.dataset.delta));
  if (action === "finish-full") setActualMl(activeBottlePreparedMl());
  if (action === "set-actual-ml") setActualMl(Number(button.dataset.ml));
  if (action === "save-feeding") saveFeeding();
  if (action === "clear-bottle") clearActiveBottle(true);
  if (action === "save-diaper") saveDiaper();
  if (action === "open-temperature") openTemperature();
  if (action === "close-temperature") closeTemperature();
  if (action === "temp-step") setTemperature(state.temperature + Number(button.dataset.delta));
  if (action === "save-temperature") saveTemperature();
  if (action === "dismiss-submit") dismissSubmit();
  if (action === "timeline-filter") setTimelineFilter(button.dataset.filter);
  if (action === "stats-range") setStatsRange(button.dataset.range);
  if (action === "open-custom-range") openStatsCustomRange();
  if (action === "close-custom-range") closeStatsCustomRange();
  if (action === "apply-custom-range") applyStatsCustomRange();
  if (action === "open-record" && !recentRecordActionsLocked()) openRecordEditor(button.dataset.id);
  if (action === "close-record") closeRecordEditor();
  if (action === "edit-time-step") adjustRecordTime(Number(button.dataset.minutes));
  if (action === "edit-intensity") setRecordIntensity(button.dataset.kind, button.dataset.value);
  if (action === "edit-actual-step") adjustRecordActualMl(Number(button.dataset.delta));
  if (action === "edit-prepared-step") adjustRecordPreparedMl(Number(button.dataset.delta));
  if (action === "edit-set-actual") setRecordActualMl(Number(button.dataset.ml));
  if (action === "edit-temp-step") adjustRecordTemperature(Number(button.dataset.delta));
  if (action === "edit-toggle-medicine") toggleRecordMedicine();
  if (action === "save-record") saveRecordChanges();
  if (action === "ask-delete-record") setRecordDeleteConfirm(true);
  if (action === "cancel-delete-record") setRecordDeleteConfirm(false);
  if (action === "confirm-delete-record") deleteRecord();
}

function handleChange(event) {
  if (event.target.matches('[data-stats-date="from"]')) state.statsCustomFrom = event.target.value;
  if (event.target.matches('[data-stats-date="to"]')) state.statsCustomTo = event.target.value;
}

function render() {
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-Hant-HK";
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });

  headerDate.textContent = formatHeaderDate(state.now);
  headerClock.textContent = formatClock(state.now);
  headerAge.textContent = t("age");
  const lastFeed = latestFeeding();
  headerLastFeedLabel.textContent = t("lastFeedHeader");
  headerLastFeedTime.textContent = lastFeed ? formatClock(lastFeed.date) : "--:--";
  headerLastFeedElapsed.textContent = lastFeed ? relativeAge(lastFeed.date) : t("noFeedYet");
  lastFeedGlance.setAttribute("aria-label", `${t("lastFeedHeader")}: ${lastFeed ? `${formatClock(lastFeed.date)}, ${relativeAge(lastFeed.date)}` : t("noFeedYet")}`);
  languageButton.textContent = state.lang === "en" ? "中" : "EN";
  languageButton.setAttribute("aria-label", t("switchLanguage"));
  document.querySelector('[data-tab="settings"]').setAttribute("aria-label", t("settingsLabel"));
  document.querySelector(".bottom-nav").setAttribute("aria-label", t("home"));
  document.querySelector("#nav-home").textContent = t("home");
  document.querySelector("#nav-stats").textContent = t("stats");
  document.querySelector("#nav-settings").textContent = t("settings");
  renderNotice();

  let page = renderPanel();
  if (state.activeTab === "timeline") page = renderTimelinePage();
  if (state.activeTab === "settings") page = renderSettingsPage();
  app.innerHTML = `${page}${renderStatsCustomModal()}${renderTemperatureModal()}${renderFeedingModal()}${renderRecordEditorModal()}${renderSubmitOverlay()}`;
}

function renderNotice() {
  if (!state.notice) {
    notice.innerHTML = "";
    notice.className = "notice";
    return;
  }
  notice.className = `notice is-visible ${state.notice.type}`;
  notice.innerHTML = `
    ${iconHtml(state.notice.type === "error" ? "temp" : "check")}
    <div>
      <div class="notice-title">${escapeHtml(state.notice.title)}</div>
      <div class="notice-detail">${escapeHtml(state.notice.detail)}</div>
    </div>
  `;
}

function renderPanel() {
  return `
    <div class="panel-grid">
      <section class="column-panel">
        <h2 class="panel-heading">${t("quickLog")}</h2>
        ${renderDiaperCard()}
        ${renderBottleCard()}
        ${renderTemperatureCard()}
      </section>
      <section class="column-panel">
        <h2 class="panel-heading">${t("current")}</h2>
        ${renderNowCard()}
        ${renderRecentCard(5)}
      </section>
      <section class="column-panel">
        <h2 class="panel-heading">${t("todayOverview")} <span>${t("todayRange")}</span></h2>
        ${renderInsightsCard()}
      </section>
    </div>
  `;
}

function renderDiaperCard() {
  return `
    <section class="card card-pad diaper-card">
      <div class="card-header">
        <div class="card-title">${iconHtml("diaper")}<h2>${t("diaperLog")}</h2></div>
        <button class="small-outline" type="button" data-action="time-now" data-scope="diaper">${t("nowTime")}</button>
      </div>
      ${renderTimeDisplay("diaper")}
      ${renderTimeControls("diaper")}
      ${renderIntensityControl("pee", state.diaper.pee)}
      ${renderIntensityControl("poo", state.diaper.poo)}
      <button class="primary-button cyan" type="button" data-action="save-diaper" ${savingAttr("diaper")}>
        ${state.saving === "diaper" ? `<span class="button-spinner"></span>${t("recording")}` : `${iconHtml("check")}${t("recordDiaper")}`}
      </button>
    </section>
  `;
}

function renderBottleCard() {
  return `
    <section class="card card-pad bottle-card">
      <div class="card-header">
        <div class="card-title">${iconHtml("bottle")}<h2>${t("bottleLog")}</h2></div>
        <button class="small-outline" type="button" data-action="time-now" data-scope="bottle">${t("nowTime")}</button>
      </div>
      ${renderTimeDisplay("bottle")}
      ${renderTimeControls("bottle")}
      <p class="section-label">${t("milkAmount")} <span>${t("perBlock")}</span></p>
      ${renderBottleMeter(state.preparedMl, "set-prepared-ml", 240, true)}
      <div class="bottle-action-row">
        <div class="bottle-total"><strong>${state.preparedMl}</strong><span>ml</span></div>
        <button class="medication-toggle ${state.medicineGiven ? "is-selected" : ""}" type="button"
          data-action="toggle-medicine" aria-pressed="${state.medicineGiven}" aria-label="${t("gaveMedicine")}">
          ${iconHtml("medicine")}
        </button>
      </div>
      <button class="primary-button" type="button" data-action="start-bottle">${iconHtml("bottle")}${t("startMilkTimer")}</button>
    </section>
  `;
}

function renderTemperatureCard() {
  const metrics = computeMetrics("rolling");
  return `
    <section class="card temperature-card">
      <div>
        <div class="card-title">${iconHtml("temp")}<h2>${t("temperatureLog")}</h2></div>
        <p class="temp-last">${t("latest")} ${metrics.lastTemp || "--"}${metrics.lastTempAt ? ` · ${formatClock(metrics.lastTempAt)}` : ""}</p>
      </div>
      <button class="temp-open-button" type="button" data-action="open-temperature">${t("recordTemperature")}</button>
    </section>
  `;
}

function renderTimeDisplay(scope) {
  return `<div class="time-line"><strong class="time-chip">${formatClock(effectiveTime(scope))}</strong><span class="time-now">${state.timeFollowing[scope] ? t("now") : t("adjusted")}</span></div>`;
}

function renderTimeControls(scope) {
  const steps = [[-30,"-30"],[-15,"-15"],[-5,"-5"],[-1,"-1"],[1,"+1"],[5,"+5"],[15,"+15"],[30,"+30"]];
  return `<div class="step-row">${steps.map(([minutes,label]) => `
    <button class="step-button" type="button" data-action="time-step" data-scope="${scope}" data-minutes="${minutes}">${label}</button>
  `).join("")}</div>`;
}

function renderIntensityControl(kind, selected, action = "set-intensity") {
  const icon = kind === "poo" ? "poo" : "pee";
  const values = ["none", "small", "medium", "large"];
  return `
    <div class="intensity-row">
      ${iconHtml(icon)}
      <div class="segmented-control" role="group" aria-label="${kind === "poo" ? t("pooAmount") : t("peeAmount")}">
        ${values.map((value) => `
          <button class="choice-button ${selected === value ? "is-selected" : ""}" type="button"
            data-action="${action}" data-kind="${kind}" data-value="${value}"
            aria-label="${kind === "poo" ? t("poo") : t("pee")} ${t(value)}">
            <span class="amount-icon ${kind === "poo" ? "amount-poo" : ""} amount-${value}" aria-hidden="true"></span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderBottleMeter(selectedMl, action, maxMl, showIndex) {
  const blocks = Math.max(1, Math.ceil(maxMl / 30));
  return `<div class="bottle-meter" style="grid-template-columns:repeat(${blocks},minmax(0,1fr))">${Array.from({length:blocks},(_,index) => {
    const ml = (index + 1) * 30;
    return `<div class="bottle-slot"><button class="bottle-block ${selectedMl >= ml ? "is-filled" : ""}" type="button" data-action="${action}" data-ml="${ml}" aria-label="${ml} ml"></button>${showIndex ? `<span class="bottle-index">${index + 1}</span>` : ""}</div>`;
  }).join("")}</div>`;
}

function renderNowCard() {
  const bottle = currentBottle();
  if (!bottle) {
    return `<section class="card card-pad now-card"><div class="card-header"><div class="card-title">${iconHtml("bottle")}<div><h2>${t("milkTimer")}</h2><p class="meta">${t("noActiveMilk")}</p></div></div></div><div class="empty-state">${t("noActiveHelp")}</div></section>`;
  }
  const remaining = bottle.expiresAt.getTime() - state.now.getTime();
  const progress = Math.max(0, Math.min(100, (remaining / 3600000) * 100));
  const expiryClass = remaining <= 0 ? "danger" : remaining <= 10 * 60000 ? "warning" : "";
  return `
    <section class="card card-pad now-card">
      <div class="card-header"><div class="card-title">${iconHtml("bottle")}<h2>${t("milkTimerRunning")}</h2></div></div>
      <div class="active-bottle">
        <div class="timer-value">${remaining <= 0 ? "-" : ""}${formatDuration(Math.abs(remaining))}</div>
        <div class="timer-label">${remaining <= 0 ? t("expired") : t("remainingTime")}</div>
        <div class="bottle-meta-grid">
          <div class="bottle-meta"><span class="label">${t("preparedAmount")}</span><span class="value">${bottle.preparedMl} ml</span></div>
          <div class="bottle-meta-divider"></div>
          <div class="bottle-meta"><span class="label">${t("startTime")}</span><span class="value">${formatClock(bottle.preparedAt)}</span></div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div>
        <p class="expiry-text ${expiryClass}">${t("validUntil", {time: formatClock(bottle.expiresAt)})}</p>
        ${bottle.medicineGiven ? `<p class="medication-note">${iconHtml("medicine")}${t("medicineGiven")}</p>` : ""}
        <button class="outline-button" type="button" data-action="open-finish">${iconHtml("check")}${t("finishFeed")}</button>
      </div>
    </section>
  `;
}

function renderFeedingModal() {
  if (!state.finishOpen) return "";
  const bottle = currentBottle();
  if (!bottle) return "";
  const maxMl = Math.max(30, bottle.preparedMl);
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card feeding-modal" role="dialog" aria-modal="true" aria-labelledby="feeding-title">
        <div class="modal-header">
          <h2 class="modal-title" id="feeding-title">${iconHtml("bottle")}${t("finishFeed")}</h2>
          <button class="close-button" data-action="close-finish" aria-label="${t("close")}">×</button>
        </div>
        <div class="feeding-summary">
          <div><span>${t("preparedAmount")}</span><strong>${bottle.preparedMl} ml</strong></div>
          <div><span>${t("startTime")}</span><strong>${formatClock(bottle.preparedAt)}</strong></div>
          <div><span>${t("drinkDuration")}</span><strong>${formatElapsed(bottle.preparedAt)}</strong></div>
        </div>
        <div class="modal-section">
          <p class="modal-label">${t("confirmActual")}</p>
          ${renderBottleMeter(state.actualMl,"set-actual-ml",maxMl,false)}
          <div class="feeding-amount"><strong>${state.actualMl}</strong><span>ml</span></div>
          <div class="finish-controls">
            <button class="secondary-button" data-action="finish-step" data-delta="-5">-5</button>
            <button class="secondary-button" data-action="finish-step" data-delta="5">+5</button>
            <button class="secondary-button" data-action="finish-full">${t("fullFeed")}</button>
            <button class="secondary-button" data-action="set-actual-ml" data-ml="0">${t("noMilk")}</button>
          </div>
          <button class="medication-toggle ${bottle.medicineGiven ? "is-selected" : ""}" type="button"
            data-action="toggle-active-medicine" aria-pressed="${bottle.medicineGiven}" aria-label="${t("gaveMedicine")}">
            ${iconHtml("medicine")}<span>${t("gaveMedicine")}</span>
          </button>
        </div>
        <button class="primary-button" data-action="save-feeding" ${savingAttr("feeding")}>
          ${state.saving === "feeding" ? `<span class="button-spinner"></span>${t("recording")}` : `${iconHtml("check")}${t("confirmFeed")}`}
        </button>
      </section>
    </div>
  `;
}

function renderRecentCard(limit) {
  const logs = state.logs.slice(0,limit).map(normalizeLog);
  return `<section class="recent-card"><div class="recent-header-row"><h2>${t("recentLogs")}</h2><button class="all-link" data-action="tab" data-tab="timeline">${t("viewAll")}</button></div>${logs.length ? `<div class="recent-list">${logs.map(renderRecentItem).join("")}</div>` : `<div class="empty-state">${t("noRecent")}</div>`}</section>`;
}

function renderRecentItem(log) {
  const title = log.type === "diaper"
    ? `<div class="recent-diaper-icons"><span class="amount-icon amount-${log.diaper.pee}" aria-label="${t("pee")} ${t(log.diaper.pee)}"></span><span class="amount-icon amount-poo amount-${log.diaper.poo}" aria-label="${t("poo")} ${t(log.diaper.poo)}"></span></div>`
    : `${escapeHtml(log.title)}${log.medicineGiven ? iconHtml("medicine") : ""}`;
  const content = `${iconHtml(log.icon, log.utility)}<div><div class="recent-time">${formatClock(log.date)}</div><div class="age">${relativeAge(log.date)}</div></div><div><div class="recent-title">${title}</div><div class="recent-detail">${escapeHtml(log.detail)}</div></div>`;
  if (isEditableRecordType(log.type)) {
    return `<article class="recent-item recent-item-editable">${content}<button class="recent-edit-button" type="button" data-action="open-record" data-id="${escapeHtml(log.id)}" aria-label="${t("editRecord")}: ${escapeHtml(log.title)}">${t("editShort")}</button></article>`;
  }
  return `<article class="recent-item recent-item-static">${content}<div></div></article>`;
}

function lockRecentRecordActions() {
  recentRecordLockedUntil = Date.now() + RECENT_RECORD_RESUME_GUARD_MS;
}

function recentRecordActionsLocked() {
  return Date.now() < recentRecordLockedUntil;
}

function renderInsightsCard() {
  const today = computeMetrics("today");
  const rolling = computeMetrics("rolling");
  const donut = today.preparedMilk ? Math.min(100,Math.round(today.actualMilk / today.preparedMilk * 100)) : 0;
  return `
    <section class="insight-card">
      <div class="overview-card today">
        <div class="milk-summary"><div class="hero-stat"><div class="label">${t("actualMilk")}</div><div class="value">${today.actualMilk}<span> ml</span></div><div class="sub">${t("feeds", {count: today.feedCount})}</div></div><div class="donut-wrap"><div class="donut" style="--donut:${donut}%"></div><div class="legend"><div class="legend-row"><span class="legend-dot"></span><span>${t("preparedMilk")}</span><strong>${today.preparedMilk} ml</strong></div><div class="legend-row"><span class="legend-dot soft"></span><span>${t("leftover")}</span><strong>${Math.max(0,today.preparedMilk-today.actualMilk)} ml</strong></div></div></div></div>
        <div class="stat-grid">
          <div class="stat-cell" aria-label="${t("pee")} ${today.peeCount} ${t("times")}">${iconHtml("pee")}<span class="value">${today.peeCount}<small> ${t("times")}</small></span></div>
          <div class="stat-cell" aria-label="${t("poo")} ${today.pooCount} ${t("times")}">${iconHtml("poo")}<span class="value">${today.pooCount}<small> ${t("times")}</small></span></div>
          <div class="stat-cell" aria-label="${t("latest")} ${t("temperature")} ${today.lastTemp || t("noValue")}">${iconHtml("temp")}<span class="value">${today.lastTemp || "--"}</span><span class="meta">${today.lastTempAt ? formatClock(today.lastTempAt) : ""}</span></div>
        </div>
      </div>
      <div class="overview-card rolling">
        <h2 class="panel-heading">${t("past26")} <span>(${formatRangeLabel(rolling.start,state.now)})</span></h2>
        <div class="rolling-grid"><div class="hero-stat"><div class="value">${rolling.actualMilk}<span> ml</span></div><div class="sub">${t("feeds", {count: rolling.feedCount})}</div></div>${renderBarChart(rolling.start,state.now)}</div>
        <div class="mini-stat-row"><div><p class="mini-label">${t("average")}</p><p class="meta"><strong>${rolling.avgFeed}</strong> ml</p></div><div class="stacked-stats"><div class="stacked-row">${iconHtml("pee")}<span class="visually-hidden">${t("pee")}</span><strong>${rolling.peeCount} ${t("times")}</strong></div><div class="stacked-row">${iconHtml("poo")}<span class="visually-hidden">${t("poo")}</span><strong>${rolling.pooCount} ${t("times")}</strong></div></div></div>
      </div>
      <div class="overview-card rhythm"><h2 class="panel-heading">${t("timeline26")}</h2>${renderRhythm(rolling.start,state.now)}</div>
    </section>
  `;
}

function renderBarChart(start,end) {
  const bars = buildHourlyBars(start,end,18);
  return `<div><div class="bar-chart">${bars.map(height => `<span class="bar" style="height:${height}%"></span>`).join("")}</div><div class="chart-labels"><span>${t("hour10")}</span><span>${t("hour16")}</span><span>${t("hour22")}</span><span>${t("hour04")}</span><span>${t("hour10")}</span><span>${t("currentLabel")}</span></div></div>`;
}

function renderRhythm(start,end) {
  const span = end.getTime() - start.getTime();
  const dots = state.logs.map(normalizeLog).filter(log => log.date >= start && log.date <= end).slice(0,20).map(log => {
    const left = ((log.date.getTime()-start.getTime())/span)*100;
    return `<span class="rhythm-dot" style="left:${left}%">${iconHtml(log.icon,log.utility)}<span class="rhythm-stem"></span></span>`;
  }).join("");
  return `<div><div class="rhythm-track"><div class="rhythm-line"></div>${dots}</div><div class="timeline-labels"><span>${t("hour10")}</span><span>${t("hour14")}</span><span>${t("hour18")}</span><span>${t("hour22")}</span><span>${t("hour02")}</span><span>${t("hour06")}</span><span>${t("hour10")}</span><span>${t("currentLabel")}</span></div></div>`;
}

function renderTemperatureModal() {
  if (!state.temperatureOpen) return "";
  return `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="temperature-title"><div class="modal-header"><h2 class="modal-title" id="temperature-title">${iconHtml("temp")}${t("recordTemperature")}</h2><button class="close-button" data-action="close-temperature" aria-label="${t("close")}">×</button></div><div class="modal-section"><p class="modal-label">${t("time")}</p><div class="modal-time">${formatClock(effectiveTime("temperature"))} <span class="time-now">${state.timeFollowing.temperature ? t("now") : t("adjusted")}</span></div>${renderTimeControls("temperature")}</div><div class="modal-section"><p class="modal-label">${t("temperature")}</p><div class="temp-display">${state.temperature.toFixed(1)}<span>°C</span></div><div class="temp-step-row"><button class="secondary-button" data-action="temp-step" data-delta="-0.5">-0.5</button><button class="secondary-button" data-action="temp-step" data-delta="-0.1">-0.1</button><button class="secondary-button" data-action="temp-step" data-delta="0.1">+0.1</button><button class="secondary-button" data-action="temp-step" data-delta="0.5">+0.5</button></div></div><button class="primary-button pink" data-action="save-temperature" ${savingAttr("temperature")}>${iconHtml("temp")}${t("recordTemperature")}</button></section></div>`;
}

function renderRecordEditorModal() {
  const editor = state.recordEditor;
  if (!editor) return "";
  const icon = editor.type === "feeding" ? "bottle" : editor.type === "diaper" ? "diaper" : "temp";
  const saving = state.saving === "record-update" || state.saving === "record-delete";
  return `
    <div class="modal-backdrop record-editor-backdrop" role="presentation">
      <section class="modal-card record-editor" role="dialog" aria-modal="true" aria-labelledby="record-editor-title">
        <div class="modal-header">
          <h2 class="modal-title" id="record-editor-title">${iconHtml(icon)}${t("editRecord")}</h2>
          <button class="close-button" type="button" data-action="close-record" aria-label="${t("close")}" ${saving ? "disabled" : ""}>×</button>
        </div>
        <div class="record-time-panel">
          <div>
            <p class="modal-label">${t("recordDate")}</p>
            <strong class="record-date-value">${formatRecordDate(editor.eventAt)}</strong>
          </div>
          <div class="record-day-controls">
            <button class="secondary-button" type="button" data-action="edit-time-step" data-minutes="-1440" aria-label="${t("previousDay")}">−1d</button>
            <button class="secondary-button" type="button" data-action="edit-time-step" data-minutes="1440" aria-label="${t("nextDay")}">+1d</button>
          </div>
          <div class="record-clock">${formatClock(editor.eventAt)}</div>
          <div class="step-row record-step-row">${[[-30,"-30"],[-15,"-15"],[-5,"-5"],[-1,"-1"],[1,"+1"],[5,"+5"],[15,"+15"],[30,"+30"]].map(([minutes,label]) => `<button class="step-button" type="button" data-action="edit-time-step" data-minutes="${minutes}">${label}</button>`).join("")}</div>
        </div>
        ${renderRecordEditorFields(editor)}
        <div class="record-primary-actions">
          <button class="primary-button" type="button" data-action="save-record" ${saving ? "disabled" : ""}>${iconHtml("check")}${t("saveChanges")}</button>
          <button class="danger-button" type="button" data-action="ask-delete-record" ${saving ? "disabled" : ""}>${t("deleteRecord")}</button>
        </div>
        ${editor.deleteConfirm ? `<div class="delete-confirmation" role="alert"><div><strong>${t("deleteConfirmTitle")}</strong><p>${t("deleteConfirmBody")}</p></div><div class="delete-confirm-actions"><button class="secondary-button" type="button" data-action="cancel-delete-record">${t("cancel")}</button><button class="danger-button solid" type="button" data-action="confirm-delete-record">${t("confirmDelete")}</button></div></div>` : ""}
      </section>
    </div>
  `;
}

function renderRecordEditorFields(editor) {
  if (editor.type === "diaper") {
    return `<div class="record-fields">${renderIntensityControl("pee", editor.pee, "edit-intensity")}${renderIntensityControl("poo", editor.poo, "edit-intensity")}</div>`;
  }
  if (editor.type === "temperature") {
    return `<div class="record-fields"><p class="modal-label">${t("temperature")}</p><div class="temp-display">${editor.temperature.toFixed(1)}<span>°C</span></div><div class="temp-step-row"><button class="secondary-button" data-action="edit-temp-step" data-delta="-0.5">-0.5</button><button class="secondary-button" data-action="edit-temp-step" data-delta="-0.1">-0.1</button><button class="secondary-button" data-action="edit-temp-step" data-delta="0.1">+0.1</button><button class="secondary-button" data-action="edit-temp-step" data-delta="0.5">+0.5</button></div></div>`;
  }
  return `<div class="record-fields feeding-edit-fields">
    ${renderRecordAmountEditor(t("actualAmount"), editor.actualMl, "edit-actual-step")}
    ${renderRecordAmountEditor(t("changePreparedAmount"), editor.preparedMl, "edit-prepared-step")}
    <button class="medication-toggle ${editor.medicineGiven ? "is-selected" : ""}" type="button" data-action="edit-toggle-medicine" aria-pressed="${editor.medicineGiven}">${iconHtml("medicine")}<span>${t("gaveMedicine")}</span></button>
  </div>`;
}

function renderRecordAmountEditor(label, value, action) {
  return `<div class="record-amount-row"><span>${label}</span><button class="secondary-button" type="button" data-action="${action}" data-delta="-5">−5</button><strong>${value}<small> ml</small></strong><button class="secondary-button" type="button" data-action="${action}" data-delta="5">+5</button></div>`;
}

function renderSubmitOverlay() {
  const flow = state.submitFlow;
  if (!flow) return "";
  if (flow.status === "saving") {
    return `<div class="submit-backdrop"><section class="submit-card" role="dialog" aria-modal="true" aria-live="polite"><h2>${escapeHtml(flow.savingTitle)}</h2><div class="submit-symbol">${iconHtml(flow.icon)}</div><p class="submit-helper">${t("submitWait")}</p></section></div>`;
  }
  if (flow.status === "error") {
    return `<div class="submit-backdrop"><section class="submit-card error" role="dialog" aria-modal="true"><h2>${t("submitFailed")}</h2><div class="submit-symbol">!</div><p class="submit-detail">${escapeHtml(flow.detail)}</p><button class="outline-button" data-action="dismiss-submit">${t("retry")}</button></section></div>`;
  }
  const label = flow.countdown ? `${t("gotIt")} (${flow.countdown})` : t("gotIt");
  return `<div class="submit-backdrop"><section class="submit-card success" role="dialog" aria-modal="true" aria-live="polite"><h2>${escapeHtml(flow.successTitle)}</h2><div class="submit-symbol">${iconHtml("check")}</div><p class="submit-detail">${escapeHtml(flow.detail)}</p><button class="outline-button" data-action="dismiss-submit">${label}</button></section></div>`;
}

function renderStatsCustomModal() {
  if (!state.statsCustomOpen) return "";
  return `<div class="modal-backdrop"><section class="modal-card stats-date-modal" role="dialog" aria-modal="true" aria-labelledby="stats-date-title"><div class="modal-header"><h2 class="modal-title" id="stats-date-title">${iconHtml("calendar",true)}${t("dateRange")}</h2><button class="close-button" type="button" data-action="close-custom-range" aria-label="${t("close")}">×</button></div><div class="stats-date-fields"><label><span>${t("startDate")}</span><input type="date" data-stats-date="from" value="${escapeHtml(state.statsCustomFrom)}"></label><label><span>${t("endDate")}</span><input type="date" data-stats-date="to" value="${escapeHtml(state.statsCustomTo)}"></label></div><button class="primary-button" type="button" data-action="apply-custom-range">${t("applyRange")}</button></section></div>`;
}

function renderTimelinePage() {
  const rangeButtons = [["today",t("statsToday")],["7",t("stats7")],["30",t("stats30")]];
  if (state.statsLoading && !state.statsLogs.length) {
    return `<div class="timeline-page"><section class="stats-dashboard"><div class="stats-toolbar"><div><h2>${t("statsTitle")}</h2><p>${t("statsSubtitle")}</p></div>${renderStatsRangeControls(rangeButtons)}</div><div class="stats-loading">${t("statsLoading")}</div></section></div>`;
  }

  const logs = state.statsLogs.map(normalizeLog).filter((log) => log.date <= state.now);
  const series = buildStatsDailySeries(logs);
  const todayKey = hongKongDateKey(state.now);
  const todayRow = series.find((row) => row.key === todayKey) || emptyStatsDay(todayKey);
  const baselineRows = series.filter((row) => row.key !== todayKey);
  const baseline = averageStatsDays(baselineRows.length ? baselineRows : series);
  const rangeSummary = averageStatsDays(series);
  const displayAverage = baselineRows.length ? baseline : rangeSummary;
  const temperatures = logs.filter((log) => log.type === "temperature");
  const latestTemperature = temperatures.sort((left,right) => right.date-left.date)[0];
  const averageTemperature = temperatures.length ? temperatures.reduce((sum,log) => sum + Number(log.raw.value_number || 0),0) / temperatures.length : 0;
  const recentLogs = logs.slice().sort((left,right) => right.date-left.date).slice(0,3);
  const comparisonDays = Math.max(1, baselineRows.length || series.length);

  return `<div class="timeline-page"><section class="stats-dashboard ${state.statsLoading ? "is-loading" : ""}">
    <div class="stats-toolbar">
      <div><h2>${t("statsTitle")}</h2><p>${t("statsSubtitle")}</p></div>
      ${renderStatsRangeControls(rangeButtons)}
    </div>
    <div class="stats-kpi-grid">
      ${renderStatsKpi("bottle",t("feeding"),`${Math.round(displayAverage.milk)}<small> ml ${t("perDay")}</small>`,comparisonText(todayRow.milk,baseline.milk,"ml"),comparisonTone(todayRow.milk,baseline.milk))}
      ${renderStatsKpi("pee",t("urineShort"),`${formatOne(displayAverage.pee)}<small> ${t("times")} ${t("perDay")}</small>`,comparisonText(todayRow.pee,baseline.pee,t("times")),comparisonTone(todayRow.pee,baseline.pee))}
      ${renderStatsKpi("poo",t("stoolShort"),`${formatOne(displayAverage.poo)}<small> ${t("times")} ${t("perDay")}</small>`,comparisonText(todayRow.poo,baseline.poo,t("times")),comparisonTone(todayRow.poo,baseline.poo))}
      ${renderStatsKpi("temp",t("temperature"),averageTemperature ? `${averageTemperature.toFixed(1)}<small>°C ${t("statsAverage")}</small>` : "--",latestTemperature ? `${t("latest")} ${Number(latestTemperature.raw.value_number || 0).toFixed(1)}°C` : t("noComparison"),"neutral")}
    </div>
    <div class="stats-row stats-rhythm-row">
      <article class="stats-card stats-life-card"><h3>${t("lifeTimeline")}</h3>${renderLifeSwimlane(logs)}</article>
      <article class="stats-card stats-summary-card"><h3>${t("summaryToday")}</h3><div class="stats-summary-body">${renderStatsInsights(todayRow,baseline,latestTemperature)}${renderTodayComparison(todayRow,baseline,comparisonDays)}</div></article>
    </div>
    <div class="stats-row stats-chart-row">
      <article class="stats-card"><h3>${t("milkTrend")}</h3>${renderMilkTrend(series,logs)}</article>
      <article class="stats-card"><h3>${t("diaperTrend")}</h3>${renderDiaperTrend(series)}</article>
    </div>
    <div class="stats-row stats-detail-row">
      <article class="stats-card"><h3>${t("feedDistribution")}</h3>${renderFeedDistribution(logs)}</article>
      <article class="stats-card"><h3>${t("temperatureTrend")}</h3>${renderTemperatureTrend(series)}</article>
    </div>
    <article class="stats-card stats-recent-strip"><div class="stats-recent-header"><h3>${t("rawRecent")}</h3><span>${statsRangeLabel()}</span></div><div class="stats-recent-grid">${recentLogs.length ? recentLogs.map(renderStatsRecentItem).join("") : `<p class="stats-empty">${t("noRecent")}</p>`}</div></article>
  </section></div>`;
}

function renderStatsRangeControls(buttons) {
  const disabled = state.statsLoading ? "disabled" : "";
  return `<div class="stats-range-control" aria-label="${t("dateRange")}">${buttons.map(([value,label]) => `<button type="button" data-action="stats-range" data-range="${value}" class="${state.statsRangeMode === value ? "is-selected" : ""}" ${disabled}>${label}</button>`).join("")}<button type="button" data-action="open-custom-range" class="${state.statsRangeMode === "custom" ? "is-selected" : ""}" ${disabled}>${t("statsCustom")}</button></div>`;
}

function renderStatsKpi(icon,label,value,comparison,tone) {
  return `<article class="stats-kpi">${iconHtml(icon)}<div><span class="stats-kpi-label">${label}</span><strong>${value}</strong><p class="${tone}">${comparison}</p></div></article>`;
}

function buildStatsDailySeries(logs) {
  const from = parseTimestamp(state.statsFrom) || new Date(state.now.getTime()-6*86400000);
  const to = parseTimestamp(state.statsTo) || state.now;
  const first = startOfHongKongDay(from);
  const last = startOfHongKongDay(to);
  const rows = [];
  for (let cursor = first.getTime(), count = 0; cursor <= last.getTime() && count < 30; cursor += 86400000, count += 1) {
    const date = new Date(cursor);
    rows.push(emptyStatsDay(hongKongDateKey(date),date));
  }
  const byKey = new Map(rows.map((row) => [row.key,row]));
  for (const log of logs) {
    const row = byKey.get(hongKongDateKey(log.date));
    if (!row) continue;
    if (log.type === "feeding") { row.milk += Number(log.raw.value_number || 0); row.feeds += 1; }
    if (log.type === "diaper") { if (log.diaper.pee !== "none") row.pee += 1; if (log.diaper.poo !== "none") row.poo += 1; }
    if (log.type === "temperature") row.temperatures.push(Number(log.raw.value_number || 0));
  }
  return rows;
}

function emptyStatsDay(key,date=parseTimestamp(`${key} 00:00:00+08:00`) || new Date()) { return {key,date,milk:0,feeds:0,pee:0,poo:0,temperatures:[]}; }

function averageStatsDays(rows) {
  const count = Math.max(1,rows.length);
  return rows.reduce((result,row) => ({milk:result.milk+row.milk/count,feeds:result.feeds+row.feeds/count,pee:result.pee+row.pee/count,poo:result.poo+row.poo/count}),{milk:0,feeds:0,pee:0,poo:0});
}

function comparisonText(today,average,unit) {
  if (!average) return t("noComparison");
  const difference = today-average;
  const threshold = Math.max(average*.1,unit === "ml" ? 20 : .5);
  if (Math.abs(difference) <= threshold) return t("closeToAverage");
  const value = unit === "ml" ? `${Math.round(Math.abs(difference))} ml` : `${formatOne(Math.abs(difference))} ${unit}`;
  return difference > 0 ? t("aboveAverage",{value}) : t("belowAverage",{value});
}

function comparisonTone(today,average) {
  if (!average || Math.abs(today-average) <= Math.max(average*.1,.5)) return "neutral";
  return today > average ? "up" : "down";
}

function renderLifeSwimlane(logs) {
  const end = state.now;
  const start = new Date(end.getTime()-24*3600000);
  const recent = logs.filter((log) => log.date >= start && log.date <= end);
  const labels = Array.from({length:7},(_,index) => formatClock(new Date(start.getTime()+index*4*3600000)));
  const lanes = [
    ["bottle",t("feeding"),recent.filter((log) => log.type === "feeding")],
    ["pee",t("urineShort"),recent.filter((log) => log.type === "diaper" && log.diaper.pee !== "none")],
    ["poo",t("stoolShort"),recent.filter((log) => log.type === "diaper" && log.diaper.poo !== "none")],
    ["temp",t("temperature"),recent.filter((log) => log.type === "temperature")],
  ];
  return `<div class="swimlane-labels">${labels.map((label) => `<span>${label}</span>`).join("")}</div><div class="swimlanes">${lanes.map(([icon,label,laneLogs]) => `<div class="swimlane"><div class="swimlane-name">${iconHtml(icon)}<span>${label}</span></div><div class="swimlane-track">${renderGroupedTimelineMarkers(laneLogs,start,end,icon)}</div></div>`).join("")}</div>`;
}

function renderGroupedTimelineMarkers(logs,start,end,icon) {
  const groups = new Map();
  const span = end-start;
  logs.forEach((log) => {
    const percentage = clamp(((log.date-start)/span)*100,1,99);
    const bin = Math.round(percentage/4);
    const group = groups.get(bin) || {percentage,total:0};
    group.total += 1;
    group.percentage = (group.percentage*(group.total-1)+percentage)/group.total;
    groups.set(bin,group);
  });
  return [...groups.values()].map((group) => `<span class="swimlane-marker" style="left:${group.percentage}%">${iconHtml(icon)}${group.total > 1 ? `<b>${group.total}</b>` : ""}</span>`).join("");
}

function renderStatsInsights(today,baseline,latestTemperature) {
  if (!today.milk && !today.pee && !today.poo && !latestTemperature) return `<div class="insight-list"><p>${t("noDataInsight")}</p></div>`;
  const milkRatio = baseline.milk ? today.milk/baseline.milk : 1;
  const milkKey = milkRatio > 1.12 ? "milkHighInsight" : milkRatio < .88 ? "milkLowInsight" : "milkNearInsight";
  const pooKey = baseline.poo && today.poo > baseline.poo*1.3+.5 ? "pooHighInsight" : "pooNearInsight";
  return `<div class="insight-list"><p>${iconHtml("bottle")}${t(milkKey)}</p><p>${iconHtml("poo")}${t(pooKey)}</p>${latestTemperature ? `<p>${iconHtml("temp")}${t("tempInsight",{value:`${Number(latestTemperature.raw.value_number || 0).toFixed(1)}°C`})}</p>` : ""}</div>`;
}

function renderTodayComparison(today,baseline,days) {
  const rows = [["bottle",t("feeding"),`${today.milk} ml`,`${Math.round(baseline.milk)} ml`],["pee",t("urineShort"),`${today.pee}`,formatOne(baseline.pee)],["poo",t("stoolShort"),`${today.poo}`,formatOne(baseline.poo)]];
  return `<div class="comparison-table"><div class="comparison-head"><span></span><b>${t("statsToday")}</b><b>${t("recentAverage")}</b></div>${rows.map(([icon,label,current,average]) => `<div class="comparison-row"><span>${iconHtml(icon)}${label}</span><b>${current}</b><b>${average}</b></div>`).join("")}</div>`;
}

function renderMilkTrend(series,logs) {
  const max = Math.max(1,...series.map((row) => row.milk));
  const average = series.length ? series.reduce((sum,row) => sum+row.milk,0)/series.length : 0;
  const feedLogs = logs.filter((log) => log.type === "feeding").sort((left,right) => left.date-right.date);
  const intervals = feedLogs.slice(1).map((log,index) => log.date-feedLogs[index].date).filter((value) => value > 0 && value < 12*3600000);
  const averageInterval = intervals.length ? intervals.reduce((sum,value) => sum+value,0)/intervals.length : 0;
  const feeds = series.reduce((sum,row) => sum+row.feeds,0);
  return `${renderDailyBars(series,(row) => row.milk,max,"milk")}<div class="chart-foot-stats"><span>${iconHtml("bottle")}<b>${feeds}</b> ${t("totalFeeds")}</span><span><b>${feeds ? Math.round(series.reduce((sum,row) => sum+row.milk,0)/feeds) : 0} ml</b> ${t("average")}</span><span><b>${averageInterval ? formatCompactDuration(averageInterval) : "--"}</b> ${t("averageInterval")}</span><span class="chart-average">${t("avgDaily")} ${Math.round(average)} ml</span></div>`;
}

function renderDailyBars(series,valueFor,max,tone) {
  return `<div class="daily-chart" style="--days:${Math.max(1,series.length)}">${series.map((row,index) => { const value=valueFor(row); const showLabel=series.length<=10 || index===0 || index===series.length-1 || index%5===0; return `<div class="daily-bar-column"><span class="daily-bar-value">${value || ""}</span><span class="daily-bar ${tone}" style="height:${Math.max(value ? 8 : 2,Math.round(value/max*72))}%"></span><span class="daily-bar-label">${showLabel ? formatShortDate(row.date) : ""}</span></div>`; }).join("")}</div>`;
}

function renderDiaperTrend(series) {
  const max = Math.max(1,...series.flatMap((row) => [row.pee,row.poo]));
  return `<div class="grouped-chart" style="--days:${Math.max(1,series.length)}">${series.map((row,index) => { const showLabel=series.length<=10 || index===0 || index===series.length-1 || index%5===0; return `<div class="grouped-column"><div><span class="grouped-bar pee" style="height:${Math.max(row.pee ? 8 : 2,Math.round(row.pee/max*72))}%"><b>${row.pee || ""}</b></span><span class="grouped-bar poo" style="height:${Math.max(row.poo ? 8 : 2,Math.round(row.poo/max*72))}%"><b>${row.poo || ""}</b></span></div><span>${showLabel ? formatShortDate(row.date) : ""}</span></div>`; }).join("")}</div><div class="chart-legend"><span>${iconHtml("pee")}${t("urineShort")}</span><span>${iconHtml("poo")}${t("stoolShort")}</span></div>`;
}

function renderFeedDistribution(logs) {
  const buckets = [{label:"≤60",min:0,max:75},{label:"90",min:76,max:105},{label:"120",min:106,max:135},{label:"150+",min:136,max:999}];
  const amounts = logs.filter((log) => log.type === "feeding").map((log) => Number(log.raw.value_number || 0));
  const total = Math.max(1,amounts.length);
  return `<div class="distribution-bar">${buckets.map((bucket) => { const count=amounts.filter((value) => value>=bucket.min && value<=bucket.max).length; const pct=Math.round(count/total*100); return `<div style="--share:${Math.max(12,pct)}"><span>${bucket.label} ml</span><b>${pct}%</b></div>`; }).join("")}</div>`;
}

function renderTemperatureTrend(series) {
  const points = series.map((row,index) => ({index,value:row.temperatures.length ? row.temperatures.reduce((sum,value) => sum+value,0)/row.temperatures.length : null,date:row.date})).filter((point) => point.value !== null);
  if (!points.length) return `<p class="stats-empty">${t("noRecent")}</p>`;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values)-.2;
  const maximum = Math.max(...values)+.2;
  const span = Math.max(.4,maximum-minimum);
  const width = 520, height = 66;
  const coordinates = points.map((point) => ({...point,x:series.length===1 ? width/2 : point.index/(series.length-1)*width,y:height-(point.value-minimum)/span*height}));
  return `<div class="temperature-chart"><svg viewBox="0 0 ${width} 82" role="img" aria-label="${t("temperatureTrend")}"><polyline points="${coordinates.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="2"/>${coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3"/><text x="${point.x}" y="${Math.max(10,point.y-7)}">${point.value.toFixed(1)}</text>`).join("")}</svg><div><b>${Math.max(...values).toFixed(1)}°C</b><span>${Math.min(...values).toFixed(1)}°C</span></div></div>`;
}

function renderStatsRecentItem(log) {
  return `<div class="stats-recent-item">${iconHtml(log.icon)}<div><b>${formatClock(log.date)}</b><span>${relativeAge(log.date)}</span></div><div><strong>${log.type === "diaper" ? t("diaperRecord") : log.title}</strong><span>${log.detail}</span></div></div>`;
}

function renderSettingsPage() {
  const bottle = currentBottle();
  const statusText = state.apiStatus.textKey ? t(state.apiStatus.textKey) : state.apiStatus.text;
  const statusClass = state.apiStatus.ok === true ? "ok" : state.apiStatus.ok === false ? "error" : "pending";
  return `<div class="settings-page"><section class="card card-pad"><div class="card-header"><div class="card-title">${iconHtml("settings",true)}<div><h2>${t("settings")}</h2><p class="meta">${t("dataPathDescription")}</p></div></div><button class="secondary-button" data-action="refresh">${t("refresh")}</button></div><div class="settings-grid"><div class="stat-cell"><span class="label">${t("dataSource")}</span><span class="value data-source-value">${escapeHtml(dataSourceLabel(state.dataPath))}</span></div><div class="stat-cell"><span class="label">API</span><span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span></div><div class="stat-cell"><span class="label">${t("localCache")}</span><span class="value">${t("records", {count: state.logs.length})}</span></div><div class="stat-cell"><span class="label">${t("milkTimer")}</span><span class="value">${bottle ? `${bottle.preparedMl} ml` : "--"}</span></div></div><div class="filter-row" style="margin-top:14px"><button class="secondary-button" data-action="clear-bottle">${t("clearTimer")}</button></div></section></div>`;
}

function dataSourceLabel(path) {
  if (path?.api === "apps_script" && path?.storage === "google_sheets") return t("dataSourceAppsScriptSheets");
  if (path?.api === "bb_data_api" && path?.storage === "mariadb") return t("dataSourceMariaDb");
  return t("dataSourceUnknown");
}

async function refreshData(reason) {
  try {
    const health = await getHealth();
    state.apiStatus = { ok:true, text:`${health.household_id || "hh_home"} · ${health.schema_version || "schema ok"}`, textKey:"" };
    state.dataPath = health.data_path || null;
    const request = statsRequestForDays(7);
    const logs = await fetchBabyLogPages(request,"iPad BB App 7-day refresh");
    state.logs = logs;
    localStorage.setItem(STORAGE_KEYS.logs,JSON.stringify(state.logs));
    if (!state.statsLoadedKey || state.statsRangeMode === "7") {
      state.statsLogs = logs;
      state.statsFrom = request.from;
      state.statsTo = request.to;
      state.statsLoadedKey = "7";
    }
    if (reason === "manual") showNotice(t("refreshed"),t("refreshedDetail", {count: state.logs.length}),"success");
  } catch (error) {
    state.apiStatus = {ok:false,text:"API offline",textKey:""};
    state.dataPath = null;
    if (reason !== "load" || !state.logs.length) showNotice(t("connectionFailed"),error.message || t("apiOffline"),"error");
  } finally { render(); }
}

async function fetchBabyLogPages(request,requestText) {
  const logs = [];
  let cursor = "";
  try {
    for (let page = 0; page < 10; page += 1) {
      const result = await callApi("query_baby_logs",{...request,limit:200,cursor},requestText);
      logs.push(...(Array.isArray(result?.items) ? result.items : []));
      if (!result?.page?.has_more || !result.page.next_cursor) break;
      cursor = result.page.next_cursor;
    }
    return logs;
  } catch (error) {
    if (Number(request.days || 7) > 7) throw error;
    const legacy = await callApi("get_recent_baby_logs",{limit:100},`${requestText} legacy fallback`);
    return Array.isArray(legacy) ? legacy : [];
  }
}

function statsRequestForDays(days) {
  const end = state.now;
  const start = new Date(startOfHongKongDay(end).getTime()-(days-1)*86400000);
  return {from:toHongKongTimestamp(start),to:toHongKongTimestamp(end),days};
}

async function loadStatsData(request,key) {
  if (state.statsLoading) return;
  state.statsLoading = true;
  render();
  try {
    const logs = await fetchBabyLogPages(request,`iPad BB App insights ${key}`);
    state.statsLogs = logs;
    state.statsFrom = request.from;
    state.statsTo = request.to;
    state.statsLoadedKey = key;
  } catch (error) {
    showNotice(t("connectionFailed"),error.message || t("apiOffline"),"error");
  } finally {
    state.statsLoading = false;
    render();
  }
}

async function getHealth() {
  const response = await fetch("/api/health",{cache:"no-store"});
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error || "Health check failed");
  return data.result || {};
}

async function callApi(action,payload,requestText) {
  const response = await fetch("/api/family-os",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action,payload,request_text:requestText})});
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error || "Family OS API request failed");
  return data.result;
}

async function runSave(key,requestText,payload,afterSave,display) {
  if (state.saving) return;
  window.clearInterval(state.submitTimer);
  state.saving = key;
  state.submitFlow = {status:"saving",icon:display.icon,savingTitle:display.savingTitle,kind:key};
  render();
  try {
    const clientRequestId = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : "";
    const result = await callApi("append_baby_log",{...payload,client_request_id:clientRequestId},requestText);
    afterSave?.(result);
    state.saving = "";
    state.submitFlow = {status:"success",icon:"check",successTitle:display.successTitle,detail:display.detail,countdown:key === "temperature" ? 2 : 0,kind:key};
    render();
    if (key === "temperature") scheduleSubmitDismiss();
    await refreshData("save");
  } catch (error) {
    state.saving = "";
    state.submitFlow = {status:"error",detail:error.message || t("saveFailed"),kind:key};
    render();
  }
}

function saveDiaper() {
  const {pee,poo} = state.diaper;
  if (pee === "none" && poo === "none") { showNotice(t("missingAmount"),t("chooseOne"),"error"); return; }
  const eventAt = new Date(effectiveTime("diaper"));
  const time = formatClock(eventAt);
  const readable = `尿尿 ${intensityLabels[pee].long}; 便便 ${intensityLabels[poo].long}`;
  const payload = {event_at:toHongKongTimestamp(eventAt),log_type:"diaper",log_subtype:"pee_poo",description:`BB 換片: ${readable}`,value_text:JSON.stringify({pee,poo}),remarks:"Recorded through iPad BB App"};
  runSave("diaper",`iPad BB App 換片: ${readable}`,payload,() => { resetTimeFollowing("diaper"); state.diaper = {pee:"medium",poo:"none"}; },{icon:"diaper",savingTitle:t("diaperSaving"),successTitle:t("diaperSuccess"),detail:t("diaperDetail", {time, pee:t(pee), poo:t(poo)})});
}

function startBottle() {
  const preparedAt = new Date(effectiveTime("bottle"));
  const bottle = {id:`local_${preparedAt.getTime()}`,preparedMl:state.preparedMl,medicineGiven:state.medicineGiven,preparedAt:preparedAt.toISOString(),expiresAt:new Date(preparedAt.getTime()+3600000).toISOString()};
  state.activeBottle = bottle; state.finishOpen = false; state.actualMl = bottle.preparedMl;
  localStorage.setItem(STORAGE_KEYS.activeBottle,JSON.stringify(bottle));
  showNotice(t("milkTimerStarted"),t("startedDetail", {ml:bottle.preparedMl,time:formatClock(preparedAt),medicine:bottle.medicineGiven ? t("medicineSuffix") : ""}),"success");
  resetTimeFollowing("bottle"); state.medicineGiven = false; render();
}

function saveFeeding() {
  const bottle = currentBottle(); if (!bottle) return;
  const finishedAt = new Date();
  const remarks = ["Recorded through iPad BB App",`prepared_ml=${bottle.preparedMl}`,`actual_ml=${state.actualMl}`,`medicine_given=${bottle.medicineGiven ? "true" : "false"}`,`prepared_at=${toHongKongTimestamp(bottle.preparedAt)}`,`expires_at=${toHongKongTimestamp(bottle.expiresAt)}`].join("; ");
  const payload = {event_at:toHongKongTimestamp(bottle.preparedAt),started_at:toHongKongTimestamp(bottle.preparedAt),ended_at:toHongKongTimestamp(finishedAt),log_type:"feeding",log_subtype:"formula_milk",value_number:state.actualMl,unit:"ml",remarks};
  const detail = `${state.actualMl} / ${bottle.preparedMl} ml · ${formatClock(bottle.preparedAt)}${bottle.medicineGiven ? t("medicineSuffix") : ""}`;
  runSave("feeding",`iPad BB App 完成飲奶: 沖奶 ${bottle.preparedMl} ml, 實飲 ${state.actualMl} ml${bottle.medicineGiven ? ", 有餵藥" : ""}`,payload,() => clearActiveBottle(false),{icon:"bottle",savingTitle:t("feedSaving"),successTitle:t("feedSuccess"),detail});
}

function saveTemperature() {
  const value = Number(state.temperature.toFixed(1));
  const eventAt = new Date(effectiveTime("temperature"));
  const time = formatClock(eventAt);
  const payload = {event_at:toHongKongTimestamp(eventAt),log_type:"temperature",log_subtype:"body",description:`BB 探熱 ${value.toFixed(1)}°C`,value_number:value,unit:"celsius",remarks:"Recorded through iPad BB App"};
  runSave("temperature",`iPad BB App 探熱 ${value.toFixed(1)}°C`,payload,() => { resetTimeFollowing("temperature"); },{icon:"temp",savingTitle:t("tempSaving"),successTitle:t("tempSuccess"),detail:`${value.toFixed(1)}°C · ${time}`});
}

function openRecordEditor(id) {
  const raw = [...state.logs,...state.statsLogs].find((log) => String(log.baby_log_id || "") === String(id || ""));
  if (!raw) return;
  const log = normalizeLog(raw);
  if (!isEditableRecordType(log.type)) {
    showNotice(t("unsupportedEdit"), log.title, "error");
    return;
  }
  const actualMl = Math.max(0, Number(raw.value_number || 0));
  const preparedMl = Math.max(actualMl, log.preparedMl || actualMl || 30);
  const boundedPreparedMl = clamp(Math.round(preparedMl / 5) * 5, 30, 240);
  const startedAt = parseTimestamp(raw.started_at) || log.date;
  const endedAt = parseTimestamp(raw.ended_at);
  state.recordEditor = {
    id: log.id,
    type: log.type,
    raw: {...raw},
    updatedAt: String(raw.updated_at || ""),
    eventAt: new Date(startedAt),
    feedingDurationMs: endedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : 0,
    actualMl: Math.min(Math.round(actualMl / 5) * 5, boundedPreparedMl),
    preparedMl: boundedPreparedMl,
    medicineGiven: log.medicineGiven,
    pee: log.diaper.pee,
    poo: log.diaper.poo,
    temperature: clamp(Number(raw.value_number || 36.8), 34, 42),
    deleteConfirm: false,
  };
  render();
}

function closeRecordEditor() {
  if (state.saving === "record-update" || state.saving === "record-delete") return;
  state.recordEditor = null;
  render();
}

function adjustRecordTime(minutes) {
  if (!state.recordEditor) return;
  state.recordEditor.eventAt = new Date(state.recordEditor.eventAt.getTime() + minutes * 60000);
  render();
}

function setRecordIntensity(kind, value) {
  if (!state.recordEditor || !["pee", "poo"].includes(kind) || !["none", "small", "medium", "large"].includes(value)) return;
  state.recordEditor[kind] = value;
  render();
}

function adjustRecordActualMl(delta) {
  if (!state.recordEditor) return;
  setRecordActualMl(state.recordEditor.actualMl + delta);
}

function setRecordActualMl(value) {
  if (!state.recordEditor) return;
  state.recordEditor.actualMl = clamp(Math.round(value / 5) * 5, 0, state.recordEditor.preparedMl);
  render();
}

function adjustRecordPreparedMl(delta) {
  if (!state.recordEditor) return;
  state.recordEditor.preparedMl = clamp(Math.round((state.recordEditor.preparedMl + delta) / 5) * 5, 30, 240);
  state.recordEditor.actualMl = Math.min(state.recordEditor.actualMl, state.recordEditor.preparedMl);
  render();
}

function adjustRecordTemperature(delta) {
  if (!state.recordEditor) return;
  state.recordEditor.temperature = clamp(Math.round((state.recordEditor.temperature + delta) * 10) / 10, 34, 42);
  render();
}

function toggleRecordMedicine() {
  if (!state.recordEditor) return;
  state.recordEditor.medicineGiven = !state.recordEditor.medicineGiven;
  render();
}

function setRecordDeleteConfirm(value) {
  if (!state.recordEditor) return;
  state.recordEditor.deleteConfirm = Boolean(value);
  render();
}

async function saveRecordChanges() {
  const editor = state.recordEditor;
  if (!editor || state.saving) return;
  let patch;
  let detail;
  if (editor.type === "diaper") {
    if (editor.pee === "none" && editor.poo === "none") {
      showNotice(t("missingAmount"), t("chooseOne"), "error");
      return;
    }
    const readable = `尿尿 ${intensityLabels[editor.pee].long}; 便便 ${intensityLabels[editor.poo].long}`;
    patch = {
      event_at: toHongKongTimestamp(editor.eventAt),
      log_subtype: "pee_poo",
      description: `BB 換片: ${readable}`,
      value_text: JSON.stringify({pee:editor.pee,poo:editor.poo}),
    };
    detail = t("diaperDetail", {time:formatClock(editor.eventAt),pee:t(editor.pee),poo:t(editor.poo)});
  } else if (editor.type === "temperature") {
    const value = Number(editor.temperature.toFixed(1));
    patch = {
      event_at: toHongKongTimestamp(editor.eventAt),
      log_subtype: "body",
      description: `BB 探熱 ${value.toFixed(1)}°C`,
      value_number: value,
      unit: "celsius",
    };
    detail = `${value.toFixed(1)}°C · ${formatClock(editor.eventAt)}`;
  } else {
    const preparedAt = new Date(editor.eventAt);
    const expiresAt = new Date(preparedAt.getTime() + 3600000);
    const endedAt = editor.feedingDurationMs ? new Date(preparedAt.getTime() + editor.feedingDurationMs) : "";
    patch = {
      event_at: toHongKongTimestamp(preparedAt),
      started_at: toHongKongTimestamp(preparedAt),
      ended_at: endedAt ? toHongKongTimestamp(endedAt) : "",
      log_subtype: editor.raw.log_subtype || "formula_milk",
      value_number: editor.actualMl,
      unit: "ml",
      remarks: updateFeedingRemarks(editor.raw.remarks, {
        prepared_ml: editor.preparedMl,
        actual_ml: editor.actualMl,
        medicine_given: editor.medicineGiven,
        prepared_at: toHongKongTimestamp(preparedAt),
        expires_at: toHongKongTimestamp(expiresAt),
      }),
    };
    detail = `${editor.actualMl} / ${editor.preparedMl} ml · ${formatClock(preparedAt)}${editor.medicineGiven ? t("medicineSuffix") : ""}`;
  }
  await runRecordMutation("update_baby_log", "record-update", {
    baby_log_id: editor.id,
    expected_updated_at: editor.updatedAt,
    patch,
  }, t("recordUpdating"), t("recordUpdated"), detail);
}

async function deleteRecord() {
  const editor = state.recordEditor;
  if (!editor || state.saving) return;
  await runRecordMutation("delete_baby_log", "record-delete", {
    baby_log_id: editor.id,
    expected_updated_at: editor.updatedAt,
  }, t("recordDeleting"), t("recordDeleted"), `${formatRecordDate(editor.eventAt)} · ${formatClock(editor.eventAt)}`);
}

async function runRecordMutation(action, savingKey, payload, savingTitle, successTitle, detail) {
  const editor = state.recordEditor;
  if (!editor) return;
  window.clearInterval(state.submitTimer);
  state.saving = savingKey;
  state.submitFlow = {status:"saving",icon:editor.type === "feeding" ? "bottle" : editor.type === "diaper" ? "diaper" : "temp",savingTitle,kind:savingKey};
  render();
  try {
    const result = await callApi(action, payload, `iPad BB App ${action}: ${editor.id}`);
    if (action === "delete_baby_log") state.logs = state.logs.filter((log) => log.baby_log_id !== editor.id);
    else state.logs = state.logs.map((log) => log.baby_log_id === editor.id ? result : log);
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(state.logs));
    state.recordEditor = null;
    state.saving = "";
    state.submitFlow = {status:"success",icon:"check",successTitle,detail,countdown:0,kind:savingKey};
    render();
    await refreshData("record-mutation");
  } catch (error) {
    state.saving = "";
    const message = /changed after|already been deleted/i.test(String(error.message || "")) ? t("recordChanged") : (error.message || t("saveFailed"));
    state.submitFlow = {status:"error",detail:message,kind:savingKey};
    render();
  }
}

function updateFeedingRemarks(remarks, values) {
  const structuredKeys = new Set(Object.keys(values));
  const parts = String(remarks || "").split(";").map((part) => part.trim()).filter(Boolean).filter((part) => {
    const match = /^([a-z_]+)=/i.exec(part);
    return !match || !structuredKeys.has(match[1].toLowerCase());
  });
  if (!parts.length) parts.push("Recorded through iPad BB App");
  Object.entries(values).forEach(([key,value]) => parts.push(`${key}=${value}`));
  return parts.join("; ");
}

function scheduleSubmitDismiss() {
  window.clearInterval(state.submitTimer);
  state.submitTimer = window.setInterval(() => {
    if (!state.submitFlow || state.submitFlow.kind !== "temperature") { window.clearInterval(state.submitTimer); return; }
    state.submitFlow.countdown -= 1;
    if (state.submitFlow.countdown <= 0) dismissSubmit(); else render();
  },1000);
}

function dismissSubmit() {
  if (state.submitFlow?.status === "saving") return;
  const kind = state.submitFlow?.kind;
  window.clearInterval(state.submitTimer);
  state.submitFlow = null;
  if (kind === "temperature") state.temperatureOpen = false;
  render();
}

function openTemperature() { state.temperatureOpen = true; resetTimeFollowing("temperature"); render(); }
function closeTemperature() { if (!state.saving) { state.temperatureOpen = false; render(); } }
function openFinishBottle() {
  const bottle = currentBottle();
  if (!bottle) return;
  window.clearTimeout(state.noticeTimer);
  state.notice = null;
  state.finishOpen = true;
  state.actualMl = Math.min(state.actualMl || bottle.preparedMl,bottle.preparedMl);
  render();
}
function closeFinishBottle() { state.finishOpen = false; render(); }
function clearActiveBottle(notifyUser) { state.activeBottle = null; state.finishOpen = false; state.actualMl = state.preparedMl; localStorage.removeItem(STORAGE_KEYS.activeBottle); if (notifyUser) showNotice(t("timerCleared"),t("localTimerRemoved"),"success"); render(); }
function setTab(tab) {
  state.activeTab = tab;
  render();
  if (tab === "timeline" && !state.statsLoadedKey) loadStatsData(statsRequestForDays(7),"7");
}
function adjustTime(scope,minutes) { state.times[scope] = new Date(effectiveTime(scope).getTime()+minutes*60000); state.timeFollowing[scope] = false; render(); }
function setTimeNow(scope) { resetTimeFollowing(scope); render(); }
function setIntensity(kind,value) { state.diaper[kind] = value; render(); }
function setPreparedMl(value) { state.preparedMl = clamp(value,30,240); render(); }
function toggleMedicine() { state.medicineGiven = !state.medicineGiven; render(); }
function toggleActiveMedicine() {
  if (!state.activeBottle) return;
  state.activeBottle.medicineGiven = !Boolean(state.activeBottle.medicineGiven);
  localStorage.setItem(STORAGE_KEYS.activeBottle,JSON.stringify(state.activeBottle));
  render();
}
function setActualMl(value) { state.actualMl = clamp(Math.round(value/5)*5,0,activeBottlePreparedMl()); render(); }
function setTemperature(value) { state.temperature = clamp(Math.round(value*10)/10,34,42); render(); }
function setTimelineFilter(filter) { state.timelineFilter = filter; render(); }
function setStatsRange(range) {
  if (!["today","7","30"].includes(range)) return;
  state.statsRangeMode = range;
  const days = range === "today" ? 7 : Number(range);
  loadStatsData(statsRequestForDays(days),range);
}
function openStatsCustomRange() {
  const endKey = hongKongDateKey(state.now);
  const startKey = hongKongDateKey(new Date(startOfHongKongDay(state.now).getTime()-6*86400000));
  state.statsCustomFrom = state.statsCustomFrom || startKey;
  state.statsCustomTo = state.statsCustomTo || endKey;
  state.statsCustomOpen = true;
  render();
}
function closeStatsCustomRange() { state.statsCustomOpen = false; render(); }
function applyStatsCustomRange() {
  const from = parseTimestamp(`${state.statsCustomFrom} 00:00:00+08:00`);
  let to = parseTimestamp(`${state.statsCustomTo} 23:59:59+08:00`);
  if (to && to > state.now) to = state.now;
  const days = from && to ? Math.floor((startOfHongKongDay(to)-startOfHongKongDay(from))/86400000)+1 : 0;
  if (!from || !to || from > to || days < 1 || days > 30) {
    showNotice(t("invalidRange"),`${state.statsCustomFrom || "--"} → ${state.statsCustomTo || "--"}`,"error");
    return;
  }
  state.statsCustomOpen = false;
  state.statsRangeMode = "custom";
  loadStatsData({from:toHongKongTimestamp(from),to:toHongKongTimestamp(to),days},`custom:${state.statsCustomFrom}:${state.statsCustomTo}`);
}
function toggleLanguage() { state.lang = state.lang === "zh" ? "en" : "zh"; localStorage.setItem(STORAGE_KEYS.language,state.lang); render(); }
function effectiveTime(scope) { return state.timeFollowing[scope] ? state.now : state.times[scope]; }
function resetTimeFollowing(scope) { state.timeFollowing[scope] = true; state.times[scope] = new Date(); }

function currentBottle() { if (!state.activeBottle) return null; return {...state.activeBottle,preparedAt:new Date(state.activeBottle.preparedAt),expiresAt:new Date(state.activeBottle.expiresAt)}; }
function activeBottlePreparedMl() { return currentBottle()?.preparedMl || state.preparedMl; }

function normalizeLog(raw) {
  const date = parseTimestamp(raw.event_at) || new Date();
  const type = String(raw.log_type || "other");
  const preparedMl = parseNumberFromRemarks(raw.remarks,"prepared_ml");
  const medicineGiven = parseBooleanFromRemarks(raw.remarks,"medicine_given");
  const diaper = parseDiaper(raw);
  let icon = "calendar", utility = true, title = raw.description || type, detail = raw.description || "";
  if (type === "feeding") { icon = "bottle"; utility = false; const actual = Number(raw.value_number || 0); title = preparedMl ? `${actual} / ${preparedMl} ml` : `${actual} ml`; detail = t("feedingRecord"); }
  if (type === "diaper") { icon = diaper.poo !== "none" ? "poo" : "pee"; utility = false; title = t("diaper"); detail = t("diaperRecord"); }
  if (type === "temperature") { icon = "temp"; utility = false; title = `${Number(raw.value_number || 0).toFixed(1)}°C`; detail = t("temperatureRecord"); }
  return {id:raw.baby_log_id || "",raw,date,type,icon,utility,title,detail,preparedMl,medicineGiven,diaper};
}

function parseDiaper(log) {
  try { const parsed = JSON.parse(log.value_text || ""); return {pee:parsed.pee || "none",poo:parsed.poo || "none"}; }
  catch { const text = `${log.description || ""} ${log.value_text || ""}`.toLowerCase(); return {pee:parseIntensityFromText(text,"pee") || "none",poo:parseIntensityFromText(text,"poo") || parseIntensityFromText(text,"stool") || "none"}; }
}

function isEditableRecordType(type) { return ["feeding", "diaper", "temperature"].includes(String(type)); }

function latestFeeding() {
  let latest = null;
  for (const raw of state.logs) {
    const log = normalizeLog(raw);
    if (log.type !== "feeding" || log.date > state.now) continue;
    if (!latest || log.date > latest.date) latest = log;
  }
  return latest;
}

function parseIntensityFromText(text,key) {
  const match = new RegExp(`${key}\\s*[:= ]\\s*(none|small|medium|large|無|少|中|多|少量|中量|多量)`,"i").exec(text);
  if (!match) return ""; const value = match[1];
  if (value === "無") return "none"; if (value === "少" || value === "少量") return "small"; if (value === "中" || value === "中量") return "medium"; if (value === "多" || value === "多量") return "large"; return value.toLowerCase();
}

function computeMetrics(mode) {
  const now = state.now; const start = mode === "today" ? startOfHongKongDay(now) : new Date(now.getTime()-26*3600000);
  const logs = state.logs.map(normalizeLog).filter(log => log.date >= start && log.date <= now);
  let actualMilk=0,preparedMilk=0,feedCount=0,peeCount=0,pooCount=0,lastTemp="",lastTempAt=null,lastFeed=null;
  for (const log of logs) {
    if (log.type === "feeding") { const actual=Number(log.raw.value_number || 0); actualMilk+=actual; preparedMilk+=log.preparedMl || actual; feedCount+=1; if (!lastFeed || log.date>lastFeed) lastFeed=log.date; }
    if (log.type === "diaper") { if (log.diaper.pee !== "none") peeCount+=1; if (log.diaper.poo !== "none") pooCount+=1; }
    if (log.type === "temperature" && (!lastTempAt || log.date>lastTempAt)) { lastTemp=`${Number(log.raw.value_number || 0).toFixed(1)}°C`; lastTempAt=log.date; }
  }
  return {start,actualMilk,preparedMilk,feedCount,peeCount,pooCount,lastTemp,lastTempAt,lastFeed,avgFeed:feedCount ? Math.round(actualMilk/feedCount) : 0};
}

function buildHourlyBars(start,end,count) {
  const span=end.getTime()-start.getTime(); const bins=Array.from({length:count},()=>0);
  state.logs.map(normalizeLog).forEach(log => { if (log.type !== "feeding" || log.date<start || log.date>end) return; const index=Math.min(count-1,Math.floor(((log.date.getTime()-start.getTime())/span)*count)); bins[index]+=Number(log.raw.value_number || 0); });
  const max=Math.max(...bins,1); return bins.map(value => Math.max(5,Math.round(value/max*86)));
}

function iconHtml(name,utility=false) { return `<span class="app-icon ${utility ? "utility-icon" : "event-icon"} icon-${name}" aria-hidden="true"></span>`; }
function toHongKongTimestamp(date) { const p=dateParts(date,{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}+08:00`; }
function startOfHongKongDay(date) { const p=dateParts(date,{year:"numeric",month:"2-digit",day:"2-digit"}); return parseTimestamp(`${p.year}-${p.month}-${p.day} 00:00:00+08:00`); }
function dateParts(date,options) { return Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:HK_TZ,...options}).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type,part.value])); }
function formatClock(date) { return new Intl.DateTimeFormat("en-GB",{timeZone:HK_TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date); }
function formatRecordDate(date) {
  return new Intl.DateTimeFormat(state.lang === "en" ? "en-GB" : "zh-Hant-HK", {timeZone:HK_TZ,year:"numeric",month:"short",day:"numeric",weekday:"short"}).format(date);
}
function formatHeaderDate(date) {
  if (state.lang === "en") return new Intl.DateTimeFormat("en-GB",{timeZone:HK_TZ,day:"numeric",month:"short",weekday:"short"}).format(date);
  const p=Object.fromEntries(new Intl.DateTimeFormat("zh-Hant-HK",{timeZone:HK_TZ,month:"numeric",day:"numeric",weekday:"long"}).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type,part.value]));
  return `${p.month}月${p.day}日（${p.weekday}）`;
}
function formatRangeLabel(start,end) { return `${relativeDayLabel(start)} ${formatClock(start)} → ${relativeDayLabel(end)} ${formatClock(end)}`; }
function hongKongDateKey(date) { const p=dateParts(date,{year:"numeric",month:"2-digit",day:"2-digit"}); return `${p.year}-${p.month}-${p.day}`; }
function formatShortDate(date) { const p=dateParts(date,{month:"numeric",day:"numeric"}); return `${p.month}/${p.day}`; }
function formatOne(value) { return Number(value || 0).toFixed(1).replace(/\.0$/,""); }
function formatCompactDuration(ms) { const minutes=Math.round(ms/60000); return `${Math.floor(minutes/60)}h ${minutes%60}m`; }
function statsRangeLabel() {
  const from = parseTimestamp(state.statsFrom), to = parseTimestamp(state.statsTo);
  return from && to ? `${formatShortDate(from)} – ${formatShortDate(to)}` : "";
}
function relativeDayLabel(date) { const day=startOfHongKongDay(date).getTime(),today=startOfHongKongDay(state.now).getTime(); if (day===today) return t("today"); if (day===today-86400000) return t("yesterday"); const p=dateParts(date,{month:"numeric",day:"numeric"}); return `${p.month}/${p.day}`; }
function parseTimestamp(value) { if (!value) return null; if (value instanceof Date) return value; const date=new Date(String(value).replace(" ","T")); return Number.isNaN(date.getTime()) ? null : date; }
function formatDuration(ms) { const total=Math.max(0,Math.floor(ms/1000)); return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
function relativeAge(date) { const minutes=Math.floor(Math.max(0,state.now-date)/60000); if (minutes<1) return t("justNow"); if (minutes<60) return t("minutesAgo",{minutes}); const hours=Math.floor(minutes/60),rest=minutes%60; return rest ? t("hoursMinutesAgo",{hours,minutes:rest}) : t("hoursAgo",{hours}); }
function formatElapsed(date) { const minutes=Math.floor(Math.max(0,state.now-date)/60000); if (minutes<1) return t("justNow"); if (minutes<60) return t("minutesDuration",{minutes}); const hours=Math.floor(minutes/60),rest=minutes%60; return rest ? t("hoursMinutesDuration",{hours,minutes:rest}) : t("hoursDuration",{hours}); }
function parseNumberFromRemarks(remarks,key) { const match=new RegExp(`${key}=([0-9]+(?:\\.[0-9]+)?)`).exec(String(remarks || "")); return match ? Number(match[1]) : 0; }
function parseBooleanFromRemarks(remarks,key) { const match=new RegExp(`${key}=(true|false)`,"i").exec(String(remarks || "")); return match ? match[1].toLowerCase() === "true" : false; }
function savingAttr(key) { return state.saving === key ? "disabled" : ""; }
function clamp(value,min,max) { return Math.max(min,Math.min(max,value)); }
function showNotice(title,detail,type="success") { window.clearTimeout(state.noticeTimer); state.notice={title,detail,type}; state.noticeTimer=window.setTimeout(() => { state.notice=null; render(); },2400); render(); }
function t(key,vars={}) { const template=I18N[state.lang]?.[key] ?? I18N.zh[key] ?? key; return String(template).replace(/\{(\w+)\}/g,(_,name) => vars[name] ?? `{${name}}`); }
function readJson(key,fallback) { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
