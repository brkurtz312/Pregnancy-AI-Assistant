/**
 * contractionHistoryQueryKey.test.ts
 *
 * Confirms that the React Query cache key for `useListContractions` encodes the
 * `sessionDate` parameter (or its absence) so that the single-date view used by
 * the Contraction Timer and the all-dates view used by the Session History screen
 * never share a cached result.
 *
 * Background
 * ----------
 * tools.tsx (ContractionTimerSection) fetches today's contractions with:
 *   useListContractions({ sessionDate: today, limit: 50 })
 *
 * session-history.tsx (ContractionHistoryTab) fetches all-dates contractions with:
 *   useListContractions({ limit: 200 })   // no sessionDate
 *
 * If both calls resolved to the same query key the history screen could serve
 * yesterday's single-date cache entry instead of a fresh all-dates response.
 */

import { getListContractionsQueryKey } from "@workspace/api-client-react";

describe("getListContractionsQueryKey — cache isolation between single-date and all-dates calls", () => {
  const TODAY = "2026-08-14";

  // ── Key shapes used in production code ──────────────────────────────────────

  /** Key used by ContractionTimerSection in tools.tsx */
  const singleDateKey = getListContractionsQueryKey({
    sessionDate: TODAY,
    limit: 50,
  });

  /** Key used by ContractionHistoryTab in session-history.tsx */
  const allDatesKey = getListContractionsQueryKey({ limit: 200 });

  /** Variant: all-dates with no params at all (visit-summary.tsx) */
  const emptyParamsKey = getListContractionsQueryKey({});

  // ── Tests ────────────────────────────────────────────────────────────────────

  it("single-date key contains the sessionDate value", () => {
    // The params object must appear in the key so React Query can discriminate it
    const serialised = JSON.stringify(singleDateKey);
    expect(serialised).toContain(TODAY);
    expect(serialised).toContain("sessionDate");
  });

  it("all-dates key does NOT contain a sessionDate field", () => {
    const serialised = JSON.stringify(allDatesKey);
    expect(serialised).not.toContain("sessionDate");
  });

  it("single-date key and all-dates key are not equal", () => {
    // Different serialisations → different React Query cache buckets
    expect(JSON.stringify(singleDateKey)).not.toEqual(
      JSON.stringify(allDatesKey),
    );
  });

  it("single-date key and empty-params key are not equal", () => {
    expect(JSON.stringify(singleDateKey)).not.toEqual(
      JSON.stringify(emptyParamsKey),
    );
  });

  it("all-dates key (limit:200) and empty-params key ({}) are not equal", () => {
    // They are different call sites with different intents; ensure no accidental merge
    expect(JSON.stringify(allDatesKey)).not.toEqual(
      JSON.stringify(emptyParamsKey),
    );
  });

  it("two single-date keys for different dates are not equal", () => {
    const yesterday = "2026-08-13";
    const yesterdayKey = getListContractionsQueryKey({
      sessionDate: yesterday,
      limit: 50,
    });
    expect(JSON.stringify(singleDateKey)).not.toEqual(
      JSON.stringify(yesterdayKey),
    );
  });

  it("the base path segment is shared across all key shapes (same endpoint)", () => {
    // All keys must share the same URL prefix so invalidateQueries({ queryKey:
    // ['/api/tools/contractions'] }) can broadcast a refresh to every variant.
    const basePath = "/api/tools/contractions";
    expect(singleDateKey[0]).toBe(basePath);
    expect(allDatesKey[0]).toBe(basePath);
    expect(emptyParamsKey[0]).toBe(basePath);
  });
});
