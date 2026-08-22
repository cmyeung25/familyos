import assert from "node:assert/strict";
import test from "node:test";
import { buildNightSleepWindows, buildRollingMilkSeries, summarizePooIntensity } from "../public/insights.mjs";

function feed(at, milk = 120) {
  return { type: "feeding", date: new Date(at), raw: { value_number: milk } };
}

test("derives an overnight sleep proxy around the 04:00 Hong Kong boundary", () => {
  const sessions = buildNightSleepWindows([
    feed("2026-08-20T23:30:00+08:00"),
    feed("2026-08-21T03:30:00+08:00"),
    feed("2026-08-21T07:10:00+08:00"),
  ], {
    from: "2026-08-21T00:00:00+08:00",
    to: "2026-08-21T12:00:00+08:00",
    now: "2026-08-21T12:00:00+08:00",
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].bedtime.toISOString(), "2026-08-20T19:30:00.000Z");
  assert.equal(sessions[0].wake.toISOString(), "2026-08-20T23:10:00.000Z");
  assert.equal(sessions[0].durationMs, 3 * 60 * 60 * 1000 + 40 * 60 * 1000);
});

test("calculates rolling 26-hour milk totals independently of midnight", () => {
  const points = buildRollingMilkSeries([
    feed("2026-08-20T23:30:00+08:00", 120),
    feed("2026-08-21T07:10:00+08:00", 150),
    feed("2026-08-21T13:30:00+08:00", 120),
  ], {
    from: "2026-08-21T00:00:00+08:00",
    to: "2026-08-21T14:00:00+08:00",
  });

  assert.equal(points.at(-1).milk, 390);
  assert.equal(points.at(-1).feeds, 3);
});

test("summarizes stool quantity as a weighted score and distribution", () => {
  const summary = summarizePooIntensity([
    { type: "diaper", diaper: { poo: "small" } },
    { type: "diaper", diaper: { poo: "medium" } },
    { type: "diaper", diaper: { poo: "large" } },
    { type: "diaper", diaper: { poo: "none" } },
  ]);

  assert.deepEqual(summary.counts, { small: 1, medium: 1, large: 1 });
  assert.equal(summary.total, 3);
  assert.equal(summary.weightedScore, 6);
  assert.equal(summary.averageScore, 2);
});
