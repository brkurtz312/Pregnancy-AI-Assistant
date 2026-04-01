import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PregnancyResults, formatGestationalAge, getMilestones } from "@/lib/pregnancy-math";
import { format, isPast, isToday } from "date-fns";
import { Baby, Calendar, Heart, Clock, Activity } from "lucide-react";

interface ResultsDisplayProps {
  results: PregnancyResults | null;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
  if (!results) return null;

  const milestones = getMilestones(results);
  
  const getTrimesterText = (t: 1 | 2 | 3) => {
    if (t === 1) return "First Trimester";
    if (t === 2) return "Second Trimester";
    return "Third Trimester";
  };

  const getDueText = (daysUntil: number) => {
    if (daysUntil === 0) return "Due today!";
    if (daysUntil < 0) return `${Math.abs(daysUntil)} days past due`;
    if (daysUntil < 7) return `${daysUntil} days left!`;
    const weeks = Math.floor(daysUntil / 7);
    const days = daysUntil % 7;
    return `${weeks}w ${days}d left`;
  };

  return (
    <div className="space-y-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="results-section">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Main GA Card */}
        <Card className="col-span-1 md:col-span-2 border-primary/20 shadow-md">
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-4">
            <Badge variant="secondary" className="bg-accent/10 text-accent font-medium px-3 py-1 text-sm rounded-full mb-2">
              {getTrimesterText(results.trimester)}
            </Badge>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Gestational Age</h3>
              <p className="text-4xl md:text-5xl font-bold text-foreground font-serif tracking-tight" data-testid="text-gestational-age">
                {formatGestationalAge(results.currentGestationalAgeWeeks, results.currentGestationalAgeRemainderDays)}
              </p>
            </div>
            
            <div className="w-full max-w-md space-y-2 mt-4">
              <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                <span>Conception</span>
                <span className="text-primary font-semibold">{results.progressPercentage.toFixed(0)}%</span>
                <span>Birth</span>
              </div>
              <Progress value={results.progressPercentage} className="h-3 bg-primary/10" data-testid="progress-bar" />
            </div>
          </CardContent>
        </Card>

        {/* Key Dates Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Key Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Estimated Due Date</span>
              <span className="font-medium text-foreground" data-testid="text-edd">{format(results.edd, 'MMMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Last Menstrual Period</span>
              <span className="font-medium text-foreground">{format(results.lmp, 'MMMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Estimated Conception</span>
              <span className="font-medium text-foreground">{format(results.conception, 'MMMM d, yyyy')}</span>
            </div>
          </CardContent>
        </Card>

        {/* Countdown Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              Countdown
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center items-center h-full pb-8">
            <div className="bg-accent/10 rounded-full w-24 h-24 flex items-center justify-center mb-4">
              <Baby className="w-10 h-10 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground text-center" data-testid="text-countdown">
              {getDueText(results.daysUntilDue)}
            </p>
          </CardContent>
        </Card>

        {/* Milestones Card */}
        <Card className="col-span-1 md:col-span-2 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Timeline Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              
              <MilestoneItem 
                title="End of First Trimester (Week 14)" 
                date={milestones.endFirstTrimester} 
                isLast={false} 
              />
              <MilestoneItem 
                title="End of Second Trimester (Week 28)" 
                date={milestones.endSecondTrimester} 
                isLast={false} 
              />
              <MilestoneItem 
                title="Estimated Due Date (Week 40)" 
                date={milestones.due} 
                isLast={true} 
              />
              
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function MilestoneItem({ title, date, isLast }: { title: string, date: Date, isLast: boolean }) {
  const completed = isPast(date) && !isToday(date);
  
  return (
    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-3">
      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-primary/20 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${completed ? 'bg-primary/40 text-primary' : 'text-primary/50'}`}>
        {completed ? <Heart className="w-4 h-4 fill-primary text-primary" /> : <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </div>
      
      <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${completed ? 'bg-card border-primary/20 shadow-sm' : 'bg-muted/30 border-border/50'} `}>
        <div className="flex items-center justify-between space-x-2 mb-1">
          <h4 className={`font-semibold text-sm ${completed ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</h4>
          {completed && <Badge variant="outline" className="text-[10px] uppercase bg-primary/5 text-primary border-primary/20">Completed</Badge>}
        </div>
        <p className={`text-sm ${completed ? 'text-foreground/80' : 'text-muted-foreground/70'}`}>{format(date, 'MMMM d, yyyy')}</p>
      </div>
    </div>
  );
}
