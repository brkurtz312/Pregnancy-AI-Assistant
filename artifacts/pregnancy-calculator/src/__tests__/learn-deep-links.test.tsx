/**
 * Learn tab deep-link tests.
 *
 * Guards against content reorganizations that silently break search-result
 * navigation. Tests cover:
 *   1. Search index integrity — every itemId resolves to a real content item.
 *   2. HealthyPregnancy accordion opens via initialArticleId.
 *   3. VideoVault topic is highlighted via initialTopicId.
 *   4. SupportPerson volume expands via initialVolumeNumber.
 *   5. End-to-end: type a search query, click the result, confirm the correct
 *      view is shown with the item already expanded / highlighted.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  VIDEO_VAULT_TOPICS,
  VIDEO_VAULT_TOPIC_IDS,
} from "@/lib/web-video-vault";
import { SUPPORT_PERSON_VOLUMES } from "@/lib/web-support-person";
import {
  HEALTHY_PREGNANCY_ARTICLES,
  HEALTHY_PREGNANCY_ARTICLE_IDS,
  type HealthyPregnancyArticleId,
} from "@/lib/web-healthy-pregnancy";
import { HealthyPregnancy } from "@/components/learn/HealthyPregnancy";
import { VideoVault } from "@/components/learn/VideoVault";
import { SupportPerson } from "@/components/learn/SupportPerson";
import { Learn } from "@/components/learn/Learn";

// ─── Global stubs ─────────────────────────────────────────────────────────────

// happy-dom does not implement scrollIntoView — stub it so deep-link
// useEffect hooks don't throw.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// SupportPerson calls printHtml when the "Print Handout" button is clicked;
// that path is not under test here so stub it out.
vi.mock("@/lib/print-html", () => ({
  printHtml: vi.fn(),
}));

afterEach(cleanup);

// ─── 1. Search index integrity ────────────────────────────────────────────────
//
// buildSearchIndex() is a module-level call in Learn.tsx, so we reconstruct
// the same mapping here using the exported data directly. If any ID is renamed
// or removed from the data the corresponding assertion will fail, alerting
// developers before a broken deep-link ships.

describe("search index integrity", () => {
  it("every VideoVault topic.id in the data is a non-empty string", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      expect(typeof topic.id).toBe("string");
      expect(topic.id.length).toBeGreaterThan(0);
    }
  });

  it("every VideoVault topic used as an itemId resolves back to the same topic", () => {
    for (const topic of VIDEO_VAULT_TOPICS) {
      const found = VIDEO_VAULT_TOPICS.find((t) => t.id === topic.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe(topic.title);
    }
  });

  it("every SupportPerson volumeNumber stringifies and round-trips back", () => {
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

  it("every HealthyPregnancy article.id resolves back to the same article", () => {
    for (const article of HEALTHY_PREGNANCY_ARTICLES) {
      expect(typeof article.id).toBe("string");
      expect(article.id.length).toBeGreaterThan(0);
      const found = HEALTHY_PREGNANCY_ARTICLES.find((a) => a.id === article.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe(article.title);
    }
  });

  it("all VideoVault itemIds are unique", () => {
    const ids = VIDEO_VAULT_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all HealthyPregnancy itemIds are unique", () => {
    const ids = HEALTHY_PREGNANCY_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all SupportPerson volumeNumbers are unique", () => {
    const nums = SUPPORT_PERSON_VOLUMES.map((v) => v.volumeNumber);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("every VIDEO_VAULT_TOPICS id appears in VIDEO_VAULT_TOPIC_IDS", () => {
    const idSet = new Set<string>(VIDEO_VAULT_TOPIC_IDS);
    for (const topic of VIDEO_VAULT_TOPICS) {
      expect(
        idSet.has(topic.id),
        `topic.id "${topic.id}" is missing from VIDEO_VAULT_TOPIC_IDS`,
      ).toBe(true);
    }
  });

  it("every VIDEO_VAULT_TOPIC_IDS entry matches a topic in VIDEO_VAULT_TOPICS", () => {
    const dataIds = new Set(VIDEO_VAULT_TOPICS.map((t) => t.id));
    for (const id of VIDEO_VAULT_TOPIC_IDS) {
      expect(
        dataIds.has(id),
        `VIDEO_VAULT_TOPIC_IDS entry "${id}" has no matching topic in VIDEO_VAULT_TOPICS`,
      ).toBe(true);
    }
  });

  it("VIDEO_VAULT_TOPIC_IDS and VIDEO_VAULT_TOPICS have the same count", () => {
    expect(VIDEO_VAULT_TOPIC_IDS.length).toBe(VIDEO_VAULT_TOPICS.length);
  });

  it("every HEALTHY_PREGNANCY_ARTICLES id appears in HEALTHY_PREGNANCY_ARTICLE_IDS", () => {
    const idSet = new Set<string>(HEALTHY_PREGNANCY_ARTICLE_IDS);
    for (const article of HEALTHY_PREGNANCY_ARTICLES) {
      expect(
        idSet.has(article.id),
        `article.id "${article.id}" is missing from HEALTHY_PREGNANCY_ARTICLE_IDS`,
      ).toBe(true);
    }
  });

  it("every HEALTHY_PREGNANCY_ARTICLE_IDS entry matches an article in HEALTHY_PREGNANCY_ARTICLES", () => {
    const dataIds = new Set(HEALTHY_PREGNANCY_ARTICLES.map((a) => a.id));
    for (const id of HEALTHY_PREGNANCY_ARTICLE_IDS) {
      expect(
        dataIds.has(id),
        `HEALTHY_PREGNANCY_ARTICLE_IDS entry "${id}" has no matching article in HEALTHY_PREGNANCY_ARTICLES`,
      ).toBe(true);
    }
  });

  it("HEALTHY_PREGNANCY_ARTICLE_IDS and HEALTHY_PREGNANCY_ARTICLES have the same count", () => {
    expect(HEALTHY_PREGNANCY_ARTICLE_IDS.length).toBe(
      HEALTHY_PREGNANCY_ARTICLES.length,
    );
  });
});

// ─── 2. HealthyPregnancy — initialArticleId expands the accordion ─────────────

describe("HealthyPregnancy — initialArticleId deep-link", () => {
  const FIRST_ARTICLE = HEALTHY_PREGNANCY_ARTICLES[0];

  it("renders the article list without an initialArticleId", () => {
    render(<HealthyPregnancy />);
    expect(screen.getByText(FIRST_ARTICLE.title)).toBeDefined();
  });

  it("expands the target article accordion when initialArticleId is supplied", () => {
    const article = HEALTHY_PREGNANCY_ARTICLES[0];
    render(<HealthyPregnancy initialArticleId={article.id} />);
    // The article title must appear (it's always in the button).
    expect(screen.getByText(article.title)).toBeDefined();
    // The expanded body shows the first section heading.
    const firstHeading = article.sections[0].heading;
    expect(screen.getByText(firstHeading)).toBeDefined();
  });

  it("leaves all accordions collapsed when no initialArticleId is given", () => {
    const article = HEALTHY_PREGNANCY_ARTICLES[0];
    render(<HealthyPregnancy />);
    // Title is visible (it's the accordion button).
    expect(screen.getByText(article.title)).toBeDefined();
    // Section heading is NOT visible because the accordion is closed.
    const firstHeading = article.sections[0].heading;
    expect(screen.queryByText(firstHeading)).toBeNull();
  });

  it("expands a different article when a different id is given", () => {
    const article = HEALTHY_PREGNANCY_ARTICLES[1];
    render(<HealthyPregnancy initialArticleId={article.id} />);
    expect(screen.getByText(article.title)).toBeDefined();
    const firstHeading = article.sections[0].heading;
    expect(screen.getByText(firstHeading)).toBeDefined();
    // Ensure the first article (a different one) is NOT expanded.
    const otherArticle = HEALTHY_PREGNANCY_ARTICLES[0];
    if (otherArticle.id !== article.id) {
      expect(screen.queryByText(otherArticle.sections[0].heading)).toBeNull();
    }
  });

  it("unknown initialArticleId leaves all accordions closed", () => {
    const unknownId = "does-not-exist" as unknown as HealthyPregnancyArticleId;
    render(<HealthyPregnancy initialArticleId={unknownId} />);
    for (const article of HEALTHY_PREGNANCY_ARTICLES) {
      expect(screen.queryByText(article.sections[0].heading)).toBeNull();
    }
  });
});

// ─── 3. VideoVault — initialTopicId highlights the topic card ─────────────────

describe("VideoVault — initialTopicId deep-link", () => {
  const FIRST_TOPIC = VIDEO_VAULT_TOPICS[0];

  it("renders the topic grid without an initialTopicId", () => {
    render(<VideoVault />);
    expect(screen.getByText(FIRST_TOPIC.title)).toBeDefined();
  });

  it("renders the target topic in the grid when initialTopicId is supplied", () => {
    render(<VideoVault initialTopicId={FIRST_TOPIC.id} />);
    expect(screen.getByText(FIRST_TOPIC.title)).toBeDefined();
  });

  it("applies the ring highlight class to the target topic card", () => {
    render(<VideoVault initialTopicId={FIRST_TOPIC.id} />);
    // The highlighted card gets ring-2 as a Tailwind class applied to the Card.
    // We navigate from the topic title text up to the closest element that
    // carries the ring class.
    const titleEl = screen.getByText(FIRST_TOPIC.title);
    // The ring-2 class lives on an ancestor Card element.
    const ringEl = titleEl.closest("[class*='ring-2']");
    expect(ringEl).not.toBeNull();
  });

  it("does not highlight any card when no initialTopicId is given", () => {
    const { container } = render(<VideoVault />);
    const ringEls = container.querySelectorAll("[class*='ring-2']");
    expect(ringEls.length).toBe(0);
  });

  it("highlights only the matching topic card, not others", () => {
    const targetTopic = VIDEO_VAULT_TOPICS[0];
    const otherTopic = VIDEO_VAULT_TOPICS[1];
    render(<VideoVault initialTopicId={targetTopic.id} />);

    const targetTitle = screen.getByText(targetTopic.title);
    const otherTitle = screen.getByText(otherTopic.title);

    expect(targetTitle.closest("[class*='ring-2']")).not.toBeNull();
    expect(otherTitle.closest("[class*='ring-2']")).toBeNull();
  });

  it("clicking the highlighted topic card opens the topic detail view", () => {
    render(<VideoVault initialTopicId={FIRST_TOPIC.id} />);

    // The highlighted card is clickable — click it to enter the detail view.
    const titleEl = screen.getByText(FIRST_TOPIC.title);
    const card = titleEl.closest("[class*='ring-2']");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    // TopicView renders an "All topics" back button and the topic's first video.
    expect(screen.getByText(/all topics/i)).toBeDefined();
    // The topic title is still visible in the detail header.
    expect(screen.getAllByText(FIRST_TOPIC.title).length).toBeGreaterThan(0);
    // At least one video from this topic should appear.
    const firstVideo = FIRST_TOPIC.videos[0];
    expect(screen.getByText(firstVideo.title)).toBeDefined();
  });

  it("back button in topic detail view returns to the topic grid", () => {
    render(<VideoVault initialTopicId={FIRST_TOPIC.id} />);

    // Enter the topic detail view.
    const titleEl = screen.getByText(FIRST_TOPIC.title);
    fireEvent.click(titleEl.closest("[class*='ring-2']")!);
    expect(screen.getByText(/all topics/i)).toBeDefined();

    // Click "All topics" to go back.
    fireEvent.click(screen.getByText(/all topics/i));

    // The topic grid is shown again — other topics are visible.
    expect(screen.getByText(VIDEO_VAULT_TOPICS[1].title)).toBeDefined();
  });
});

// ─── 4. SupportPerson — initialVolumeNumber expands the accordion ─────────────

describe("SupportPerson — initialVolumeNumber deep-link", () => {
  it("renders all three volumes", () => {
    render(<SupportPerson />);
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      expect(screen.getByText(vol.handoutTitle)).toBeDefined();
    }
  });

  it("expands the target volume when initialVolumeNumber is supplied", () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    render(<SupportPerson initialVolumeNumber={vol.volumeNumber} />);
    expect(screen.getByText(vol.handoutTitle)).toBeDefined();
    // The expanded body shows the volume summary.
    expect(screen.getByText(vol.summary)).toBeDefined();
  });

  it("leaves all volumes collapsed when no initialVolumeNumber is given", () => {
    render(<SupportPerson />);
    for (const vol of SUPPORT_PERSON_VOLUMES) {
      // Summary is only rendered when expanded.
      expect(screen.queryByText(vol.summary)).toBeNull();
    }
  });

  it("expands volume 2 when initialVolumeNumber=2", () => {
    const vol2 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 2)!;
    render(<SupportPerson initialVolumeNumber={2} />);
    expect(screen.getByText(vol2.summary)).toBeDefined();
    // Other volumes should NOT be expanded.
    const vol1 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 1)!;
    expect(screen.queryByText(vol1.summary)).toBeNull();
  });

  it("expands volume 3 when initialVolumeNumber=3", () => {
    const vol3 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 3)!;
    render(<SupportPerson initialVolumeNumber={3} />);
    expect(screen.getByText(vol3.summary)).toBeDefined();
  });
});

// ─── 5. Learn end-to-end deep-link flow ───────────────────────────────────────
//
// Simulates a user typing in the Learn hub search box, clicking a result, and
// confirms the correct sub-view loads with the item already expanded/highlighted.

describe("Learn — end-to-end deep-link flow", () => {
  function renderLearn() {
    return render(<Learn />);
  }

  it("shows the search input on the hub view", () => {
    renderLearn();
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );
    expect(input).toBeDefined();
  });

  it("HealthyPregnancy: clicking a search result opens the article expanded", () => {
    renderLearn();
    const article = HEALTHY_PREGNANCY_ARTICLES[0];
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );

    // Type the article title into the search box.
    fireEvent.change(input, { target: { value: article.title } });

    // A result button for this article should appear.
    const resultBtn = screen.getByText(article.title, {
      selector: "p",
    });
    // Find the ancestor button and click it.
    const btn = resultBtn.closest("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    // The HealthyPregnancy view should now be rendered with the accordion open.
    expect(screen.getByText(article.sections[0].heading)).toBeDefined();
  });

  it("VideoVault: clicking a search result opens the Video Vault with the topic highlighted", () => {
    renderLearn();
    const topic = VIDEO_VAULT_TOPICS[0];
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );

    fireEvent.change(input, { target: { value: topic.title } });

    // The result button for this topic.
    const resultBtn = screen.getByText(topic.title, { selector: "p" });
    const btn = resultBtn.closest("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    // The VideoVault view should render and the topic card should be highlighted.
    const titleEl = screen.getByText(topic.title);
    const ringEl = titleEl.closest("[class*='ring-2']");
    expect(ringEl).not.toBeNull();
  });

  it("SupportPerson: clicking a search result opens the volume expanded", () => {
    renderLearn();
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );

    fireEvent.change(input, { target: { value: vol.handoutTitle } });

    const resultBtn = screen.getByText(vol.handoutTitle, { selector: "p" });
    const btn = resultBtn.closest("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    // The SupportPerson view should show with volume 1 expanded.
    expect(screen.getByText(vol.summary)).toBeDefined();
  });

  it("shows 'No results found' when the query matches nothing", () => {
    renderLearn();
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );
    fireEvent.change(input, {
      target: { value: "xyzzy_no_match_ever_12345" },
    });
    expect(screen.getByText(/no results found/i)).toBeDefined();
  });

  it("clears back to the hub when the Back button is clicked", () => {
    renderLearn();
    const article = HEALTHY_PREGNANCY_ARTICLES[0];
    const input = screen.getByPlaceholderText(
      /search videos, articles, guides/i,
    );
    fireEvent.change(input, { target: { value: article.title } });
    const resultBtn = screen.getByText(article.title, { selector: "p" });
    fireEvent.click(resultBtn.closest("button")!);

    // Now in HealthyPregnancy view — click the back button.
    const backBtn = screen.getByText(/← back to learn/i);
    fireEvent.click(backBtn);

    // Hub shows the search bar again.
    expect(
      screen.getByPlaceholderText(/search videos, articles, guides/i),
    ).toBeDefined();
  });
});
