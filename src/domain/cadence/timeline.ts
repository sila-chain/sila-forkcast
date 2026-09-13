import { networkUpgrades, NetworkUpgrade } from '../../data/upgrades';
import {
  parseShortDate,
  parseLocalDate,
  daysBetween,
} from '../../components/schedule/forkDateCalculator';

const MONTH_DAYS = 365.25 / 12;

/**
 * Included SIPs per post-Merge fork.
 *
 * Forkcast's own SIP dataset only reaches back to Pectra, so Shapella and Dencun
 * are literals sourced from sila.org and SIP-7569 respectively. Pectra and
 * Fusaka are derivable — `timeline.test.ts` asserts these numbers against
 * `eipsData` so the table can't silently drift, without making this module pull
 * the 630 KB SIP chunk into the page.
 *
 * `derivable` marks which entries the test checks.
 */
export const FORK_EIP_COUNTS: Record<string, { sips: number; derivable: boolean }> = {
  Shapella: { sips: 5, derivable: false },
  Dencun: { sips: 9, derivable: false },
  Pectra: { sips: 12, derivable: true },
  Fusaka: { sips: 13, derivable: true },
};

/**
 * Total lines of specification markdown per fork, summed over its included
 * SIPs' files in `public/sips/`. SIP count is a poor proxy for how much a fork
 * actually specifies, so this is the second half of the payload picture.
 *
 * Literals for the same reason as FORK_EIP_COUNTS; `timeline.test.ts` recomputes
 * them from the markdown so they can't drift.
 */
export const FORK_SPEC_LINES: Record<string, number> = {
  Shapella: 385,
  Dencun: 1455,
  Pectra: 3354,
  Fusaka: 1943,
};

/**
 * The next fork's spec volume across its scheduled SIPs. Moves both as SIPs are
 * scheduled or dropped and as their specs are edited, so it drifts faster than
 * anything above; `timeline.test.ts` recomputes it too.
 */
export const NEXT_FORK_SPEC_LINES: Record<string, number> = {
  Glamsterdam: 4159,
};

/**
 * A shipped fork's payload is its `Included` SIPs. A fork still in planning has
 * none yet, so the comparable count is what's locked in for it: `Scheduled` plus
 * `Networking`. Networking SIPs belong in both — Fusaka's Included set contains
 * SIP-7642 (sil/69) — whereas `Informational` SIPs are process documents rather
 * than shipped changes and are excluded from each.
 */
export const SHIPPED_STATUSES = ['Included'];
export const PLANNED_STATUSES = ['Scheduled', 'Networking'];

/**
 * The next upgrade's locked-in SIP count. Same literal-plus-drift-test approach
 * as FORK_EIP_COUNTS, for the same reason: keep the 630 KB SIP chunk off this
 * page. Unlike a shipped fork this moves as SIPs are scheduled or dropped, so
 * the test matters more here.
 */
export const NEXT_FORK_EIP_COUNT: Record<string, number> = {
  Glamsterdam: 23,
};

/** Strip the trailing "Upgrade" so "Fusaka Upgrade" reads as "Fusaka". */
export const shortUpgradeName = (name: string): string => name.replace(/\s+Upgrade$/i, '');

/**
 * Where the axis starts. The Merge is not a data point on this chart — it has no
 * comparable SIP payload, and it was the largest change in Sila's history, so
 * any bar drawn for it would mislead. It is the zero of the time axis and nothing
 * more, which is why it carries no height or gap.
 */
export interface TimelineOrigin {
  id: string;
  name: string;
  date: Date;
  activationDate: string;
  /** 0–100, position along the time axis. The axis zero, so the leftmost mark. */
  offsetPct: number;
}

export interface TimelineFork {
  id: string;
  /** "Fusaka" — the upgrade name without the "Upgrade" suffix. */
  name: string;
  date: Date;
  /** Formatted activation date as it appears in the upgrade data. */
  activationDate: string;
  /** 0–100, position along the time axis. */
  offsetPct: number;
  /** Included SIP count, or null when the fork predates our SIP coverage. */
  sips: number | null;
  /** 0–100, bar height as a share of the largest fork on the timeline. */
  heightPct: number;
  /** Days since the previous upgrade (or since the origin, for the first fork). */
  gapDays: number;
}

export interface TimelineGap {
  /** The fork this gap leads into, or null for the open trailing gap. */
  toFork: string | null;
  days: number;
  startPct: number;
  widthPct: number;
  /** The trailing gap is still running, so its length is not yet final. */
  open: boolean;
}

/**
 * The next upgrade, drawn from its working estimate and the SIPs already locked
 * in for it. It renders in the same grammar as a shipped fork (position = date,
 * height = payload) but hollow, because the date is a planning assumption and
 * the payload can still move. Neither is announced, and the UI has to say so.
 */
export interface CadenceProjection {
  id: string;
  name: string;
  path: string;
  date: Date;
  offsetPct: number;
  sips: number;
  heightPct: number;
  /** Days from the last shipped fork to the estimate. */
  gapDays: number;
  /** SIPs per month across that gap, comparable to a shipped fork's rate. */
  perMonth: number;
  /** Days from today to the estimate; negative once the estimate has slipped. */
  daysFromNow: number;
  /** True once today is past the estimate. */
  overdue: boolean;
}

export interface CadenceTimeline {
  start: Date;
  end: Date;
  /** The axis zero — rendered as a scale label, never as a bar. */
  origin: TimelineOrigin;
  /** Payload-bearing upgrades only; the origin is not among them. */
  forks: TimelineFork[];
  gaps: TimelineGap[];
  /** Year boundaries falling inside the axis, for tick marks and gridlines. */
  yearTicks: { year: number; offsetPct: number }[];
  /** Position of "now" on the axis. */
  nowPct: number;
  daysSinceLast: number;
  lastFork: TimelineFork;
  /** Median of the closed gaps, for context in the fine print. */
  medianGapDays: number;
  /** Null when no upcoming upgrade has a working estimate yet. */
  projection: CadenceProjection | null;
}

/** Trailing empty space so the last marker isn't flush against the edge. */
const HEADROOM_PCT = 8;
/** Leading empty space, so the origin's label can centre on its mark like the rest. */
const LEAD_PCT = 7;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
};

const liveUpgrades = (upgrades: NetworkUpgrade[]) =>
  upgrades
    .filter(
      (u): u is NetworkUpgrade & { activationDate: string } =>
        u.status === 'Live' && !!u.activationDate && parseShortDate(u.activationDate) !== null,
    )
    .map((u) => ({ upgrade: u, date: parseShortDate(u.activationDate)! }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

/**
 * Lays the post-Merge upgrades out on a true-to-scale time axis running from The
 * Merge to today. Horizontal distance is elapsed time, so the gaps between bars
 * *are* the cadence; bar height is the fork's SIP payload. Both variables land in
 * one object, which is the whole point — the story is that the gaps shrank while
 * the bars grew.
 */
/** The next upgrade with a working estimate, in schedule order. */
const nextEstimated = (upgrades: NetworkUpgrade[], after: Date) => {
  const candidates = upgrades
    .filter((u) => u.status !== 'Live' && !!u.projectedActivation)
    .map((u) => ({ upgrade: u, date: parseLocalDate(u.projectedActivation!) }))
    .filter((c) => c.date.getTime() > after.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0] ?? null;
};

export function buildCadenceTimeline(
  now: Date,
  upgrades: NetworkUpgrade[] = networkUpgrades,
  eipCounts: Record<string, { sips: number }> = FORK_EIP_COUNTS,
  plannedCounts: Record<string, number> = NEXT_FORK_EIP_COUNT,
): CadenceTimeline | null {
  const live = liveUpgrades(upgrades);
  if (live.length < 2) return null;

  const start = live[0].date;
  if (daysBetween(start, now) <= 0) return null;

  const gapDays = live.slice(1).map((entry, i) => daysBetween(live[i].date, entry.date));
  const medianGapDays = median(gapDays);

  const lastDate = live[live.length - 1].date;
  const daysSinceLast = Math.max(0, daysBetween(lastDate, now));

  const next = nextEstimated(upgrades, lastDate);
  const nextName = next ? shortUpgradeName(next.upgrade.name) : null;
  const nextEips = nextName != null ? (plannedCounts[nextName] ?? null) : null;

  // The axis runs to whichever is later, today or the estimate, so the projected
  // bar stays on the chart whether the estimate is still ahead of today or has
  // already slipped past it.
  const axisEnd = next && next.date.getTime() > now.getTime() ? next.date : now;
  const axisDays = daysBetween(start, axisEnd);
  const pctPerDay = (100 - HEADROOM_PCT - LEAD_PCT) / axisDays;
  const at = (date: Date) => LEAD_PCT + daysBetween(start, date) * pctPerDay;

  // The projected fork shares the bar scale, so it has to be in the max or a
  // bigger upcoming payload would overflow the plot.
  const maxEips = Math.max(...Object.values(eipCounts).map((c) => c.sips), nextEips ?? 0);

  const originEntry = live[0];
  const origin: TimelineOrigin = {
    id: originEntry.upgrade.id,
    name: shortUpgradeName(originEntry.upgrade.name),
    date: originEntry.date,
    activationDate: originEntry.upgrade.activationDate,
    offsetPct: at(originEntry.date),
  };

  const forks: TimelineFork[] = live.slice(1).map((entry, i) => {
    const name = shortUpgradeName(entry.upgrade.name);
    const sips = eipCounts[name]?.sips ?? null;
    return {
      id: entry.upgrade.id,
      name,
      date: entry.date,
      activationDate: entry.upgrade.activationDate,
      offsetPct: at(entry.date),
      sips,
      heightPct: sips == null ? 0 : (sips / maxEips) * 100,
      gapDays: gapDays[i],
    };
  });

  const gaps: TimelineGap[] = forks.map((fork, i) => {
    // The first gap is measured from the origin, which sits at the axis zero.
    const from = i === 0 ? origin.offsetPct : forks[i - 1].offsetPct;
    return {
      toFork: fork.name,
      days: fork.gapDays,
      startPct: from,
      widthPct: fork.offsetPct - from,
      open: false,
    };
  });

  const lastFork = forks[forks.length - 1];
  const nowPct = at(now);
  gaps.push({
    toFork: null,
    days: daysSinceLast,
    startPct: lastFork.offsetPct,
    widthPct: nowPct - lastFork.offsetPct,
    open: true,
  });

  const yearTicks: { year: number; offsetPct: number }[] = [];
  for (let year = start.getFullYear() + 1; year <= axisEnd.getFullYear(); year++) {
    const boundary = new Date(year, 0, 1);
    if (boundary.getTime() > axisEnd.getTime()) break;
    yearTicks.push({ year, offsetPct: at(boundary) });
  }

  return {
    start,
    end: axisEnd,
    origin,
    forks,
    gaps,
    yearTicks,
    nowPct,
    daysSinceLast,
    lastFork,
    medianGapDays,
    projection:
      next && nextName != null && nextEips != null
        ? {
            id: next.upgrade.id,
            name: nextName,
            path: next.upgrade.path,
            date: next.date,
            offsetPct: at(next.date),
            sips: nextEips,
            heightPct: (nextEips / maxEips) * 100,
            gapDays: daysBetween(lastDate, next.date),
            perMonth: nextEips / (daysBetween(lastDate, next.date) / MONTH_DAYS),
            daysFromNow: daysBetween(now, next.date),
            overdue: now.getTime() > next.date.getTime(),
          }
        : null,
  };
}

export interface CadenceStats {
  /** Closed gaps only — the open trailing gap isn't a data point yet. */
  gapDays: number[];
  /** SIPs per 30 days, for forks with a known SIP count. */
  rates: { name: string; sips: number; days: number; perMonth: number }[];
  /** Spec markdown volume, absolute and per month, for forks we have specs for. */
  spec: { name: string; lines: number; linesPerMonth: number }[];
  /** The next fork's scheduled spec volume, in the same shape as a shipped one. */
  specProjection: { name: string; lines: number; linesPerMonth: number } | null;
}

export function buildCadenceStats(
  timeline: CadenceTimeline,
  specLines: Record<string, number> = FORK_SPEC_LINES,
  plannedSpecLines: Record<string, number> = NEXT_FORK_SPEC_LINES,
): CadenceStats {
  const rates = timeline.forks
    .filter((f): f is TimelineFork & { sips: number } => f.sips != null)
    .map((f) => ({
      name: f.name,
      sips: f.sips,
      days: f.gapDays,
      perMonth: f.sips / (f.gapDays / MONTH_DAYS),
    }));

  const spec = timeline.forks
    .filter((f) => specLines[f.name] != null)
    .map((f) => ({
      name: f.name,
      lines: specLines[f.name],
      linesPerMonth: specLines[f.name] / (f.gapDays / MONTH_DAYS),
    }));

  const { projection } = timeline;
  const projectedLines = projection ? plannedSpecLines[projection.name] : undefined;
  const specProjection =
    projection && projectedLines != null
      ? {
          name: projection.name,
          lines: projectedLines,
          linesPerMonth: projectedLines / (projection.gapDays / MONTH_DAYS),
        }
      : null;

  return { gapDays: timeline.forks.map((f) => f.gapDays), rates, spec, specProjection };
}
