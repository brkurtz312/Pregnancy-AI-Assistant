import { useState, useRef, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { DueDateForm } from "@/components/calculator/due-date-form";
import { ConceptionForm } from "@/components/calculator/conception-form";
import { UltrasoundForm } from "@/components/calculator/ultrasound-form";
import { LmpForm } from "@/components/calculator/lmp-form";
import { ResultsDisplay } from "@/components/calculator/results-display";
import { SymptomLog, KickCounter, ContractionTimer } from "@/components/tools";
import { MyInfo } from "@/components/profile/MyInfo";
import { FetalDevelopmentViewer } from "@/components/fetal-development/FetalDevelopmentViewer";
import { MaternalDevelopmentViewer } from "@/components/fetal-development/MaternalDevelopmentViewer";
import { Journal } from "@/components/journal/Journal";
import { HospitalBag } from "@/components/tools/HospitalBag";
import { BirthPlan } from "@/components/tools/BirthPlan";
import { Learn } from "@/components/learn/Learn";
import { PregnancyResults } from "@/lib/pregnancy-math";
import { calculateByDueDate } from "@/lib/pregnancy-math";
import {
  Baby,
  Heart,
  Sprout,
  BookOpen,
  GraduationCap,
  FileText,
  Luggage,
  Activity,
  Timer,
  Footprints,
  Wrench,
} from "lucide-react";
import { AccountBar } from "@/components/auth/account-bar";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { localDateString } from "@/lib/dates";

type ToolView =
  | null
  | "symptoms"
  | "kick"
  | "contraction"
  | "hospitalbag"
  | "birthplan"
  | "scribe";

const TOOLS = [
  {
    id: "symptoms" as ToolView,
    label: "Symptom Log",
    icon: Activity,
    desc: "Track daily symptoms",
    color: "text-rose-500",
    bg: "bg-rose-50",
  },
  {
    id: "kick" as ToolView,
    label: "Kick Counter",
    icon: Footprints,
    desc: "Count baby movements",
    color: "text-violet-500",
    bg: "bg-violet-50",
  },
  {
    id: "contraction" as ToolView,
    label: "Contraction Timer",
    icon: Timer,
    desc: "Time contractions",
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  {
    id: "hospitalbag" as ToolView,
    label: "Hospital Bag",
    icon: Luggage,
    desc: "Pack for delivery",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    id: "birthplan" as ToolView,
    label: "Birth Plan",
    icon: FileText,
    desc: "ACOG-based questionnaire",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

function ToolsSection() {
  const [activeTool, setActiveTool] = useState<ToolView>(null);

  if (activeTool !== null) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveTool(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Wrench className="w-3.5 h-3.5" /> ← All Tools
        </button>
        {activeTool === "symptoms" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <SymptomLog />
          </Card>
        )}
        {activeTool === "kick" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <KickCounter />
          </Card>
        )}
        {activeTool === "contraction" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <ContractionTimer />
          </Card>
        )}
        {activeTool === "hospitalbag" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <HospitalBag />
          </Card>
        )}
        {activeTool === "birthplan" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <BirthPlan />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-2xl font-bold font-serif text-foreground">Tools</h2>
        <p className="text-sm text-muted-foreground">
          Everything you need in one place
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-center shadow-sm"
            >
              <div className={`p-2.5 rounded-xl ${tool.bg}`}>
                <Icon className={`w-5 h-5 ${tool.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {tool.label}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {tool.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [results, setResults] = useState<PregnancyResults | null>(null);
  const [page, setPage] = useState<
    "calculator" | "journal" | "tools" | "learn" | "development" | "myinfo"
  >("calculator");
  const [devView, setDevView] = useState<"fetal" | "maternal">("fetal");
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoLoadedRef = useRef(false);

  const { isSignedIn, user } = useUser();
  const { data: profile } = useGetProfile();
  const updateProfileMutation = useUpdateProfile();

  // Reset local due-date state when the signed-in user changes (account switch).
  // Without this, switching from user A to user B in the same SPA session leaves
  // `results` and `autoLoadedRef` set to user A's values, so the profile useEffect
  // below never fires for user B (its guard `!autoLoadedRef.current && !results`
  // is false). Resetting on userId change lets the profile effect re-run cleanly
  // for the incoming user.
  const prevUserIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== user?.id) {
      prevUserIdRef.current = user?.id;
      setResults(null);
      autoLoadedRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (profile?.dueDate && !autoLoadedRef.current && !results) {
      const r = calculateByDueDate(profile.dueDate);
      if (r) {
        setResults(r);
        autoLoadedRef.current = true;
      }
    }
  }, [profile, results]);

  const handleSetResults = useCallback(
    (r: PregnancyResults | null) => {
      setResults(r);
      if (r && isSignedIn) {
        updateProfileMutation.mutate({
          data: { dueDate: localDateString(r.edd) },
        });
      }
    },
    [isSignedIn, updateProfileMutation],
  );

  const handleTabChange = () => {
    handleSetResults(null);
  };

  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [results]);

  const navItems = [
    { id: "calculator" as const, label: "Calculator", icon: Baby },
    { id: "journal" as const, label: "Journal", icon: BookOpen },
    { id: "tools" as const, label: "Tools", icon: Wrench },
    { id: "learn" as const, label: "Learn", icon: GraduationCap },
    { id: "development" as const, label: "Development", icon: Sprout },
    ...(isSignedIn
      ? [{ id: "myinfo" as const, label: "My Info", icon: Heart }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 md:py-12 md:px-8 selection:bg-primary/20">
      <div className="max-w-4xl mx-auto space-y-8">
        <AccountBar />

        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4">
            <Baby className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-serif tracking-tight text-foreground">
            Pregnancy AI Assistant
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A gentle and precise tool to calculate key pregnancy dates and
            milestones. Choose your known information below to get started.
          </p>
        </div>

        <div className="w-full overflow-x-auto pb-0.5">
          <div className="flex gap-1 sm:gap-1.5 p-1 bg-muted rounded-xl w-fit mx-auto">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
                  page === id
                    ? "bg-card shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {page === "calculator" && (
          <>
            <Card className="p-1 sm:p-2 bg-card border-border/50 shadow-sm rounded-3xl overflow-hidden">
              <Tabs
                defaultValue="lmp"
                className="w-full"
                onValueChange={handleTabChange}
              >
                <div className="p-2 sm:p-4 bg-muted/30 border-b border-border/40">
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto gap-2 bg-transparent p-0">
                    <TabsTrigger
                      value="lmp"
                      className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-xl py-3 text-sm md:text-base transition-all"
                      data-testid="tab-lmp"
                    >
                      By LMP
                    </TabsTrigger>
                    <TabsTrigger
                      value="duedate"
                      className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-xl py-3 text-sm md:text-base transition-all"
                      data-testid="tab-due-date"
                    >
                      By Due Date
                    </TabsTrigger>
                    <TabsTrigger
                      value="conception"
                      className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-xl py-3 text-sm md:text-base transition-all"
                      data-testid="tab-conception"
                    >
                      By Conception Date
                    </TabsTrigger>
                    <TabsTrigger
                      value="ultrasound"
                      className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-xl py-3 text-sm md:text-base transition-all"
                      data-testid="tab-ultrasound"
                    >
                      By Ultrasound
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-4 sm:p-6 md:p-8">
                  <TabsContent value="lmp" className="mt-0 outline-none">
                    <div className="max-w-2xl mx-auto">
                      <LmpForm onCalculate={handleSetResults} />
                    </div>
                  </TabsContent>
                  <TabsContent value="duedate" className="mt-0 outline-none">
                    <div className="max-w-2xl mx-auto">
                      <DueDateForm onCalculate={handleSetResults} />
                    </div>
                  </TabsContent>
                  <TabsContent value="conception" className="mt-0 outline-none">
                    <div className="max-w-2xl mx-auto">
                      <ConceptionForm onCalculate={handleSetResults} />
                    </div>
                  </TabsContent>
                  <TabsContent value="ultrasound" className="mt-0 outline-none">
                    <div className="max-w-2xl mx-auto">
                      <UltrasoundForm onCalculate={handleSetResults} />
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </Card>

            {results && (
              <div
                ref={resultsRef}
                className="scroll-mt-8 animate-in fade-in duration-500"
              >
                <ResultsDisplay results={results} />
              </div>
            )}
          </>
        )}

        {page === "journal" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <Journal />
          </Card>
        )}

        {page === "tools" && <ToolsSection />}

        {page === "learn" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <Learn />
          </Card>
        )}

        {page === "development" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="flex gap-1 p-1 bg-muted rounded-xl">
                <button
                  onClick={() => setDevView("fetal")}
                  className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    devView === "fetal"
                      ? "bg-card shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Fetal View
                </button>
                <button
                  onClick={() => setDevView("maternal")}
                  className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    devView === "maternal"
                      ? "bg-card shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Maternal View
                </button>
              </div>
            </div>
            {devView === "fetal" ? (
              <FetalDevelopmentViewer />
            ) : (
              <MaternalDevelopmentViewer />
            )}
          </div>
        )}

        {page === "myinfo" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <MyInfo />
          </Card>
        )}
      </div>
    </div>
  );
}
