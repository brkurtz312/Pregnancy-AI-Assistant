import { useState } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useListSymptoms, useCreateSymptom, useDeleteSymptom } from "@workspace/api-client-react";

const SYMPTOMS = [
  "Nausea", "Vomiting", "Headache", "Back pain", "Pelvic pressure",
  "Fatigue", "Swelling", "Heartburn", "Braxton Hicks", "Spotting",
  "Mood changes", "Other",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function SymptomLog() {
  const { data, isLoading, refetch } = useListSymptoms({ limit: 30, offset: 0 });
  const createMutation = useCreateSymptom();
  const deleteMutation = useDeleteSymptom();

  const [open, setOpen] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState("");
  const [customSymptom, setCustomSymptom] = useState("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    const symptom = selectedSymptom === "Other" ? customSymptom.trim() : selectedSymptom;
    if (!symptom) return;
    await createMutation.mutateAsync({
      data: { symptom, severity, notes: notes.trim() || null },
    });
    setOpen(false);
    setSelectedSymptom("");
    setCustomSymptom("");
    setSeverity(null);
    setNotes("");
    refetch();
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    refetch();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Symptom Log</h3>
          <p className="text-sm text-muted-foreground">Track how you're feeling day to day</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Log Symptom
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}

      {!isLoading && !data?.items.length && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No symptoms logged yet. Tap Log Symptom to get started.
        </p>
      )}

      <div className="space-y-2">
        {data?.items.map((item) => (
          <Card key={item.id} className="p-3 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.symptom}</span>
                {item.severity && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className={`w-2 h-2 rounded-full ${n <= (item.severity ?? 0) ? "bg-primary" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(item.loggedAt)}</p>
              {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(item.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a Symptom</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Symptom</p>
              <div className="flex flex-wrap gap-2">
                {SYMPTOMS.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setSelectedSymptom(sym)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedSymptom === sym
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {selectedSymptom === "Other" && (
              <div>
                <p className="text-sm font-medium mb-1">Describe</p>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={customSymptom}
                  onChange={(e) => setCustomSymptom(e.target.value)}
                  placeholder="e.g. Round ligament pain"
                />
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Severity (optional)</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSeverity(severity === n ? null : n)}
                    className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${
                      severity !== null && severity >= n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Notes (optional)</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                className="resize-none h-20 text-sm"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!selectedSymptom || createMutation.isPending}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
