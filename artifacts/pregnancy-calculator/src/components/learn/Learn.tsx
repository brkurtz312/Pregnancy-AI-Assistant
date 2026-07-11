import { useState } from "react";
import { VideoVault } from "./VideoVault";
import { SupportPerson } from "./SupportPerson";
import { HealthyPregnancy } from "./HealthyPregnancy";
import { ExternalLink, Video, Users, BookOpenCheck, Heart } from "lucide-react";
import { Card } from "@/components/ui/card";

type LearnView = "hub" | "videovault" | "supportperson" | "healthypregnancy";

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

export function Learn() {
  const [view, setView] = useState<LearnView>("hub");

  if (view === "videovault") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <VideoVault />
      </div>
    );
  }

  if (view === "supportperson") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <SupportPerson />
      </div>
    );
  }

  if (view === "healthypregnancy") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("hub")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to Learn
        </button>
        <HealthyPregnancy />
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          onClick={() => setView("videovault")}
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
          onClick={() => setView("supportperson")}
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
                A three-volume field guide for partners, family, and friends —
                from pregnancy through postpartum
              </p>
              <p className="text-xs text-violet-600 mt-2 font-medium group-hover:underline">
                Read the guides →
              </p>
            </div>
          </div>
        </Card>

        <Card
          onClick={() => setView("healthypregnancy")}
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
    </div>
  );
}
