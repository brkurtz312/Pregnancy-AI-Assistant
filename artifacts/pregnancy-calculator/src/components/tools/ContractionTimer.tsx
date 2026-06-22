import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useListContractions,
  useCreateContraction,
  useDeleteContraction,
} from "@workspace/api-client-react";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ContractionTimer() {
  const today = todayDate();
  const { data, isLoading, refetch } = useListContractions({ sessionDate: today, limit: 50 });
  const createMutation = useCreateContraction();
  const deleteMutation = useDeleteContraction();

  const [contracting, setContracting] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (contracting && startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [contracting, startTime]);

  const handleToggle = useCallback(async () => {
    if (!contracting) {
      const now = new Date();
      setStartTime(now);
      setContracting(true);
      setElapsed(0);
    } else {
      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - startTime!.getTime()) / 1000);
      const items = data?.items ?? [];
      const lastEnd = items[0]?.endedAt;
      const interval = lastEnd
        ? Math.round((startTime!.getTime() - new Date(lastEnd).getTime()) / 1000)
        : null;

      setContracting(false);
      setStartTime(null);
      setElapsed(0);

      await createMutation.mutateAsync({
        data: {
          startedAt: startTime!.toISOString(),
          endedAt: endTime.toISOString(),
          durationSeconds: duration,
          intervalSeconds: interval ?? undefined,
          sessionDate: today,
        },
      });
      refetch();
    }
  }, [contracting, startTime, data?.items, today]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    refetch();
  }, [deleteMutation, refetch]);

  const items = data?.items ?? [];
  const avgDuration = items.filter((c) => c.durationSeconds).length > 0
    ? Math.round(items.filter((c) => c.durationSeconds).reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / items.filter((c) => c.durationSeconds).length)
    : null;
  const avgInterval = items.filter((c) => c.intervalSeconds).length > 0
    ? Math.round(items.filter((c) => c.intervalSeconds).reduce((s, c) => s + (c.intervalSeconds ?? 0), 0) / items.filter((c) => c.intervalSeconds).length)
    : null;
  const rule511 = avgDuration !== null && avgInterval !== null && avgDuration >= 60 && avgInterval <= 300 && items.length >= 3;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Contraction Timer</h3>
        <p className="text-sm text-muted-foreground">Time and track contractions for today</p>
      </div>

      <div className={`flex flex-col items-center py-6 gap-4 border-2 rounded-2xl mb-4 transition-colors ${contracting ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
        {contracting && (
          <p className="text-sm text-muted-foreground">Contraction in progress</p>
        )}
        {contracting && (
          <span className="text-4xl font-bold text-destructive tabular-nums">
            {formatTime(elapsed)}
          </span>
        )}
        <button
          onClick={handleToggle}
          className={`w-36 h-36 rounded-full flex flex-col items-center justify-center text-white font-semibold text-base shadow-lg hover:opacity-90 active:scale-95 transition-all select-none ${contracting ? "bg-destructive" : "bg-primary"}`}
        >
          {contracting ? "Stop" : "Start\nContraction"}
        </button>
        {!contracting && items.length > 0 && items[0].intervalSeconds && (
          <p className="text-xs text-muted-foreground">
            Last interval: {formatTime(items[0].intervalSeconds)}
          </p>
        )}
      </div>

      {items.length >= 2 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Avg duration", value: avgDuration !== null ? formatTime(avgDuration) : "—" },
            { label: "Avg interval", value: avgInterval !== null ? formatTime(avgInterval) : "—" },
            { label: "Count today", value: String(items.length) },
          ].map((stat) => (
            <Card key={stat.label} className="p-3 text-center">
              <p className="text-xl font-bold text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>
      )}

      {rule511 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            5-1-1 pattern detected — contractions lasting ≥1 min, every ≤5 min, for ≥1 hour. Contact your provider.
          </p>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No contractions recorded today.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="p-3 flex items-center gap-3">
            <div className="flex-1">
              <span className="font-semibold text-sm">
                {item.durationSeconds ? formatTime(item.durationSeconds) : "—"}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {formatDate(item.startedAt)}
                {item.intervalSeconds ? ` · interval: ${formatTime(item.intervalSeconds)}` : ""}
              </span>
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
    </div>
  );
}
