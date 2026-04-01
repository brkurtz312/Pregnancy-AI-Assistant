import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { calculateByUltrasound, PregnancyResults } from "@/lib/pregnancy-math";

const formSchema = z.object({
  ultrasoundDate: z.string().min(1, "Ultrasound date is required"),
  weeks: z.coerce.number().min(0, "Weeks must be 0 or greater").max(45, "Weeks must be 45 or less"),
  days: z.coerce.number().min(0, "Days must be between 0 and 6").max(6, "Days must be between 0 and 6"),
});

type FormValues = z.infer<typeof formSchema>;

interface UltrasoundFormProps {
  onCalculate: (results: PregnancyResults | null) => void;
}

export function UltrasoundForm({ onCalculate }: UltrasoundFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ultrasoundDate: "",
      weeks: 0,
      days: 0,
    },
  });

  function onSubmit(values: FormValues) {
    const results = calculateByUltrasound(values.ultrasoundDate, values.weeks, values.days);
    onCalculate(results);
  }

  function handleReset() {
    form.reset();
    onCalculate(null);
  }

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="ultrasoundDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base text-foreground/80">Date of Ultrasound</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      className="h-12 text-lg bg-card border-border/50 focus-visible:ring-primary/30 rounded-xl" 
                      data-testid="input-ultrasound-date"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base text-foreground/80">Gestational Weeks</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        max="45"
                        className="h-12 text-lg bg-card border-border/50 focus-visible:ring-primary/30 rounded-xl" 
                        data-testid="input-ultrasound-weeks"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base text-foreground/80">Gestational Days</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        max="6"
                        className="h-12 text-lg bg-card border-border/50 focus-visible:ring-primary/30 rounded-xl" 
                        data-testid="input-ultrasound-days"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                type="submit" 
                size="lg" 
                className="flex-1 rounded-xl font-medium text-base shadow-sm"
                data-testid="button-calculate-ultrasound"
              >
                Calculate
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="lg" 
                onClick={handleReset}
                className="rounded-xl border-border/50 text-muted-foreground hover:bg-muted/50"
                data-testid="button-reset-ultrasound"
              >
                Reset
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
