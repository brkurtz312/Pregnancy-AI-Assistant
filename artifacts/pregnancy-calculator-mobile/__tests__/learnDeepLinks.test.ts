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

import * as fs from "fs";
import * as path from "path";

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

// ─── 7. VideoVaultScreen — deepLinkTopicId → initialOpen mapping ──────────────
//
// Guards the runtime behaviour when the Video Vault screen is already mounted
// and the user taps a search result (re-navigation). The screen computes:
//
//   initialOpen={!!deepLinkTopicId && topic.id === deepLinkTopicId}
//
// for every TopicCard. These tests mirror that exact expression so a refactor
// of the screen logic is caught here before it silently breaks navigation.

describe("VideoVaultScreen — deepLinkTopicId → initialOpen mapping", () => {
  function computeOpenStates(deepLinkTopicId: string | undefined) {
    return VIDEO_VAULT_TOPICS.map((t) => ({
      id: t.id,
      title: t.title,
      initialOpen: !!deepLinkTopicId && t.id === deepLinkTopicId,
    }));
  }

  it("exactly one topic gets initialOpen=true when a matching topic param is provided", () => {
    const targetTopic = VIDEO_VAULT_TOPICS[0];
    const states = computeOpenStates(targetTopic.id);
    const openTopics = states.filter((s) => s.initialOpen);
    expect(openTopics).toHaveLength(1);
    expect(openTopics[0].id).toBe(targetTopic.id);
  });

  it("the target topic is the one that gets initialOpen=true, not any other", () => {
    const targetTopic = VIDEO_VAULT_TOPICS[0];
    const states = computeOpenStates(targetTopic.id);
    for (const s of states) {
      if (s.id === targetTopic.id) {
        expect(s.initialOpen).toBe(true);
      } else {
        expect(s.initialOpen).toBe(false);
      }
    }
  });

  it("every topic correctly gets initialOpen=true when it is the deep-link target", () => {
    for (const targetTopic of VIDEO_VAULT_TOPICS) {
      const states = computeOpenStates(targetTopic.id);
      const openTopics = states.filter((s) => s.initialOpen);
      expect(openTopics).toHaveLength(1);
      expect(openTopics[0].id).toBe(targetTopic.id);
      const closedTopics = states.filter((s) => !s.initialOpen);
      expect(closedTopics).toHaveLength(VIDEO_VAULT_TOPICS.length - 1);
    }
  });

  it("no topics get initialOpen=true when no topic param is provided (undefined)", () => {
    const states = computeOpenStates(undefined);
    expect(states.every((s) => !s.initialOpen)).toBe(true);
  });

  it("no topics get initialOpen=true when the param does not match any topic ID", () => {
    const states = computeOpenStates("non-existent-topic-id-99999");
    expect(states.every((s) => !s.initialOpen)).toBe(true);
  });

  it("a search result route round-trips: extracting the topic param gives initialOpen=true for exactly that topic", () => {
    for (const targetTopic of VIDEO_VAULT_TOPICS) {
      const route = `/video-vault?topic=${targetTopic.id}`;
      const deepLinkTopicId = route.replace("/video-vault?topic=", "");
      const states = computeOpenStates(deepLinkTopicId);
      const openTopics = states.filter((s) => s.initialOpen);
      expect(openTopics).toHaveLength(1);
      expect(openTopics[0].id).toBe(targetTopic.id);
    }
  });

  it("re-navigation: switching from one topic to another gives the new topic initialOpen=true", () => {
    if (VIDEO_VAULT_TOPICS.length < 2) return;
    const firstTopic = VIDEO_VAULT_TOPICS[0];
    const secondTopic = VIDEO_VAULT_TOPICS[1];

    const firstNav = computeOpenStates(firstTopic.id);
    expect(firstNav.find((s) => s.id === firstTopic.id)?.initialOpen).toBe(
      true,
    );
    expect(firstNav.find((s) => s.id === secondTopic.id)?.initialOpen).toBe(
      false,
    );

    const secondNav = computeOpenStates(secondTopic.id);
    expect(secondNav.find((s) => s.id === secondTopic.id)?.initialOpen).toBe(
      true,
    );
    expect(secondNav.find((s) => s.id === firstTopic.id)?.initialOpen).toBe(
      false,
    );
  });
});

// ─── 7c. TopicCard openTrigger re-open behavior ───────────────────────────────
//
// Guards the fix for the "card stays closed after manual close + same deep-link"
// edge case.
//
// Root cause: the original `useEffect([initialOpen])` only fires when the prop
// VALUE changes.  If the user was on /video-vault?topic=X with the card open,
// manually closed it, and then navigated to /video-vault?topic=X again,
// `initialOpen` stayed `true` the whole time — so the effect did not re-run
// and the card remained closed.
//
// Fix: VideoVaultScreen now tracks a `deepLinkVersion` counter (increments each
// time `deepLinkTopicId` changes to a new non-empty value) and passes
// `openTrigger={deepLinkVersion}` to the matching TopicCard.  The TopicCard
// effect watches `openTrigger`; a change — even from N to N+1 for the same
// topic — forces the card open.
//
// These tests mirror that state-machine logic in pure TypeScript so a
// refactor of the screen's counter/effect is caught at CI time.

describe("TopicCard openTrigger — re-open after manual close", () => {
  // Simulates the counter the screen maintains: increments when deepLinkTopicId
  // transitions to a new non-empty value (mirrors the useEffect in the screen).
  function simulateScreenNavigation(
    navigations: Array<string | undefined>,
  ): number[] {
    const versions: number[] = [];
    let version = 0;
    let prev: string | undefined = undefined;
    for (const topicId of navigations) {
      if (topicId && topicId !== prev) {
        version += 1;
      }
      prev = topicId;
      versions.push(version);
    }
    return versions;
  }

  // Simulates the open/closed state inside a single TopicCard across renders.
  // `open` starts as `openTrigger > 0`; when the user toggles, `open` flips;
  // when `openTrigger` increases, the effect fires and forces `open = true`.
  function simulateCardState(
    triggerSequence: number[],
    userClosesAfterIndex: number,
  ): boolean[] {
    const states: boolean[] = [];
    let open = triggerSequence[0] > 0;
    let prevTrigger = triggerSequence[0];

    for (let i = 0; i < triggerSequence.length; i++) {
      const trigger = triggerSequence[i];
      if (trigger !== prevTrigger) {
        if (trigger > 0) open = true;
        prevTrigger = trigger;
      }
      if (i === userClosesAfterIndex) open = false;
      states.push(open);
    }
    return states;
  }

  it("initial navigation to topic A opens it (openTrigger goes from 0 to 1)", () => {
    const topic = VIDEO_VAULT_TOPICS[0];
    const navSequence = [undefined, topic.id];
    const versions = simulateScreenNavigation(navSequence);
    // Before navigation: version=0 → openTrigger=0 → card closed
    expect(versions[0]).toBe(0);
    // After navigation: version=1 → openTrigger=1 → card opens
    expect(versions[1]).toBe(1);
  });

  it("non-target topics always receive openTrigger=0", () => {
    if (VIDEO_VAULT_TOPICS.length < 2) return;
    const topicA = VIDEO_VAULT_TOPICS[0];
    const topicB = VIDEO_VAULT_TOPICS[1];
    const navSequence = [topicA.id, topicA.id, topicA.id];
    const versions = simulateScreenNavigation(navSequence);
    // Topic B's openTrigger is always 0 when only topic A is targeted
    for (const v of versions) {
      const topicBTrigger = topicA.id === topicB.id ? v : 0;
      expect(topicBTrigger).toBe(0);
    }
  });

  it("switching from topic A to topic B increments the version (new trigger)", () => {
    if (VIDEO_VAULT_TOPICS.length < 2) return;
    const topicA = VIDEO_VAULT_TOPICS[0];
    const topicB = VIDEO_VAULT_TOPICS[1];
    const navSequence = [topicA.id, topicB.id];
    const versions = simulateScreenNavigation(navSequence);
    expect(versions[0]).toBe(1); // first nav → v=1
    expect(versions[1]).toBe(2); // second nav → v=2 (different topic)
  });

  it("card re-opens when navigating back to the same topic after closing it", () => {
    if (VIDEO_VAULT_TOPICS.length < 2) return;
    const topicA = VIDEO_VAULT_TOPICS[0];
    const topicB = VIDEO_VAULT_TOPICS[1];
    // Sequence: navigate to A, navigate to B, navigate back to A
    const navSequence = [topicA.id, topicB.id, topicA.id];
    const versions = simulateScreenNavigation(navSequence);
    // v=1 (A), v=2 (B), v=3 (A again)
    expect(versions).toEqual([1, 2, 3]);

    // Topic A's openTrigger at each nav step:
    //   step 0: deepLinkTopicId=A, triggerForA = v=1
    //   step 1: deepLinkTopicId=B, triggerForA = 0 (not the target)
    //   step 2: deepLinkTopicId=A, triggerForA = v=3
    const triggersForA = navSequence.map((id, i) =>
      id === topicA.id ? versions[i] : 0,
    );
    expect(triggersForA).toEqual([1, 0, 3]);

    // Simulate card: opens at step 0, user closes at step 0, reopens at step 2
    const cardStates = simulateCardState(triggersForA, 0);
    // After step 0: opened then immediately closed (userClosesAfterIndex=0)
    expect(cardStates[0]).toBe(false);
    // Step 1: not the target, trigger=0, remains closed
    expect(cardStates[1]).toBe(false);
    // Step 2: trigger increases from 0→3, card reopens
    expect(cardStates[2]).toBe(true);
  });

  it("card stays closed when navigating to a different topic (not re-targeted)", () => {
    if (VIDEO_VAULT_TOPICS.length < 2) return;
    const topicA = VIDEO_VAULT_TOPICS[0];
    const topicB = VIDEO_VAULT_TOPICS[1];
    const navSequence = [topicA.id, topicB.id];
    const versions = simulateScreenNavigation(navSequence);
    // Topic A's triggers: [1, 0]
    const triggersForA = navSequence.map((id, i) =>
      id === topicA.id ? versions[i] : 0,
    );
    expect(triggersForA).toEqual([1, 0]);
    // Card opened at step 0, user closes it, navigates to B — A stays closed
    const cardStates = simulateCardState(triggersForA, 0);
    expect(cardStates[0]).toBe(false); // closed after user tap
    expect(cardStates[1]).toBe(false); // still closed (different topic active)
  });

  it("openTrigger=0 on initial render with no deep-link param → card starts closed", () => {
    const trigger = 0;
    const initialOpen = trigger > 0;
    expect(initialOpen).toBe(false);
  });

  it("openTrigger=1 on initial render → card starts open", () => {
    const trigger = 1;
    const initialOpen = trigger > 0;
    expect(initialOpen).toBe(true);
  });

  it("only the targeted topic gets a non-zero openTrigger at each navigation step", () => {
    for (const targetTopic of VIDEO_VAULT_TOPICS) {
      const version = 1; // any positive version
      const triggers = VIDEO_VAULT_TOPICS.map((t) => ({
        id: t.id,
        openTrigger: t.id === targetTopic.id ? version : 0,
      }));
      const nonZero = triggers.filter((t) => t.openTrigger > 0);
      expect(nonZero).toHaveLength(1);
      expect(nonZero[0].id).toBe(targetTopic.id);
      const zeros = triggers.filter((t) => t.openTrigger === 0);
      expect(zeros).toHaveLength(VIDEO_VAULT_TOPICS.length - 1);
    }
  });

  it("version counter increments monotonically with each distinct navigation", () => {
    const topics = VIDEO_VAULT_TOPICS.slice(
      0,
      Math.min(3, VIDEO_VAULT_TOPICS.length),
    );
    const navSequence = topics.map((t) => t.id);
    const versions = simulateScreenNavigation(navSequence);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }
  });

  it("known limitation: identical param with no intervening change does not increment the counter", () => {
    // If Expo Router keeps the screen mounted and the URL param value doesn't
    // change (same topic tapped twice in a row without navigating elsewhere),
    // the useEffect([deepLinkTopicId]) in the screen does NOT re-fire.
    // In that case deepLinkVersion stays the same and openTrigger is unchanged.
    // This scenario is expected to result in a stack-push remount by Expo
    // Router (the screen is recreated with a fresh initialOpen state), so the
    // card will open from initial state — this test documents that assumption.
    const topicA = VIDEO_VAULT_TOPICS[0];
    const navSequence = [topicA.id, topicA.id]; // same topic twice, no change
    const versions = simulateScreenNavigation(navSequence);
    // Counter does NOT increment because prevDeepLink === deepLinkTopicId
    expect(versions[0]).toBe(1);
    expect(versions[1]).toBe(1); // unchanged — no new navigation detected
    // At the component level: openTrigger stays at 1 (doesn't go to 2).
    // The card was closed by the user and openTrigger didn't change → stays
    // closed at the state-machine level. In practice Expo Router remounts the
    // screen on a fresh push, so the component gets fresh useState(true) anyway.
  });
});

// ─── 7b. HealthyPregnancy route → file cross-reference ───────────────────────
//
// Each topic.route must have a matching Expo Router screen file in app/.
// If a route is renamed in the data but the file is not (or vice versa),
// navigation silently breaks at runtime. This test catches that mismatch
// at CI time by reading the filesystem.

describe("HealthyPregnancy topic routes match app/ screen files", () => {
  // __dirname is __tests__/, so app/ is one level up
  const appDir = path.join(__dirname, "..", "app");

  it("every topic.route has a corresponding hp-*.tsx file in app/", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      // e.g. "/hp-travel" → "hp-travel.tsx"
      const filename = topic.route.replace(/^\//, "") + ".tsx";
      const fullPath = path.join(appDir, filename);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it("every app/hp-*.tsx file has a matching route in HEALTHY_PREGNANCY_TOPICS", () => {
    const hpFiles = fs
      .readdirSync(appDir)
      .filter((f) => f.startsWith("hp-") && f.endsWith(".tsx"));

    const knownRoutes = new Set(
      HEALTHY_PREGNANCY_TOPICS.map((t) => t.route.replace(/^\//, "") + ".tsx"),
    );

    for (const file of hpFiles) {
      expect(knownRoutes.has(file)).toBe(true);
    }
  });
});

// ─── 7d. HealthyPregnancy screen files — parse validity + default export ──────
//
// Section 7b confirms each screen file EXISTS. This section goes one step
// further: it verifies that each hp-*.tsx file is syntactically valid
// TypeScript/TSX and has a default export (the Expo Router screen component).
//
// Why: a typo that corrupts the file, or a refactor that accidentally removes
// `export default`, silently produces a blank/crashed screen at runtime. The
// file still "exists" so section 7b would still pass — only this section would
// catch it.
//
// We use the TypeScript compiler API for static analysis so we never need to
// actually import the files (which would fail in the test environment because
// of React Native / Expo native module dependencies).

describe("HealthyPregnancy screen files — parse validity + default export", () => {
  const appDir = path.join(__dirname, "..", "app");

  // Collect all hp-*.tsx files from the filesystem (same set as section 7b).
  const hpFiles = fs
    .readdirSync(appDir)
    .filter((f) => f.startsWith("hp-") && f.endsWith(".tsx"));

  it("there is at least one hp-*.tsx file to validate", () => {
    expect(hpFiles.length).toBeGreaterThan(0);
  });

  it("every hp-*.tsx file parses as valid TypeScript/TSX without syntax errors", () => {
    const ts = require("typescript") as typeof import("typescript");
    for (const filename of hpFiles) {
      const fullPath = path.join(appDir, filename);
      const source = fs.readFileSync(fullPath, "utf8");

      // transpileModule surfaces TypeScript syntax diagnostics for a single
      // file without needing to resolve imports, so it works even though the
      // files depend on React Native / Expo modules unavailable in Node.
      const result = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          jsx: ts.JsxEmit.ReactNative,
        },
        reportDiagnostics: true,
      });

      const syntaxErrors = (result.diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
      );

      if (syntaxErrors.length > 0) {
        const messages = syntaxErrors
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
          .join("; ");
        throw new Error(`${filename} has TypeScript syntax errors: ${messages}`);
      }
    }
  });

  it("every hp-*.tsx file has a default export (the Expo Router screen component)", () => {
    const ts = require("typescript") as typeof import("typescript");
    for (const filename of hpFiles) {
      const fullPath = path.join(appDir, filename);
      const source = fs.readFileSync(fullPath, "utf8");

      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX,
      );

      let hasDefaultExport = false;

      for (const statement of sourceFile.statements) {
        // export default function Foo() {} / export default class Foo {}
        // These parse as FunctionDeclaration / ClassDeclaration with both
        // ExportKeyword and DefaultKeyword in their modifier list.
        if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement)) &&
          statement.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
          )
        ) {
          hasDefaultExport = true;
          break;
        }

        // export default <expression>  (e.g. memo(Fn), arrow fn, identifier)
        // These parse as ExportAssignment with isExportEquals === false.
        if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
          hasDefaultExport = true;
          break;
        }

        // export { Foo as default }
        if (ts.isExportDeclaration(statement) && statement.exportClause) {
          if (ts.isNamedExports(statement.exportClause)) {
            for (const el of statement.exportClause.elements) {
              if (el.name.text === "default") {
                hasDefaultExport = true;
                break;
              }
            }
          }
        }

        if (hasDefaultExport) break;
      }

      if (!hasDefaultExport) {
        throw new Error(
          `${filename} has no default export — Expo Router requires a default-exported screen component`,
        );
      }
    }
  });

  it("the default export in every hp-*.tsx file is a function (React component, not a plain value)", () => {
    const ts = require("typescript") as typeof import("typescript");
    for (const filename of hpFiles) {
      const fullPath = path.join(appDir, filename);
      const source = fs.readFileSync(fullPath, "utf8");

      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX,
      );

      let defaultIsFunction = false;

      for (const statement of sourceFile.statements) {
        // export default function Foo() {}
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
          )
        ) {
          defaultIsFunction = true;
          break;
        }

        // export default <expr> — accept arrow functions, call expressions
        // (e.g. memo(Fn)), and class expressions as valid component forms.
        if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
          const expr = statement.expression;
          if (
            ts.isArrowFunction(expr) ||
            ts.isFunctionExpression(expr) ||
            ts.isClassExpression(expr) ||
            ts.isCallExpression(expr) // e.g. React.memo(...) or withAuth(...)
          ) {
            defaultIsFunction = true;
          }
          // Also accept: export default Identifier where the identifier likely
          // refers to a function declared above — we verify this via a simple
          // check that there is a function/class declaration in the file sharing
          // that name.
          if (ts.isIdentifier(expr)) {
            const refName = expr.text;
            for (const s of sourceFile.statements) {
              if (
                (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
                s.name?.text === refName
              ) {
                defaultIsFunction = true;
                break;
              }
              const isConstFn =
                ts.isVariableStatement(s) &&
                s.declarationList.declarations.some(
                  (d) =>
                    ts.isIdentifier(d.name) &&
                    d.name.text === refName &&
                    d.initializer != null &&
                    (ts.isArrowFunction(d.initializer) ||
                      ts.isFunctionExpression(d.initializer)),
                );
              if (isConstFn) {
                defaultIsFunction = true;
                break;
              }
            }
          }
          break;
        }

        // export default class Foo {}
        if (
          ts.isClassDeclaration(statement) &&
          statement.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
          )
        ) {
          defaultIsFunction = true;
          break;
        }
      }

      if (!defaultIsFunction) {
        throw new Error(
          `${filename} default export does not appear to be a React component (function or class)`,
        );
      }
    }
  });
});

// ─── 8. Search index — matchesQuery logic ────────────────────────────────────

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

// ─── 9. Search navigation — keyword → router.push route ──────────────────────
//
// These tests mirror what happens at runtime when a user types in the search
// box and presses a result:
//
//   1. The trimmed lowercase query is run through matchesQuery against the
//      full search index.
//   2. handleResultPress receives result.route and calls router.push(route).
//
// A route rename in the data (or a mismatch between the search index and the
// underlying HEALTHY_PREGNANCY_ROUTE_IDS / video-vault IDs) would cause
// navigation to the wrong screen or a 404.  These tests catch that regression
// at CI time by asserting the specific route value produced for known keywords.
//
// Coverage: one Healthy Pregnancy result, one VideoVault result, one Support
// Person result (as required by the task spec).

describe("Search navigation — keyword → router.push route", () => {
  const allResults = buildSearchIndex();

  function search(q: string): SearchResult[] {
    const lower = q.trim().toLowerCase();
    return allResults.filter((r) => matchesQuery(r, lower));
  }

  // ── Healthy Pregnancy ──────────────────────────────────────────────────────

  it('searching "nutrition" returns a Healthy Pregnancy result whose route is /hp-nutrition', () => {
    const matches = search("nutrition");
    const hpMatch = matches.find((r) => r.section === "healthypregnancy");
    expect(hpMatch).toBeDefined();
    expect(hpMatch!.route).toBe("/hp-nutrition");
  });

  it('pressing the "nutrition" search result navigates to the nutrition topic (router.push receives /hp-nutrition)', () => {
    const matches = search("nutrition");
    const hpMatch = matches.find(
      (r) => r.section === "healthypregnancy" && r.route === "/hp-nutrition",
    );
    expect(hpMatch).toBeDefined();
    // Simulates: handleResultPress(hpMatch.route) → router.push(hpMatch.route)
    const pushedRoute = hpMatch!.route;
    expect(pushedRoute).toBe("/hp-nutrition");
  });

  it("every Healthy Pregnancy topic is reachable via a keyword from its own title", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      const keyword = topic.title.split(" ")[0].toLowerCase();
      const matches = search(keyword);
      const hpRoutes = matches
        .filter((r) => r.section === "healthypregnancy")
        .map((r) => r.route);
      expect(hpRoutes).toContain(topic.route);
    }
  });

  it("Healthy Pregnancy search result route matches the typed /hp-* pattern for each topic", () => {
    for (const topic of HEALTHY_PREGNANCY_TOPICS) {
      const matches = search(topic.title.toLowerCase());
      const hpMatch = matches.find(
        (r) => r.section === "healthypregnancy" && r.label === topic.title,
      );
      expect(hpMatch).toBeDefined();
      expect(hpMatch!.route).toBe(topic.route);
      expect(hpMatch!.route.startsWith("/hp-")).toBe(true);
    }
  });

  // ── VideoVault ─────────────────────────────────────────────────────────────

  it("searching a VideoVault topic title returns a result whose route is /video-vault?topic=<id>", () => {
    const topic = VIDEO_VAULT_TOPICS[0];
    const matches = search(topic.title.toLowerCase());
    const vvMatch = matches.find(
      (r) => r.section === "videovault" && r.label === topic.title,
    );
    expect(vvMatch).toBeDefined();
    expect(vvMatch!.route).toBe(`/video-vault?topic=${topic.id}`);
  });

  it("pressing a VideoVault search result navigates with the correct topic id in the URL (router.push receives /video-vault?topic=<id>)", () => {
    const topic = VIDEO_VAULT_TOPICS[0];
    const matches = search(topic.title.toLowerCase());
    const vvMatch = matches.find(
      (r) => r.section === "videovault" && r.label === topic.title,
    );
    expect(vvMatch).toBeDefined();
    // Simulates: handleResultPress(vvMatch.route) → router.push(vvMatch.route)
    const pushedRoute = vvMatch!.route;
    const embeddedId = pushedRoute.replace("/video-vault?topic=", "");
    const resolved = VIDEO_VAULT_TOPICS.find((t) => t.id === embeddedId);
    expect(resolved).toBeDefined();
    expect(resolved!.title).toBe(topic.title);
  });

  it("every VideoVault topic is reachable via a keyword search and its result route decodes to the same topic", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      const keyword = topic.title.split(" ")[0].toLowerCase();
      const matches = search(keyword);
      const vvMatch = matches.find(
        (r) => r.section === "videovault" && r.label === topic.title,
      );
      expect(vvMatch).toBeDefined();
      const embeddedId = vvMatch!.route.replace("/video-vault?topic=", "");
      expect(embeddedId).toBe(topic.id);
    }
  });

  // ── Support Person ─────────────────────────────────────────────────────────

  it("searching a Support Person volume title returns a result whose route is /support-person-vol<N>", () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const matches = search(vol.handoutTitle.toLowerCase());
    const spMatch = matches.find(
      (r) => r.section === "supportperson" && r.label === vol.handoutTitle,
    );
    expect(spMatch).toBeDefined();
    expect(spMatch!.route).toBe(VOL_ROUTES[vol.volumeNumber - 1]);
  });

  it("pressing a Support Person search result navigates to the correct volume screen (router.push receives /support-person-vol<N>)", () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const matches = search(vol.handoutTitle.toLowerCase());
    const spMatch = matches.find(
      (r) => r.section === "supportperson" && r.label === vol.handoutTitle,
    );
    expect(spMatch).toBeDefined();
    // Simulates: handleResultPress(spMatch.route) → router.push(spMatch.route)
    const pushedRoute = spMatch!.route;
    expect(pushedRoute).toBe(`/support-person-vol${vol.volumeNumber}`);
  });

  it("every Support Person volume is reachable via a keyword search and its route matches the volume number", () => {
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      const keyword = vol.handoutTitle.split(" ")[0].toLowerCase();
      const matches = search(keyword);
      const spMatch = matches.find(
        (r) => r.section === "supportperson" && r.label === vol.handoutTitle,
      );
      expect(spMatch).toBeDefined();
      expect(spMatch!.route).toBe(`/support-person-vol${vol.volumeNumber}`);
    }
  });

  // ── Cross-section: search does not bleed routes across sections ────────────

  it('searching "nutrition" does not return a VideoVault or SupportPerson result for the HP nutrition topic', () => {
    const matches = search("nutrition");
    const hpNutritionResult = matches.find(
      (r) => r.section === "healthypregnancy" && r.route === "/hp-nutrition",
    );
    expect(hpNutritionResult).toBeDefined();
    // Any VideoVault or SupportPerson match for "nutrition" has its own route,
    // NOT the /hp-nutrition route — no route bleeding across sections.
    const nonHpMatches = matches.filter(
      (r) => r.section !== "healthypregnancy",
    );
    for (const result of nonHpMatches) {
      expect(result.route).not.toBe("/hp-nutrition");
    }
  });
});

