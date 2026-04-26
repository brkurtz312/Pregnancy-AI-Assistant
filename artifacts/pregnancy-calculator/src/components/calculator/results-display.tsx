import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PregnancyResults, formatGestationalAge, getMilestones } from "@/lib/pregnancy-math";
import { getWeeklyDevelopment, getUpcomingWeeks } from "@/lib/fetal-development";
import { format, isPast, isToday } from "date-fns";
import { Baby, Calendar, Heart, Clock, Activity, Sparkles, ChevronRight } from "lucide-react";

import fetalWeek04 from "@/assets/fetal-week-04.png";
import fetalWeek08 from "@/assets/fetal-week-08.png";
import fetalWeek12 from "@/assets/fetal-week-12.png";
import fetalWeek16 from "@/assets/fetal-week-16.png";
import fetalWeek20 from "@/assets/fetal-week-20.png";
import fetalWeek24 from "@/assets/fetal-week-24.png";
import fetalWeek28 from "@/assets/fetal-week-28.png";
import fetalWeek32 from "@/assets/fetal-week-32.png";
import fetalWeek36 from "@/assets/fetal-week-36.png";
import fetalWeek40 from "@/assets/fetal-week-40.png";

function getFetalImage(week: number): string {
  if (week <= 5)  return fetalWeek04;
  if (week <= 9)  return fetalWeek08;
  if (week <= 13) return fetalWeek12;
  if (week <= 17) return fetalWeek16;
  if (week <= 21) return fetalWeek20;
  if (week <= 25) return fetalWeek24;
  if (week <= 29) return fetalWeek28;
  if (week <= 33) return fetalWeek32;
  if (week <= 37) return fetalWeek36;
  return fetalWeek40;
}

interface ResultsDisplayProps {
  results: PregnancyResults | null;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
  if (!results) return null;

  const milestones = getMilestones(results);
  const currentWeekData = getWeeklyDevelopment(results.currentGestationalAgeWeeks);
  const upcomingWeeks = getUpcomingWeeks(results.currentGestationalAgeWeeks, 3);
  
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

      {/* Fetal Development Section */}
      {currentWeekData && (
        <div className="space-y-4 mt-2" data-testid="fetal-development-section">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Fetal Development — Week {currentWeekData.week}
          </h2>

          {/* Current Week Card */}
          <Card className="border-primary/20 shadow-md" data-testid="card-current-week">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">This Week: Week {currentWeekData.week}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20 font-medium">
                    {currentWeekData.size}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground border-border/60">
                    About the size of {currentWeekData.sizeComparison}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Illustration */}
              <div className="flex justify-center">
                <div className="relative w-48 h-48 rounded-2xl bg-primary/5 border border-primary/10 overflow-hidden flex items-center justify-center">
                  <img
                    src={getFetalImage(currentWeekData.week)}
                    alt={`Fetal development illustration at week ${currentWeekData.week}`}
                    className="w-full h-full object-contain p-3"
                    data-testid="img-fetal-development"
                  />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">Baby's Development</h4>
                <ul className="space-y-2" data-testid="list-baby-development">
                  {currentWeekData.development.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">What You May Experience</h4>
                <ul className="space-y-2" data-testid="list-mother-changes">
                  {currentWeekData.motherChanges.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                <p className="text-sm font-medium text-primary/80">
                  <span className="font-semibold text-primary">Coming Up: </span>
                  {currentWeekData.comingUp}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Weeks */}
          {upcomingWeeks.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-foreground/80 mb-3 flex items-center gap-1">
                <ChevronRight className="w-4 h-4 text-primary" />
                What to Expect Next
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="upcoming-weeks">
                {upcomingWeeks.map((week) => (
                  <Card key={week.week} className="shadow-sm border-border/50" data-testid={`card-week-${week.week}`}>
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-foreground">Week {week.week}</CardTitle>
                        <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                          {week.sizeComparison}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <ul className="space-y-1.5">
                        {week.development.slice(0, 2).map((item, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/70">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-primary/60 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
