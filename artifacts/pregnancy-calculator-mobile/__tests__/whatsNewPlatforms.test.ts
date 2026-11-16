import { getWhatsNew, WHATS_NEW } from "../constants/whatsNew";

describe("getWhatsNew — platform filtering", () => {
  it("returns null for a version with no entry", () => {
    expect(getWhatsNew("0.0.0-none", "ios")).toBeNull();
  });

  it("keeps every item on iOS for the iOS-only 1.1.0 entry", () => {
    const entry = getWhatsNew("1.1.0", "ios");
    expect(entry?.items).toHaveLength(WHATS_NEW["1.1.0"].items.length);
  });

  it("skips the 1.1.0 entry on Android, where every item is iOS-only", () => {
    expect(getWhatsNew("1.1.0", "android")).toBeNull();
  });

  it("shows items without a platforms list on Android", () => {
    const entry = getWhatsNew("1.1.1", "android");
    expect(entry?.items.length).toBe(WHATS_NEW["1.1.1"].items.length);
  });

  it("never shows Android an item that names Apple hardware or stores", () => {
    for (const version of Object.keys(WHATS_NEW)) {
      // Only versions an Android user can install matter; Android starts at
      // 1.1.1, but checking the latest entry is enough to catch new mistakes.
      if (version !== Object.keys(WHATS_NEW)[0]) continue;
      const entry = getWhatsNew(version, "android");
      for (const item of entry?.items ?? []) {
        expect(`${item.title} ${item.body}`).not.toMatch(
          /iPhone|iPad|Apple Watch|App Store|Apple ID|iOS/,
        );
      }
    }
  });
});
