import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Plus,
  Printer,
  Trash2,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import {
  loadJournalEntries,
  saveJournalEntries,
  getJournalAgeLabel,
  buildJournalHtml,
  MOOD_OPTIONS,
  type JournalEntry,
  type JournalMood,
} from "@/lib/web-journal";
import {
  apiLoadJournalEntries,
  apiUpsertJournalEntry,
  apiDeleteJournalEntry,
} from "@/lib/sync-api";
import { printHtml } from "@/lib/print-html";
import { useAuth, useUser } from "@clerk/react";

type View = "list" | "new" | "edit";

interface DraftState {
  text: string;
  mood: JournalMood | undefined;
  gestationalWeeks: string;
  gestationalDays: string;
  isPostpartum: boolean;
  postpartumDays: string;
}

const emptyDraft = (): DraftState => ({
  text: "",
  mood: undefined,
  gestationalWeeks: "",
  gestationalDays: "",
  isPostpartum: false,
  postpartumDays: "",
});

function entryFromDraft(draft: DraftState, id?: string): JournalEntry {
  const now = new Date().toISOString();
  const gw = parseInt(draft.gestationalWeeks, 10);
  const gd = parseInt(draft.gestationalDays, 10);
  const pp = parseInt(draft.postpartumDays, 10);
  return {
    id: id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
    text: draft.text.trim(),
    mood: draft.mood,
    gestationalWeeks:
      !draft.isPostpartum && !isNaN(gw) && gw >= 0 ? gw : undefined,
    gestationalDays:
      !draft.isPostpartum && !isNaN(gd) && gd >= 0 ? gd : undefined,
    postpartumDays:
      draft.isPostpartum && !isNaN(pp) && pp >= 0 ? pp : undefined,
  };
}

function draftFromEntry(entry: JournalEntry): DraftState {
  return {
    text: entry.text,
    mood: entry.mood,
    gestationalWeeks:
      entry.gestationalWeeks !== undefined
        ? String(entry.gestationalWeeks)
        : "",
    gestationalDays:
      entry.gestationalDays !== undefined ? String(entry.gestationalDays) : "",
    isPostpartum: entry.postpartumDays !== undefined,
    postpartumDays:
      entry.postpartumDays !== undefined ? String(entry.postpartumDays) : "",
  };
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Journal() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  // Keyed to userId so migration re-runs if a different account signs in.
  const migratedForUserRef = useRef<string | null>(null);

  const isAuthed = !!isSignedIn;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isAuthed && userId) {
      apiLoadJournalEntries(getToken)
        .then((serverEntries) => {
          if (migratedForUserRef.current !== userId) {
            migratedForUserRef.current = userId;
            const localEntries = loadJournalEntries();
            if (serverEntries.length === 0 && localEntries.length > 0) {
              Promise.all(
                localEntries.map((e) => apiUpsertJournalEntry(e, getToken)),
              )
                .then(() => apiLoadJournalEntries(getToken))
                .then((migrated) => {
                  setEntries(migrated);
                  saveJournalEntries([]);
                })
                .catch(() => setEntries(localEntries));
            } else {
              setEntries(serverEntries);
            }
          } else {
            setEntries(serverEntries);
          }
        })
        .catch(() => {
          setEntries(loadJournalEntries());
        });
    } else {
      setEntries(loadJournalEntries());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, userId]);

  const refreshEntries = () => {
    if (isAuthed) {
      apiLoadJournalEntries(getToken)
        .then(setEntries)
        .catch(() => setEntries(loadJournalEntries()));
    } else {
      setEntries(loadJournalEntries());
    }
  };

  const openNew = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setView("new");
  };

  const openEdit = (entry: JournalEntry) => {
    setDraft(draftFromEntry(entry));
    setEditingId(entry.id);
    setView("edit");
  };

  const handleSave = async () => {
    if (!draft.text.trim() && !draft.mood) return;
    const entry = entryFromDraft(draft, editingId ?? undefined);
    if (editingId) {
      const existing = entries.find((e) => e.id === editingId);
      if (existing) entry.createdAt = existing.createdAt;
    }

    if (isAuthed) {
      try {
        await apiUpsertJournalEntry(entry, getToken);
        refreshEntries();
      } catch {
        refreshEntries();
      }
    } else {
      const all = loadJournalEntries();
      const idx = all.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        all[idx] = entry;
      } else {
        all.unshift(entry);
      }
      saveJournalEntries(all);
      setEntries(loadJournalEntries());
    }
    setView("list");
  };

  const handleDelete = async (id: string) => {
    if (isAuthed) {
      try {
        await apiDeleteJournalEntry(id, getToken);
      } catch {
        // best effort
      }
      refreshEntries();
    } else {
      const updated = loadJournalEntries().filter((e) => e.id !== id);
      saveJournalEntries(updated);
      setEntries(updated);
    }
    if (editingId === id) setView("list");
  };

  const handleExport = () => {
    printHtml(buildJournalHtml(entries));
  };

  if (view === "new" || view === "edit") {
    return (
      <EntryForm
        draft={draft}
        setDraft={setDraft}
        onSave={handleSave}
        onCancel={() => setView("list")}
        onDelete={editingId ? () => handleDelete(editingId) : undefined}
        isEdit={view === "edit"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold font-serif text-foreground">
              My Journal
            </h2>
            <p className="text-xs text-muted-foreground">
              {entries.length === 0
                ? "A private space to reflect on your journey"
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-1.5 rounded-xl text-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Export PDF
            </Button>
          )}
          <Button
            size="sm"
            onClick={openNew}
            className="gap-1.5 rounded-xl text-xs bg-primary hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" /> New Entry
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="text-5xl mb-4">📖</div>
          <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
            Start your story
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Capture how you're feeling, what you're thinking, and moments you
            don't want to forget.
          </p>
          <Button
            onClick={openNew}
            className="rounded-2xl bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" /> Write your first entry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const moodOpt = entry.mood
              ? MOOD_OPTIONS.find((m) => m.value === entry.mood)
              : null;
            const ageLabel = getJournalAgeLabel(entry);
            return (
              <Card
                key={entry.id}
                onClick={() => openEdit(entry)}
                className="p-4 cursor-pointer hover:bg-muted/30 transition-colors border-border/50 rounded-2xl group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatShortDate(entry.createdAt)}
                      </span>
                      {ageLabel && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {ageLabel}
                        </span>
                      )}
                      {moodOpt && (
                        <span className="text-xs text-muted-foreground">
                          {moodOpt.emoji} {moodOpt.label}
                        </span>
                      )}
                    </div>
                    {entry.text && (
                      <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                        {entry.text}
                      </p>
                    )}
                    {!entry.text && moodOpt && (
                      <p className="text-sm text-muted-foreground italic">
                        Feeling {moodOpt.label.toLowerCase()} today
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EntryFormProps {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isEdit: boolean;
}

function EntryForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  isEdit,
}: EntryFormProps) {
  const canSave = draft.text.trim().length > 0 || draft.mood !== undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <h2 className="text-lg font-semibold font-serif">
          {isEdit ? "Edit Entry" : "New Entry"}
        </h2>
      </div>

      <Card className="p-5 rounded-2xl border-border/50 space-y-5">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 block">
            How are you feeling?
          </label>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  setDraft({
                    ...draft,
                    mood: draft.mood === opt.value ? undefined : opt.value,
                  })
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${
                  draft.mood === opt.value
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted hover:bg-muted/80 text-foreground"
                }`}
              >
                <span>{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
            What's on your mind?
          </label>
          <Textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="Write freely — this is your private space…"
            className="min-h-[160px] resize-none rounded-xl border-border/50 text-sm leading-relaxed"
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Gestational age (optional)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={draft.isPostpartum}
                onChange={(e) =>
                  setDraft({ ...draft, isPostpartum: e.target.checked })
                }
                className="rounded"
              />
              Postpartum
            </label>
          </div>
          {draft.isPostpartum ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="365"
                value={draft.postpartumDays}
                onChange={(e) =>
                  setDraft({ ...draft, postpartumDays: e.target.value })
                }
                placeholder="0"
                className="w-24 rounded-xl border-border/50 text-sm"
              />
              <span className="text-sm text-muted-foreground">
                days postpartum
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="42"
                value={draft.gestationalWeeks}
                onChange={(e) =>
                  setDraft({ ...draft, gestationalWeeks: e.target.value })
                }
                placeholder="32"
                className="w-20 rounded-xl border-border/50 text-sm"
              />
              <span className="text-sm text-muted-foreground">weeks</span>
              <Input
                type="number"
                min="0"
                max="6"
                value={draft.gestationalDays}
                onChange={(e) =>
                  setDraft({ ...draft, gestationalDays: e.target.value })
                }
                placeholder="0"
                className="w-16 rounded-xl border-border/50 text-sm"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={onSave}
          disabled={!canSave}
          className="flex-1 rounded-2xl bg-primary hover:bg-primary/90"
        >
          {isEdit ? "Save Changes" : "Save Entry"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="rounded-2xl">
          Cancel
        </Button>
        {onDelete && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (confirm("Delete this entry?")) onDelete();
            }}
            className="rounded-2xl text-destructive hover:text-destructive border-destructive/30"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
