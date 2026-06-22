import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useListKickSessions,
  useCreateKickSession,
  useUpdateKickSession,
  useDeleteKickSession,
} from "@workspace/api-client-react";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function KickCounter() {
  const { data, isLoading, refetch } = useListKickSessions({ limit: 10, offset: 0 });
  const createMutation = useCreateKickSession();
  const updateMutation = useUpdateKickSession();
  const deleteMutation = useDeleteKickSession();

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [kickCount, setKickCount] = useState(0);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sessionStart) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionStart]);

  const handleStart = useCallback(async () => {
    const now = new Date();
    const row = await createMutation.mutateAsync({
      data: { startedAt: now.toISOString(), kickCount: 0 },
    });
    setActiveSessionId(row.id);
    setKickCount(0);
    setSessionStart(now);
    setElapsed(0);
  }, []);

  const handleKick = useCallback(async () => {
    if (!activeSessionId) return;
    const next = kickCount + 1;
    setKickCount(next);
    await updateMutation.mutateAsync({ id: activeSessionId, data: { kickCount: next } });
  }, [activeSessionId, kickCount]);

  const handleEnd = useCallback(async () => {
    if (!activeSessionId) return;
    await updateMutation.mutateAsync({
      id: activeSessionId,
      data: { kickCount, endedAt: new Date().toISOString() },
    });
    setActiveSessionId(null);
    setSessionStart(null);
    setKickCount(0);
    setElapsed(0);
    refetch();
  }, [activeSessionId, kickCount]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    refetch();
  }, [deleteMutation, refetch]);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Kick Counter</h3>
        <p className="text-sm text-muted-foreground">Count baby's movements in a session</p>
      </div>

      {activeSessionId ? (
        <div className="flex flex-col items-center py-6 gap-4 border rounded-2xl mb-6">
          <p className="text-sm text-muted-foreground">Session time: {formatTime(elapsed)}</p>
          <button
            onClick={handleKick}
            className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex flex-col items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-transform select-none"
          >
            <span className="text-5xl font-bold leading-none">{kickCount}</span>
            <span className="text-xs mt-1 opacity-80">tap to count</span>
          </button>
          <Button variant="outline" onClick={handleEnd}>
            End Session
          </Button>
        </div>
      ) : (
        <Button className="w-full mb-6" onClick={handleStart} disabled={createMutation.isPending}>
          Start Counting
        </Button>
      )}

      {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}

      {!isLoading && !data?.items.length && !activeSessionId && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No sessions yet. Start counting to begin.
        </p>
      )}

      <div className="space-y-2">
        {data?.items.map((item) => {
          const dur = item.endedAt
            ? Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)
            : null;
          return (
            <Card key={item.id} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <span className="text-2xl font-bold text-primary">{item.kickCount}</span>
                <span className="text-sm text-muted-foreground ml-1.5">kicks</span>
                <p className="text-xs text-muted-foreground">
                  {formatDate(item.startedAt)}{dur !== null ? ` · ${dur} min` : ""}
                </p>
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
          );
        })}
      </div>
    </div>
  );
}
