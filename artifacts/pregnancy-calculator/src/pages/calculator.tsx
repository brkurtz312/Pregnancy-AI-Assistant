import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { DueDateForm } from "@/components/calculator/due-date-form";
import { ConceptionForm } from "@/components/calculator/conception-form";
import { UltrasoundForm } from "@/components/calculator/ultrasound-form";
import { LmpForm } from "@/components/calculator/lmp-form";
import { ResultsDisplay } from "@/components/calculator/results-display";
import { PregnancyResults } from "@/lib/pregnancy-math";
import { Baby } from "lucide-react";

export default function CalculatorPage() {
  const [results, setResults] = useState<PregnancyResults | null>(null);

  const handleTabChange = () => {
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 md:py-12 md:px-8 selection:bg-primary/20">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4">
            <Baby className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-serif tracking-tight text-foreground">
            Pregnancy Calculator
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A gentle and precise tool to calculate key pregnancy dates and milestones. 
            Choose your known information below to get started.
          </p>
        </div>

        {/* Main Calculator Card */}
        <Card className="p-1 sm:p-2 bg-card border-border/50 shadow-sm rounded-3xl overflow-hidden">
          <Tabs defaultValue="lmp" className="w-full" onValueChange={handleTabChange}>
            
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
                  <LmpForm onCalculate={setResults} />
                </div>
              </TabsContent>

              <TabsContent value="duedate" className="mt-0 outline-none">
                <div className="max-w-2xl mx-auto">
                  <DueDateForm onCalculate={setResults} />
                </div>
              </TabsContent>
              
              <TabsContent value="conception" className="mt-0 outline-none">
                <div className="max-w-2xl mx-auto">
                  <ConceptionForm onCalculate={setResults} />
                </div>
              </TabsContent>
              
              <TabsContent value="ultrasound" className="mt-0 outline-none">
                <div className="max-w-2xl mx-auto">
                  <UltrasoundForm onCalculate={setResults} />
                </div>
              </TabsContent>
            </div>

          </Tabs>
        </Card>

        {/* Results */}
        {results && (
          <div className="animate-in fade-in duration-500">
            <ResultsDisplay results={results} />
          </div>
        )}

      </div>
    </div>
  );
}
