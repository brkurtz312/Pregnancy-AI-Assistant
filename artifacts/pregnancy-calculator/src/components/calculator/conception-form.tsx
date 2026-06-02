import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { calculateByConceptionDate, PregnancyResults } from "@/lib/pregnancy-math";

const formSchema = z.object({
  conceptionDate: z.string().min(1, "Conception date is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface ConceptionFormProps {
  onCalculate: (results: PregnancyResults | null) => void;
}

export function ConceptionForm({ onCalculate }: ConceptionFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      conceptionDate: "",
    },
  });

  function onSubmit(values: FormValues) {
    const results = calculateByConceptionDate(values.conceptionDate);
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
              name="conceptionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base text-foreground/80">Date of Conception</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      className="h-12 text-lg bg-card border-border/50 focus-visible:ring-primary/30 rounded-xl" 
                      data-testid="input-conception-date"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                type="submit" 
                size="lg" 
                className="flex-1 rounded-xl font-medium text-base shadow-sm"
                data-testid="button-calculate-conception"
              >
                Calculate
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="lg" 
                onClick={handleReset}
                className="rounded-xl border-border/50 text-muted-foreground hover:bg-muted/50"
                data-testid="button-reset-conception"
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
