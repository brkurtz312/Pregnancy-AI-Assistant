import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, ChevronDown, ChevronUp } from "lucide-react";
import {
  SUPPORT_PERSON_VOLUMES,
  buildSupportPersonHtml,
  type SupportPersonVolume,
  type SupportPersonVolumeNumber,
} from "@/lib/web-support-person";
import { printHtml } from "@/lib/print-html";

const VOL_COLORS = [
  {
    bg: "bg-rose-50",
    border: "border-rose-200/60",
    badge: "bg-primary/10 text-primary",
  },
  {
    bg: "bg-violet-50/60",
    border: "border-violet-200/60",
    badge: "bg-violet-100 text-violet-700",
  },
  {
    bg: "bg-emerald-50/60",
    border: "border-emerald-200/60",
    badge: "bg-emerald-100 text-emerald-700",
  },
];

interface SupportPersonProps {
  initialVolumeNumber?: SupportPersonVolumeNumber;
}

export function SupportPerson({ initialVolumeNumber }: SupportPersonProps) {
  const [expanded, setExpanded] = useState<SupportPersonVolumeNumber | null>(
    initialVolumeNumber ?? null,
  );
  const cardRefs = useRef<Map<SupportPersonVolumeNumber, HTMLDivElement>>(
    new Map(),
  );

  useEffect(() => {
    if (!initialVolumeNumber) return;
    const el = cardRefs.current.get(initialVolumeNumber);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialVolumeNumber]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold font-serif text-foreground mb-1">
          Support Person Survival Series
        </h2>
        <p className="text-xs text-muted-foreground">
          A three-volume field guide for partners, family members, and friends
        </p>
      </div>

      <div className="space-y-4">
        {SUPPORT_PERSON_VOLUMES.map((vol, idx) => (
          <div
            key={vol.volumeNumber}
            ref={(el) => {
              if (el) cardRefs.current.set(vol.volumeNumber, el);
              else cardRefs.current.delete(vol.volumeNumber);
            }}
          >
            <VolumeCard
              vol={vol}
              colors={VOL_COLORS[idx]}
              isExpanded={expanded === vol.volumeNumber}
              onToggle={() =>
                setExpanded(
                  expanded === vol.volumeNumber ? null : vol.volumeNumber,
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface VolumeCardProps {
  vol: SupportPersonVolume;
  colors: { bg: string; border: string; badge: string };
  isExpanded: boolean;
  onToggle: () => void;
}

function VolumeCard({ vol, colors, isExpanded, onToggle }: VolumeCardProps) {
  return (
    <Card className={`rounded-2xl border overflow-hidden ${colors.border}`}>
      <button
        onClick={onToggle}
        className={`w-full text-left p-5 ${colors.bg} transition-colors hover:brightness-[0.97]`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${colors.badge}`}
              >
                Vol {vol.volumeNumber}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {vol.seriesLabel.split("·")[1]?.trim()}
              </span>
            </div>
            <h3 className="text-xl font-bold font-serif text-foreground mb-0.5">
              {vol.handoutTitle}
            </h3>
            <p className="text-xs text-muted-foreground">{vol.pageSubtitle}</p>
          </div>
          <div className="shrink-0 mt-1">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="p-5 space-y-4 bg-card">
          <p className="text-sm text-foreground leading-relaxed">
            {vol.summary}
          </p>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              What You'll Learn
            </h4>
            <ul className="space-y-2.5">
              {vol.highlights.map((h, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground">
                  <span className="text-primary shrink-0 mt-0.5 text-xs">
                    ◆
                  </span>
                  <span className="leading-relaxed">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => printHtml(buildSupportPersonHtml(vol))}
            className="gap-2 rounded-xl text-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Handout
          </Button>
        </div>
      )}
    </Card>
  );
}
