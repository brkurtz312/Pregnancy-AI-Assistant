export interface PregnancyResults {
  edd: Date;
  lmp: Date;
  conception: Date;
  currentGestationalAgeDays: number;
  currentGestationalAgeWeeks: number;
  currentGestationalAgeRemainderDays: number;
  daysUntilDue: number;
  trimester: 1 | 2 | 3;
  progressPercentage: number;
}

export const PREGNANCY_DURATION_DAYS = 280;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

function differenceInDays(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function calculateTrimester(gaDays: number): 1 | 2 | 3 {
  if (gaDays < 14 * 7) return 1;
  if (gaDays < 28 * 7) return 2;
  return 3;
}

function calculateCommonResults(lmpDate: Date): PregnancyResults {
  const today = startOfDay(new Date());
  const lmp = startOfDay(lmpDate);
  const edd = addDays(lmp, PREGNANCY_DURATION_DAYS);
  const conception = addDays(lmp, 14);
  const currentGestationalAgeDays = Math.max(0, differenceInDays(today, lmp));
  const currentGestationalAgeWeeks = Math.floor(currentGestationalAgeDays / 7);
  const currentGestationalAgeRemainderDays = currentGestationalAgeDays % 7;
  const daysUntilDue = differenceInDays(edd, today);
  const trimester = calculateTrimester(currentGestationalAgeDays);
  const progressPercentage = Math.min(
    100,
    Math.max(0, (currentGestationalAgeDays / PREGNANCY_DURATION_DAYS) * 100),
  );
  return {
    edd,
    lmp,
    conception,
    currentGestationalAgeDays,
    currentGestationalAgeWeeks,
    currentGestationalAgeRemainderDays,
    daysUntilDue,
    trimester,
    progressPercentage,
  };
}

export function calculateByLMP(lmp: Date): PregnancyResults {
  return calculateCommonResults(lmp);
}

export function calculateByDueDate(dueDate: Date): PregnancyResults {
  const lmp = subDays(dueDate, PREGNANCY_DURATION_DAYS);
  return calculateCommonResults(lmp);
}

export function calculateByConceptionDate(conception: Date): PregnancyResults {
  const lmp = subDays(conception, 14);
  return calculateCommonResults(lmp);
}

export function calculateByUltrasound(
  usDate: Date,
  weeks: number,
  days: number,
): PregnancyResults {
  const gaAtUltrasoundDays = weeks * 7 + days;
  const lmp = subDays(usDate, gaAtUltrasoundDays);
  return calculateCommonResults(lmp);
}

export function formatGestationalAge(weeks: number, days: number): string {
  return `${weeks}w ${days}d`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getMilestones(results: PregnancyResults) {
  return {
    endFirstTrimester: addDays(results.lmp, 14 * 7 - 1),
    endSecondTrimester: addDays(results.lmp, 28 * 7 - 1),
    due: results.edd,
  };
}
