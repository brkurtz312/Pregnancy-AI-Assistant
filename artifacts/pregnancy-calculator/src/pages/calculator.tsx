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
import { PregnancyResults } from "@/lib/pregnancy-math";
import { calculateByDueDate } from "@/lib/pregnancy-math";
import { Baby, Wrench, Heart } from "lucide-react";
import { AccountBar } from "@/components/auth/account-bar";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

function ToolsSection() {
  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
        <SymptomLog />
      </Card>
      <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
        <KickCounter />
      </Card>
      <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
        <ContractionTimer />
      </Card>
    </div>
  );
}

export default function CalculatorPage() {
  const [results, setResults] = useState<PregnancyResults | null>(null);
  const [page, setPage] = useState<"calculator" | "tools" | "myinfo">(
    "calculator",
  );
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoLoadedRef = useRef(false);

  const { isSignedIn } = useUser();
  const { data: profile } = useGetProfile();
  const updateProfileMutation = useUpdateProfile();

  // Auto-restore results from saved due date on first load
  useEffect(() => {
    if (profile?.dueDate && !autoLoadedRef.current && !results) {
      const r = calculateByDueDate(profile.dueDate);
      if (r) {
        setResults(r);
        autoLoadedRef.current = true;
      }
    }
  }, [profile, results]);

  // Save EDC to profile whenever a manual calculation produces results
  const handleSetResults = useCallback(
    (r: PregnancyResults | null) => {
      setResults(r);
      if (r && isSignedIn) {
        updateProfileMutation.mutate({
          data: { dueDate: r.edd.toISOString().slice(0, 10) },
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

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 md:py-12 md:px-8 selection:bg-primary/20">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Account / auth controls */}
        <AccountBar />

        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4">
            <Baby className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-serif tracking-tight text-foreground">
            Pregnancy Assistant
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A gentle and precise tool to calculate key pregnancy dates and
            milestones. Choose your known information below to get started.
          </p>
        </div>

        {/* Page-level nav: Calculator | Tools | My Info */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl w-fit mx-auto">
          <button
            onClick={() => setPage("calculator")}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              page === "calculator"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Baby className="w-4 h-4" /> Calculator
          </button>
          <button
            onClick={() => setPage("tools")}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              page === "tools"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wrench className="w-4 h-4" /> Tools
          </button>
          {isSignedIn && (
            <button
              onClick={() => setPage("myinfo")}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                page === "myinfo"
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart className="w-4 h-4" /> My Info
            </button>
          )}
        </div>

        {/* Calculator view */}
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

            {/* Results */}
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

        {/* Tools view */}
        {page === "tools" && <ToolsSection />}

        {/* My Info view */}
        {page === "myinfo" && (
          <Card className="p-6 bg-card border-border/50 shadow-sm rounded-3xl">
            <MyInfo />
          </Card>
        )}
      </div>
    </div>
  );
}
