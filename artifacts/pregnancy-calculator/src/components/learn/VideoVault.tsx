import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, ChevronRight, ArrowLeft } from "lucide-react";
import {
  VIDEO_VAULT_TOPICS,
  VIDEO_VAULT_SOURCES,
  VIDEO_VAULT_SOURCE_COLORS,
  getVideoVaultTotals,
  type VideoVaultTopic,
} from "@/lib/web-video-vault";

export function VideoVault() {
  const [search, setSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState("All");
  const [activeTopic, setActiveTopic] = useState<VideoVaultTopic | null>(null);
  const { totalVideos, topicCount } = getVideoVaultTotals();

  const filteredTopics = useMemo(() => {
    if (!search && selectedSource === "All") return VIDEO_VAULT_TOPICS;
    return VIDEO_VAULT_TOPICS.map((topic) => {
      const videos = topic.videos.filter((v) => {
        const matchesSource =
          selectedSource === "All" || v.source === selectedSource;
        const matchesSearch =
          !search ||
          v.title.toLowerCase().includes(search.toLowerCase()) ||
          v.source.toLowerCase().includes(search.toLowerCase());
        return matchesSource && matchesSearch;
      });
      return { ...topic, videos };
    }).filter((t) => t.videos.length > 0);
  }, [search, selectedSource]);

  const isFiltered = search || selectedSource !== "All";

  if (activeTopic && !isFiltered) {
    const display =
      filteredTopics.find((t) => t.id === activeTopic.id) ?? activeTopic;
    return <TopicView topic={display} onBack={() => setActiveTopic(null)} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold font-serif text-foreground mb-1">
          Video Vault
        </h2>
        <p className="text-xs text-muted-foreground">
          {totalVideos}+ curated videos from ACOG, CDC, AAP, NICHD & more —{" "}
          {topicCount} topics
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveTopic(null);
          }}
          placeholder="Search videos by title or source…"
          className="pl-9 rounded-xl border-border/50"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VIDEO_VAULT_SOURCES.map((src) => (
          <button
            key={src}
            onClick={() => {
              setSelectedSource(src);
              setActiveTopic(null);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
              selectedSource === src
                ? "bg-primary text-white border-primary"
                : "bg-background border-border/50 text-muted-foreground hover:border-primary/40"
            }`}
            style={
              selectedSource === src && src !== "All"
                ? {
                    backgroundColor:
                      VIDEO_VAULT_SOURCE_COLORS[src] ?? undefined,
                    borderColor: VIDEO_VAULT_SOURCE_COLORS[src] ?? undefined,
                  }
                : {}
            }
          >
            {src}
          </button>
        ))}
      </div>

      {isFiltered ? (
        <div className="space-y-3">
          {filteredTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No videos found. Try a different search or filter.
            </p>
          ) : (
            filteredTopics.map((topic) => (
              <div key={topic.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>{topic.icon}</span> {topic.title}
                </h3>
                {topic.videos.map((video, i) => (
                  <VideoCard key={i} video={video} />
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {VIDEO_VAULT_TOPICS.map((topic) => (
            <Card
              key={topic.id}
              onClick={() => setActiveTopic(topic)}
              className="p-4 cursor-pointer hover:bg-muted/30 transition-colors border-border/50 rounded-2xl group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{topic.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {topic.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {topic.videos.length} video
                      {topic.videos.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TopicView({
  topic,
  onBack,
}: {
  topic: VideoVaultTopic;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> All topics
      </button>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{topic.icon}</span>
        <div>
          <h2 className="text-xl font-semibold font-serif text-foreground">
            {topic.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {topic.videos.length} video{topic.videos.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {topic.videos.map((video, i) => (
          <VideoCard key={i} video={video} />
        ))}
      </div>
    </div>
  );
}

function VideoCard({
  video,
}: {
  video: {
    title: string;
    url: string;
    source: string;
    language?: string;
    verified: boolean;
  };
}) {
  const color = VIDEO_VAULT_SOURCE_COLORS[video.source];
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors group"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: color ?? "#94a3b8" }}
        />
        <div className="min-w-0">
          <p className="text-sm text-foreground leading-snug line-clamp-2">
            {video.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                color: color ?? "#94a3b8",
                backgroundColor: (color ?? "#94a3b8") + "18",
              }}
            >
              {video.source}
            </span>
            {video.language && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {video.language}
              </span>
            )}
          </div>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </a>
  );
}
