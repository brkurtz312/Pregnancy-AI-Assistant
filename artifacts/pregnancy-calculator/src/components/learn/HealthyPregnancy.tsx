import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  HEALTHY_PREGNANCY_ARTICLES,
  type HealthyPregnancyArticle,
} from "@/lib/web-healthy-pregnancy";

export function HealthyPregnancy() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold font-serif text-foreground mb-1">
          Healthy Pregnancy
        </h2>
        <p className="text-xs text-muted-foreground">
          Evidence-based ACOG guidance on staying well through your pregnancy.
        </p>
      </div>

      <div className="space-y-3">
        {HEALTHY_PREGNANCY_ARTICLES.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            isExpanded={expanded === article.id}
            onToggle={() =>
              setExpanded(expanded === article.id ? null : article.id)
            }
          />
        ))}
      </div>

      <div
        className="flex items-start gap-2.5 rounded-xl p-3.5"
        style={{ backgroundColor: "hsl(var(--primary) / 0.08)" }}
      >
        <Info
          className="w-4 h-4 shrink-0 mt-0.5"
          style={{ color: "hsl(var(--primary))" }}
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          All content is based on ACOG patient education materials. Always
          discuss your individual situation with your care provider.
        </p>
      </div>
    </div>
  );
}

interface ArticleCardProps {
  article: HealthyPregnancyArticle;
  isExpanded: boolean;
  onToggle: () => void;
}

function ArticleCard({ article, isExpanded, onToggle }: ArticleCardProps) {
  return (
    <Card className="rounded-2xl border border-border/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
            style={{ backgroundColor: article.color + "18" }}
          >
            {article.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground">
              {article.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {article.description}
            </p>
          </div>
          <div className="shrink-0 ml-1">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-5 space-y-5 border-t border-border/40 pt-4">
          {article.sections.map((section) => (
            <div key={section.heading}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {section.heading}
              </h4>
              <ul className="space-y-2">
                {section.bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-foreground">
                    <span
                      className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: article.color }}
                    />
                    <span className="leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
