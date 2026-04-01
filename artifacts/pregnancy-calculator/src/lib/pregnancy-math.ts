import { differenceInDays, addDays, subDays, startOfDay, format } from "date-fns";

export interface PregnancyResults {
  edd: Date; // Estimated Due Date
  lmp: Date; // Last Menstrual Period
  conception: Date; // Estimated Conception
  currentGestationalAgeDays: number;
  currentGestationalAgeWeeks: number;
  currentGestationalAgeRemainderDays: number;
  daysUntilDue: number;
  trimester: 1 | 2 | 3;
  progressPercentage: number;
}

export const PREGNANCY_DURATION_DAYS = 280; // 40 weeks from LMP

function calculateTrimester(gaDays: number): 1 | 2 | 3 {
  if (gaDays < 14 * 7) return 1; // < 14 weeks
  if (gaDays < 28 * 7) return 2; // < 28 weeks
  return 3; // >= 28 weeks
}

function calculateCommonResults(lmpDate: Date): PregnancyResults {
  const today = startOfDay(new Date());
  const lmp = startOfDay(lmpDate);
  
  const edd = addDays(lmp, PREGNANCY_DURATION_DAYS);
  const conception = addDays(lmp, 14); // typically 2 weeks after LMP
  
  const currentGestationalAgeDays = Math.max(0, differenceInDays(today, lmp));
  const currentGestationalAgeWeeks = Math.floor(currentGestationalAgeDays / 7);
  const currentGestationalAgeRemainderDays = currentGestationalAgeDays % 7;
  
  const daysUntilDue = differenceInDays(edd, today);
  const trimester = calculateTrimester(currentGestationalAgeDays);
  
  const progressPercentage = Math.min(100, Math.max(0, (currentGestationalAgeDays / PREGNANCY_DURATION_DAYS) * 100));

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

export function calculateByDueDate(dueDateStr: string): PregnancyResults | null {
  if (!dueDateStr) return null;
  const edd = startOfDay(new Date(dueDateStr));
  if (isNaN(edd.getTime())) return null;
  
  const lmp = subDays(edd, PREGNANCY_DURATION_DAYS);
  return calculateCommonResults(lmp);
}

export function calculateByConceptionDate(conceptionDateStr: string): PregnancyResults | null {
  if (!conceptionDateStr) return null;
  const conception = startOfDay(new Date(conceptionDateStr));
  if (isNaN(conception.getTime())) return null;
  
  // LMP is 14 days before conception
  const lmp = subDays(conception, 14);
  return calculateCommonResults(lmp);
}

export function calculateByUltrasound(ultrasoundDateStr: string, weeks: number, days: number): PregnancyResults | null {
  if (!ultrasoundDateStr || isNaN(weeks) || isNaN(days)) return null;
  const usDate = startOfDay(new Date(ultrasoundDateStr));
  if (isNaN(usDate.getTime())) return null;
  
  const gaAtUltrasoundDays = (weeks * 7) + days;
  const lmp = subDays(usDate, gaAtUltrasoundDays);
  return calculateCommonResults(lmp);
}

export function formatGestationalAge(weeks: number, days: number): string {
  return `${weeks} week${weeks !== 1 ? 's' : ''} and ${days} day${days !== 1 ? 's' : ''}`;
}

export function getMilestones(results: PregnancyResults) {
  return {
    endFirstTrimester: addDays(results.lmp, 14 * 7 - 1),
    endSecondTrimester: addDays(results.lmp, 28 * 7 - 1),
    due: results.edd
  };
}
