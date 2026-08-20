import type { QueryClient } from "@tanstack/react-query";
import { clearJournalCache } from "@/lib/journal";
import { clearHospitalBagCache } from "@/lib/hospital-bag";
import { clearBirthPlanCache } from "@/lib/birth-plan";
import { clearVisitQuestionsCache } from "@/lib/visit-questions";
import { clearFhrCache } from "@/lib/fetal-heart-rate";
import { clearScribeNoteCache } from "@/lib/scribe-note";
import { clearBfCheckinCache } from "@/lib/breastfeeding";
import { clearPpdCache } from "@/lib/postpartum-depression";
import { clearLocationModeUserData } from "@/lib/location-mode";
import { cancelAllAppointmentReminders } from "@/lib/appointment-reminders";
import { cancelAllMilestoneNotifications } from "@/lib/milestone-notifications";
import { clearAllCustomReminders } from "@/lib/custom-reminders";
import { invalidateWatchQueueSession } from "@/lib/sync-queue";
import WatchConnectivity from "@/modules/WatchConnectivity";

/**
 * Removes data that belongs to a no-longer-valid device session. All cleanup
 * operations are best-effort so one unavailable native capability cannot leave
 * another user's data behind.
 */
export function clearSignedOutUserData(
  queryClient: QueryClient,
  outgoingUserId: string | null,
): void {
  // Cancel in-flight queries first so they cannot repopulate the cache after
  // clear() if a response arrives between the two operations.
  queryClient.cancelQueries().catch(() => {});
  queryClient.clear();
  clearJournalCache().catch(() => {});
  clearHospitalBagCache().catch(() => {});
  clearBirthPlanCache().catch(() => {});
  clearVisitQuestionsCache().catch(() => {});
  clearFhrCache().catch(() => {});
  clearScribeNoteCache().catch(() => {});
  clearBfCheckinCache().catch(() => {});
  clearPpdCache().catch(() => {});
  clearLocationModeUserData().catch(() => {});
  cancelAllAppointmentReminders().catch(() => {});
  cancelAllMilestoneNotifications().catch(() => {});
  clearAllCustomReminders().catch(() => {});
  WatchConnectivity.signOut().catch(() => {});
  if (outgoingUserId) {
    invalidateWatchQueueSession(outgoingUserId).catch(() => {});
  }
}
