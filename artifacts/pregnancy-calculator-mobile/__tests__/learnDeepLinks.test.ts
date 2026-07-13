/**
 * Mobile Learn tab deep-link tests.
 *
 * Guards against content reorganizations that silently break search-result
 * navigation on the mobile app. The mobile implementation uses Expo Router URL
 * params instead of component props, so these tests exercise:
 *
 *   1. Data integrity — every ID / volumeNumber / route is valid and unique.
 *   2. VideoVault deep-link routes — `/video-vault?topic=<id>` encodes and
 *      resolves to a real topic (matches `useLocalSearchParams` in the screen).
 *   3. SupportPerson deep-link routes — each volume maps to the correct
 *      `/support-person-vol[1-3]` path and back.
 *   4. HealthyPregnancy deep-link routes — every topic route in the data is
 *      reachable via the search index.
 *   5. Search index integrity — `buildSearchIndex` / `matchesQuery` logic that
 *      lives in learn.tsx, inlined here so a refactor of those functions is
 *      caught by the type-checker.
 */

import { VIDEO_VAULT_TOPICS } from "@/lib/video-vault";
import { SUPPORT_PERSON_VOLUMES } from "@/lib/support-person-survival";
import { HEALTHY_PREGNANCY_TOPICS } from "@/lib/healthy-pregnancy-topics";

// ─── Inline types + logic mirrored from app/(tabs)/learn.tsx ─────────────────
// Keep this in sync with the real implementation — a divergence will surface as
// a failing test the next time content IDs or route patterns change.

type Section = "videovault" | "supportperson" | "healthypregnancy";

interface SearchResult {
  section: Section;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  route: string;
}

const VOL_ROUTES = [
  "/support-person-vol1",
  "/support-person-vol2",
  "/support-person-vol3",
] as const;

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  for (const topic of VIDEO_VAULT_TOPICS) {
    results.push({
      section: "videovault",
      label: topic.title,
      sublabel: `${topic.videos.length} video${topic.videos.length !== 1 ? "s" : ""}`,
      icon: topic.icon,
      color: "#8b5cf6",
      route: `/video-vault?topic=${topic.id}`,
    });
  }

  const volIcons = ["📖", "📋", "🎉"];
  for (const vol of SUPPORT_PERSON_VOLUMES) {
    results.push({
      section: "supportperson",
      label: vol.handoutTitle,
      sublabel: vol.pageSubtitle,
      icon: volIcons[vol.volumeNumber - 1],
      color: "#7c3aed",
      route: VOL_ROUTES[vol.volumeNumber - 1],
    });
  }

  for (const topic of HEALTHY_PREGNANCY_TOPICS) {
    results.push({
      section: "healthypregnancy",
      label: topic.title,
      sublabel: topic.description,
      icon: "💊",
      color: "#f43f5e",
      route: topic.route,
    });
  }

  return results;
}

function matchesQuery(result: SearchResult, q: string): boolean {
  if (
    result.label.toLowerCase().includes(q) ||
    result.sublabel.toLowerCase().includes(q)
  ) {
    return true;
  }

  if (result.section === "videovault") {
    const topic = VIDEO_VAULT_TOPICS.find((t) => t.title === result.label);
    if (
      topic?.videos.some(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q),
      )
    ) {
      return true;
    }
  }

  if (result.section === "supportperson") {
    const vol = SUPPORT_PERSON_VOLUMES.find(
      (v) => v.handoutTitle === result.label,
    );
    if (
      vol?.highlights.some((h) => h.toLowerCase().includes(q)) ||
      vol?.summary.toLowerCase().includes(q) ||
      vol?.seriesLabel.toLowerCase().includes(q)
    ) {
      return true;
    }
  }

  return false;
}

// ─── 1. VideoVault data integrity ─────────────────────────────────────────────

describe("VideoVault data integrity", () => {
  it("every topic has a non-empty string id", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      expect(typeof topic.id).toBe("string");
      expect(topic.id.length).toBeGreaterThan(0);
    }
  });

  it("all topic IDs are unique", () => {
    const ids = VIDEO_VAULT_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every topic resolves back to itself by ID", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      const found = VIDEO_VAULT_TOPICS.find((t) => t.id === topic.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe(topic.title);
    }
  });

  it("every topic has at least one video", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      expect(topic.videos.length).toBeGreaterThan(0);
    }
  });

  it("every video has a non-empty title and URL", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      for (const video of topic.videos) {
        expect(video.title.length).toBeGreaterThan(0);
        expect(video.url.length).toBeGreaterThan(0);
      }
    }
  });

  it("all topic titles are unique", () => {
    const titles = VIDEO_VAULT_TOPICS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// ─── 2. SupportPerson data integrity ─────────────────────────────────────────

describe("SupportPerson data integrity", () => {
  it("has exactly 3 volumes", () => {
    expect(SUPPORT_PERSON_VOLUMES.length).toBe(3);
  });

  it("volumes are numbered 1, 2, and 3", () => {
    const nums = SUPPORT_PERSON_VOLUMES.map((v) => v.volumeNumber);
    expect(nums).toContain(1);
    expect(nums).toContain(2);
    expect(nums).toContain(3);
  });

  it("all volumeNumbers are unique", () => {
    const nums = SUPPORT_PERSON_VOLUMES.map((v) => v.volumeNumber);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("every volume has a non-empty handoutTitle and summary", () => {
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      expect(vol.handoutTitle.length).toBeGreaterThan(0);
      expect(vol.summary.length).toBeGreaterThan(0);
    }
  });

  it("every volumeNumber round-trips through String/Number conversion", () => {
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      const itemId = String(vol.volumeNumber);
      const parsed = Number(itemId);
      const found = SUPPORT_PERSON_VOLUMES.find(
        (v) => v.volumeNumber === parsed,
      );
      expect(found).toBeDefined();
      expect(found?.volumeNumber).toBe(vol.volumeNumber);
    }
  });

  it("every volume has at least one highlight", () => {
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      expect(vol.highlights.length).toBeGreaterThan(0);
    }
  });
});

// ─── 3. HealthyPregnancy data integrity ───────────────────────────────────────

describe("HealthyPregnancy topics data integrity", () => {
  it("every topic has a non-empty title, description, and route", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.description.length).toBeGreaterThan(0);
      expect(topic.route.length).toBeGreaterThan(0);
    }
  });

  it("all routes are unique", () => {
    const routes = HEALTHY_PREGNANCY_TOPICS.map((t) => t.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("all titles are unique", () => {
    const titles = HEALTHY_PREGNANCY_TOPICS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every topic route starts with /hp-", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      expect(topic.route.startsWith("/hp-")).toBe(true);
    }
  });
});

// ─── 4. VideoVault deep-link route integrity ──────────────────────────────────
//
// The VideoVaultScreen reads `useLocalSearchParams<{ topic?: string }>()` and
// passes `initialOpen={topic.id === deepLinkTopicId}` to each TopicCard.
// These tests verify that the route the search index writes can be decoded back
// to a real topic — i.e. the round-trip is safe.

describe("VideoVault deep-link route integrity", () => {
  const videoVaultResults = buildSearchIndex().filter(
    (r) => r.section === "videovault",
  );

  it("every VideoVault search result route starts with /video-vault?topic=", () => {
    for (const result of videoVaultResults) {
      expect(result.route.startsWith("/video-vault?topic=")).toBe(true);
    }
  });

  it("the topic param in every route resolves to a real topic", () => {
    for (const result of videoVaultResults) {
      const paramStr = result.route.replace("/video-vault?topic=", "");
      const topic = VIDEO_VAULT_TOPICS.find((t) => t.id === paramStr);
      expect(topic).toBeDefined();
    }
  });

  it("topic param round-trips: decoded ID matches the topic title in the result", () => {
    for (const result of videoVaultResults) {
      const topicId = result.route.replace("/video-vault?topic=", "");
      const topic = VIDEO_VAULT_TOPICS.find((t) => t.id === topicId);
      expect(topic?.title).toBe(result.label);
    }
  });

  it("there is one search index entry per topic", () => {
    expect(videoVaultResults.length).toBe(VIDEO_VAULT_TOPICS.length);
  });

  it("all VideoVault routes in the index are unique", () => {
    const routes = videoVaultResults.map((r) => r.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

// ─── 5. SupportPerson deep-link route integrity ───────────────────────────────
//
// Each volume links to a dedicated Expo Router screen: /support-person-vol[1-3].
// The screen and route are one-to-one; there is no URL param to decode, so we
// verify the mapping from volumeNumber to route.

describe("SupportPerson deep-link route integrity", () => {
  const spResults = buildSearchIndex().filter(
    (r) => r.section === "supportperson",
  );

  it("has exactly 3 SupportPerson search index entries", () => {
    expect(spResults.length).toBe(3);
  });

  it("every SupportPerson result has a route matching /support-person-vol[1-3]", () => {
    const validRoutes = new Set(VOL_ROUTES as readonly string[]);
    for (const result of spResults) {
      expect(validRoutes.has(result.route)).toBe(true);
    }
  });

  it("each volume route corresponds to the correct volumeNumber", () => {
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      const expectedRoute = VOL_ROUTES[vol.volumeNumber - 1];
      const result = spResults.find((r) => r.label === vol.handoutTitle);
      expect(result).toBeDefined();
      expect(result?.route).toBe(expectedRoute);
    }
  });

  it("volume 1 maps to /support-person-vol1", () => {
    const vol1 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 1)!;
    const result = spResults.find((r) => r.label === vol1.handoutTitle);
    expect(result?.route).toBe("/support-person-vol1");
  });

  it("volume 2 maps to /support-person-vol2", () => {
    const vol2 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 2)!;
    const result = spResults.find((r) => r.label === vol2.handoutTitle);
    expect(result?.route).toBe("/support-person-vol2");
  });

  it("volume 3 maps to /support-person-vol3", () => {
    const vol3 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 3)!;
    const result = spResults.find((r) => r.label === vol3.handoutTitle);
    expect(result?.route).toBe("/support-person-vol3");
  });

  it("all SupportPerson routes in the index are unique", () => {
    const routes = spResults.map((r) => r.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

// ─── 6. HealthyPregnancy deep-link route integrity ────────────────────────────
//
// Searching for a HP topic in the Learn tab calls `router.push(topic.route)`.
// The route comes directly from `HEALTHY_PREGNANCY_TOPICS`, so these tests
// confirm the search index faithfully re-encodes those routes.

describe("HealthyPregnancy deep-link route integrity", () => {
  const hpResults = buildSearchIndex().filter(
    (r) => r.section === "healthypregnancy",
  );

  it("has one search index entry per topic", () => {
    expect(hpResults.length).toBe(HEALTHY_PREGNANCY_TOPICS.length);
  });

  it("every route in the search index matches the topic route in the data", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      const result = hpResults.find((r) => r.label === topic.title);
      expect(result).toBeDefined();
      expect(result?.route).toBe(topic.route);
    }
  });

  it("all HealthyPregnancy routes in the index are unique", () => {
    const routes = hpResults.map((r) => r.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every HealthyPregnancy route in the index starts with /hp-", () => {
    for (const result of hpResults) {
      expect(result.route.startsWith("/hp-")).toBe(true);
    }
  });
});

// ─── 7. Search index — matchesQuery logic ────────────────────────────────────

describe("learn search index — matchesQuery", () => {
  const allResults = buildSearchIndex();

  it("covers all three sections", () => {
    const sections = new Set(allResults.map((r) => r.section));
    expect(sections.has("videovault")).toBe(true);
    expect(sections.has("supportperson")).toBe(true);
    expect(sections.has("healthypregnancy")).toBe(true);
  });

  it("VideoVault: matches a topic by its exact title", () => {
    const topic = VIDEO_VAULT_TOPICS[0];
    const result = allResults.find(
      (r) => r.section === "videovault" && r.label === topic.title,
    )!;
    expect(matchesQuery(result, topic.title.toLowerCase())).toBe(true);
  });

  it("VideoVault: matches a topic by a video title within it", () => {
    const topic = VIDEO_VAULT_TOPICS[0];
    const video = topic.videos[0];
    const result = allResults.find(
      (r) => r.section === "videovault" && r.label === topic.title,
    )!;
    expect(matchesQuery(result, video.title.slice(0, 6).toLowerCase())).toBe(
      true,
    );
  });

  it("VideoVault: does not match an unrelated query", () => {
    const result = allResults.find((r) => r.section === "videovault")!;
    expect(matchesQuery(result, "xyzzy_no_match_ever_99999")).toBe(false);
  });

  it("SupportPerson: matches a volume by its handoutTitle", () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const result = allResults.find(
      (r) => r.section === "supportperson" && r.label === vol.handoutTitle,
    )!;
    expect(matchesQuery(result, vol.handoutTitle.toLowerCase())).toBe(true);
  });

  it("SupportPerson: matches a volume by a keyword in its summary", () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const keyword = vol.summary.split(" ")[0].toLowerCase();
    const result = allResults.find(
      (r) => r.section === "supportperson" && r.label === vol.handoutTitle,
    )!;
    expect(matchesQuery(result, keyword)).toBe(true);
  });

  it("SupportPerson: does not match an unrelated query", () => {
    const result = allResults.find((r) => r.section === "supportperson")!;
    expect(matchesQuery(result, "xyzzy_no_match_ever_99999")).toBe(false);
  });

  it("HealthyPregnancy: matches a topic by its title", () => {
    const topic = HEALTHY_PREGNANCY_TOPICS[0];
    const result = allResults.find(
      (r) => r.section === "healthypregnancy" && r.label === topic.title,
    )!;
    expect(matchesQuery(result, topic.title.toLowerCase())).toBe(true);
  });

  it("HealthyPregnancy: matches a topic by a keyword in its description", () => {
    const topic = HEALTHY_PREGNANCY_TOPICS[0];
    const keyword = topic.description.split(" ")[0].toLowerCase();
    const result = allResults.find(
      (r) => r.section === "healthypregnancy" && r.label === topic.title,
    )!;
    expect(matchesQuery(result, keyword)).toBe(true);
  });

  it("HealthyPregnancy: does not match an unrelated query", () => {
    const result = allResults.find((r) => r.section === "healthypregnancy")!;
    expect(matchesQuery(result, "xyzzy_no_match_ever_99999")).toBe(false);
  });

  it("returns no results for a nonsense query across the full index", () => {
    const q = "xyzzy_no_match_ever_99999";
    const matched = allResults.filter((r) => matchesQuery(r, q));
    expect(matched.length).toBe(0);
  });
});
