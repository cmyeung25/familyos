const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";
const HOUR_MS = 60 * 60 * 1000;
const POO_SCORES = { none: 0, small: 1, medium: 2, large: 3 };

function asDate(value) {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hongKongDateKey(value) {
  const date = asDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hongKongDayStart(value) {
  const key = hongKongDateKey(value);
  return key ? new Date(`${key}T00:00:00+08:00`) : null;
}

function feedingEvents(logs) {
  return logs
    .filter((log) => (log?.type ?? log?.raw?.log_type ?? log?.log_type) === "feeding")
    .map((log) => ({
      ...log,
      // The expanded view may receive raw API records or already-normalized PWA records.
      // Never substitute an invalid event time with the current time in an insight.
      date: asDate(log.date ?? log.raw?.event_at ?? log.event_at),
      milk: Number(log.milk ?? log.raw?.value_number ?? log.value_number ?? 0),
    }))
    .filter((log) => log.date && Number.isFinite(log.milk))
    .sort((left, right) => left.date - right.date);
}

export function buildNightSleepWindows(logs, { from, to, now = new Date() } = {}) {
  const rangeFrom = asDate(from);
  const rangeTo = asDate(to);
  const current = asDate(now);
  if (!rangeFrom || !rangeTo || !current || rangeFrom > rangeTo) return [];

  const feeds = feedingEvents(logs);
  const firstDay = hongKongDayStart(new Date(rangeFrom.getTime() - 24 * HOUR_MS));
  const lastDay = hongKongDayStart(rangeTo);
  const sessions = [];

  for (let day = firstDay.getTime(); day <= lastDay.getTime(); day += 24 * HOUR_MS) {
    const boundary = new Date(day + 4 * HOUR_MS);
    const bedtime = feeds.filter((feed) => feed.date < boundary && feed.date >= new Date(boundary.getTime() - 18 * HOUR_MS)).at(-1);
    const wake = feeds.find((feed) => feed.date >= boundary && feed.date <= current && feed.date <= new Date(boundary.getTime() + 15 * HOUR_MS));
    if (!bedtime || !wake) continue;

    // The final feed is treated as a one-hour feeding session before sleep begins.
    const sleepStart = new Date(bedtime.date.getTime() + HOUR_MS);
    const durationMs = wake.date.getTime() - sleepStart.getTime();
    if (durationMs <= 0 || durationMs > 16 * HOUR_MS) continue;
    sessions.push({
      dateKey: hongKongDateKey(boundary),
      lastFeedAt: bedtime.date,
      bedtime: sleepStart,
      wake: wake.date,
      durationMs,
      inRange: wake.date >= rangeFrom && wake.date <= rangeTo,
    });
  }
  return sessions;
}

export function buildRollingMilkSeries(logs, { from, to, windowHours = 26 } = {}) {
  const rangeFrom = asDate(from);
  const rangeTo = asDate(to);
  if (!rangeFrom || !rangeTo || rangeFrom >= rangeTo) return [];

  const feeds = feedingEvents(logs);
  const span = rangeTo.getTime() - rangeFrom.getTime();
  const stepHours = span <= 36 * HOUR_MS ? 2 : span <= 8 * 24 * HOUR_MS ? 4 : 6;
  const stepMs = stepHours * HOUR_MS;
  const points = [];

  const appendPoint = (at) => {
    const windowStart = at.getTime() - windowHours * HOUR_MS;
    const matching = feeds.filter((feed) => feed.date > windowStart && feed.date <= at);
    points.push({
      date: new Date(at),
      milk: matching.reduce((sum, feed) => sum + feed.milk, 0),
      feeds: matching.length,
    });
  };

  for (let point = rangeFrom.getTime(); point < rangeTo.getTime(); point += stepMs) appendPoint(new Date(point));
  appendPoint(rangeTo);
  return points;
}

export function summarizePooIntensity(logs) {
  const counts = { small: 0, medium: 0, large: 0 };
  for (const log of logs) {
    if (log?.type !== "diaper") continue;
    const intensity = String(log.diaper?.poo || "none").toLowerCase();
    if (Object.hasOwn(counts, intensity)) counts[intensity] += 1;
  }
  const total = counts.small + counts.medium + counts.large;
  const weightedScore = counts.small * POO_SCORES.small + counts.medium * POO_SCORES.medium + counts.large * POO_SCORES.large;
  return { counts, total, weightedScore, averageScore: total ? weightedScore / total : 0 };
}
