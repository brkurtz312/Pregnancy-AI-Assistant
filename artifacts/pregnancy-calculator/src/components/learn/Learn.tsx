import { useState, useMemo } from "react";
import { VideoVault } from "./VideoVault";
import { SupportPerson } from "./SupportPerson";
import { HealthyPregnancy } from "./HealthyPregnancy";
import {
  ExternalLink,
  Video,
  Users,
  BookOpenCheck,
  Heart,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VIDEO_VAULT_TOPICS } from "@/lib/web-video-vault";
import { SUPPORT_PERSON_VOLUMES } from "@/lib/web-support-person";
import { HEALTHY_PREGNANCY_ARTICLES } from "@/lib/web-healthy-pregnancy";

type LearnView = "hub" | "videovault" | "supportperson" | "healthypregnancy";

interface DeepLink {
  view: LearnView;
  itemId: string;
}

const EXTERNAL_RESOURCES = [
  {
    title: "ACOG Patient Resources",
    description:
      "Official patient education from the American College of Obstetricians and Gynecologists",
    url: "https://www.acog.org/patients",
    source: "ACOG",
    color: "#8b5cf6",
  },
  {
    title: "March of Dimes",
    description: "Pregnancy health, complications, and preterm birth resources",
    url: "https://www.marchofdimes.org",
    source: "March of Dimes",
    color: "#f97316",
  },
  {
    title: "CDC: Pregnancy",
    description:
      "Centers for Disease Control guidance on healthy pregnancy and infant care",
    url: "https://www.cdc.gov/pregnancy",
    source: "CDC",
    color: "#ef4444",
  },
  {
    title: "AAP HealthyChildren",
    description:
      "American Academy of Pediatrics newborn and infant care guidance",
    url: "https://www.healthychildren.org",
    source: "AAP",
    color: "#22c55e",
  },
  {
    title: "MotherToBaby",
    description:
      "Medication and exposure safety during pregnancy and breastfeeding",
    url: "https://mothertobaby.org",
    source: "MotherToBaby",
    color: "#14b8a6",
  },
  {
    title: "AWHONN",
    description:
      "Nurses' guidance on postpartum warning signs and maternal health",
    url: "https://www.awhonn.org",
    source: "AWHONN",
    color: "#ec4899",
  },
];

interface SearchResult {
  section: "videovault" | "supportperson" | "healthypregnancy";
  label: string;
  sublabel?: string;
  icon: string;
  color: string;
  view: LearnView;
  itemId: string;
}

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  for (const topic of VIDEO_VAULT_TOPICS) {
    results.push({
      section: "videovault",
      label: topic.title,
      sublabel: `${topic.videos.length} video${topic.videos.length !== 1 ? "s" : ""}`,
      icon: topic.icon,
      color: "#8b5cf6",
      view: "videovault",
      itemId: topic.id,
    });
  }

  for (const vol of SUPPORT_PERSON_VOLUMES) {
    results.push({
      section: "supportperson",
      label: vol.handoutTitle,
      sublabel: vol.pageSubtitle,
      icon: ["📖", "📋", "🎉"][vol.volumeNumber - 1],
      color: "#7c3aed",
      view: "supportperson",
      itemId: String(vol.volumeNumber),
    });
  }

  for (const article of HEALTHY_PREGNANCY_ARTICLES) {
    results.push({
      section: "healthypregnancy",
      label: article.title,
      sublabel: article.description,
      icon: article.emoji,
      color: article.color,
      view: "healthypregnancy",
      itemId: article.id,
    });
  }

  return results;
}

function matchesQuery(result: SearchResult, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;

  if (
    result.label.toLowerCase().includes(q) ||
    (result.sublabel ?? "").toLowerCase().includes(q)
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

  if (result.section === "healthypregnancy") {
    const article = HEALTHY_PREGNANCY_ARTICLES.find(
      (a) => a.title === result.label,
    );
    if (
      article?.sections.some(
        (s) =>
          s.heading.toLowerCase().includes(q) ||
          s.bullets.some((b) => b.toLowerCase().includes(q)),
      )
    ) {
      return true;
    }
  }

  return false;
}

const SECTION_META: Record<
  "videovault" | "supportperson" | "healthypregnancy",
  { label: string; color: string }
> = {
  videovault: { label: "Video Vault", color: "#8b5cf6" },
  supportperson: { label: "Support Person Series", color: "#7c3aed" },
  healthypregnancy: { label: "Healthy Pregnancy", color: "#f43f5e" },
};

const ALL_RESULTS = buildSearchIndex();

export function Learn() {
  const [view, setView] = useState<LearnView>("hub");
  const [deepLink, setDeepLink] = useState<DeepLink | null>(null);
  const [query, setQuery] = useState("");

  function navigateTo(v: LearnView, itemId?: string) {
    setView(v);
    setDeepLink(itemId ? { view: v, itemId } : null);
    setQuery("");
  }

  if (view === "videovault") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigateTo("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <VideoVault
          initialTopicId={
            deepLink?.view === "videovault" ? deepLink.itemId : undefined
          }
        />
      </div>
    );
  }

  if (view === "supportperson") {
    const volNum =
      deepLink?.view === "supportperson" ? Number(deepLink.itemId) : undefined;
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigateTo("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <SupportPerson initialVolumeNumber={volNum} />
      </div>
    );
  }

  if (view === "healthypregnancy") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigateTo("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <HealthyPregnancy
          initialArticleId={
            deepLink?.view === "healthypregnancy" ? deepLink.itemId : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-serif text-foreground mb-1">
          Learn
        </h2>
        <p className="text-sm text-muted-foreground">
          Trusted resources from medical societies, government agencies, and
          patient advocates
        </p>
      </div>

      <SearchBar query={query} onChange={setQuery} />

      {query.trim() ? (
        <SearchResults
          query={query}
          onNavigate={(v, itemId) => navigateTo(v, itemId)}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              onClick={() => navigateTo("videovault")}
              className="p-5 cursor-pointer hover:bg-muted/30 transition-colors border-border/50 rounded-2xl group"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
                  <Video className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">
                    Video Vault
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    100+ curated videos from ACOG, CDC, AAP, March of Dimes, and
                    more — organized into 16 topics
                  </p>
                  <p className="text-xs text-primary mt-2 font-medium group-hover:underline">
                    Browse videos →
                  </p>
                </div>
              </div>
            </Card>

            <Card
              onClick={() => navigateTo("supportperson")}
              className="p-5 cursor-pointer hover:bg-muted/30 transition-colors border-border/50 rounded-2xl group"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-violet-100 rounded-xl shrink-0">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">
                    Support Person Series
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A three-volume field guide for partners, family, and friends
                    — from pregnancy through postpartum
                  </p>
                  <p className="text-xs text-violet-600 mt-2 font-medium group-hover:underline">
                    Read the guides →
                  </p>
                </div>
              </div>
            </Card>

            <Card
              onClick={() => navigateTo("healthypregnancy")}
              className="p-5 cursor-pointer hover:bg-muted/30 transition-colors border-border/50 rounded-2xl group sm:col-span-2"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-rose-100 rounded-xl shrink-0">
                  <Heart className="w-5 h-5 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">
                    Healthy Pregnancy
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Evidence-based ACOG guidance on travel, nutrition, exercise,
                    intimacy, medications, and warning signs — all in one place
                  </p>
                  <p className="text-xs text-rose-500 mt-2 font-medium group-hover:underline">
                    Browse articles →
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpenCheck className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                External Resources
              </h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXTERNAL_RESOURCES.map((res) => (
                <a
                  key={res.url}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors group"
                >
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: res.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {res.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {res.description}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SearchBar({
  query,
  onChange,
}: {
  query: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder="Search videos, articles, guides…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-9 rounded-xl bg-muted/40 border-border/50 focus-visible:ring-1"
      />
      {query && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function SearchResults({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate: (view: LearnView, itemId: string) => void;
}) {
  const matches = useMemo(
    () => ALL_RESULTS.filter((r) => matchesQuery(r, query)),
    [query],
  );

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <p className="text-3xl">🔍</p>
        <p className="text-sm font-medium text-foreground">No results found</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Try a different keyword — e.g. "nutrition", "warning signs", or
          "labor".
        </p>
      </div>
    );
  }

  const grouped = (["videovault", "supportperson", "healthypregnancy"] as const)
    .map((section) => ({
      section,
      items: matches.filter((m) => m.section === section),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {matches.length} result{matches.length !== 1 ? "s" : ""} for "
        <span className="font-medium text-foreground">{query}</span>"
      </p>
      {grouped.map(({ section, items }) => (
        <div key={section}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {SECTION_META[section].label}
          </p>
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={`${item.section}-${item.label}`}
                onClick={() => onNavigate(item.view, item.itemId)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors group"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
                  style={{ backgroundColor: item.color + "18" }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    {item.label}
                  </p>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 leading-relaxed">
                      {item.sublabel}
                    </p>
                  )}
                </div>
                <span
                  className="text-xs font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: item.color }}
                >
                  View →
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
