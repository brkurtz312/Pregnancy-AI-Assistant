import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, RotateCcw, Plus, Luggage } from "lucide-react";
import {
  loadHospitalBag,
  saveHospitalBag,
  makeDefaultHospitalBag,
  countHospitalBagItems,
  buildHospitalBagHtml,
  type HospitalBagCategory,
} from "@/lib/web-hospital-bag";
import { apiLoadHospitalBag, apiSaveHospitalBag } from "@/lib/sync-api";
import {
  isHospitalBagPending,
  markHospitalBagPending,
  clearHospitalBagPending,
} from "@/lib/sync-queue";
import { printHtml } from "@/lib/print-html";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "@/hooks/use-toast";

export function HospitalBag() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [categories, setCategories] = useState<HospitalBagCategory[]>([]);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  // Track which userId has already been migrated this session to avoid
  // re-running migration if auth state changes without a page reload.
  const migratedForUserRef = useRef<string | null>(null);
  // Debounce sync-error toasts so rapid checkbox toggling doesn't spam.
  const syncErrorToastedRef = useRef(false);

  const isAuthed = !!isSignedIn;
  const userId = user?.id ?? null;

  /** Push any locally-pending bag data to the server and clear the flag. */
  const flushPending = useCallback(
    async (current: HospitalBagCategory[]) => {
      if (!isAuthed || !isHospitalBagPending()) return;
      try {
        await apiSaveHospitalBag(current, getToken);
        clearHospitalBagPending();
        syncErrorToastedRef.current = false;
      } catch {
        // Still offline — leave the pending flag in place.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthed],
  );

  useEffect(() => {
    if (isAuthed && userId) {
      apiLoadHospitalBag(getToken)
        .then((serverCategories) => {
          if (migratedForUserRef.current !== userId) {
            migratedForUserRef.current = userId;
            if (serverCategories === null) {
              // No server data yet — migrate from localStorage.
              const local = loadHospitalBag();
              apiSaveHospitalBag(local, getToken).catch(() => {});
              setCategories(local);
            } else {
              // Flush pending local changes first, then show server state.
              if (isHospitalBagPending()) {
                // Use local storage payload — it contains the unsynced edits.
                flushPending(loadHospitalBag()).then(() => {
                  // After flush, reload from server to show canonical state.
                  apiLoadHospitalBag(getToken)
                    .then((fresh) =>
                      setCategories(fresh ?? makeDefaultHospitalBag()),
                    )
                    .catch(() => setCategories(loadHospitalBag()));
                });
              } else {
                setCategories(serverCategories);
              }
            }
          } else {
            const cats = serverCategories ?? makeDefaultHospitalBag();
            if (isHospitalBagPending()) {
              setCategories(loadHospitalBag());
              flushPending(loadHospitalBag()).then(() => {
                apiLoadHospitalBag(getToken)
                  .then((fresh) =>
                    setCategories(fresh ?? makeDefaultHospitalBag()),
                  )
                  .catch(() => setCategories(loadHospitalBag()));
              });
            } else {
              setCategories(cats);
            }
          }
        })
        .catch(() => {
          setCategories(loadHospitalBag());
        });
    } else {
      setCategories(loadHospitalBag());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, userId]);

  // Retry pending sync whenever the browser comes back online.
  useEffect(() => {
    const handleOnline = () => {
      if (isAuthed && isHospitalBagPending()) {
        flushPending(loadHospitalBag());
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isAuthed, flushPending]);

  const persist = (updated: HospitalBagCategory[]) => {
    setCategories(updated);
    if (isAuthed) {
      // Always write to localStorage as a local fallback.
      saveHospitalBag(updated);
      apiSaveHospitalBag(updated, getToken)
        .then(() => {
          clearHospitalBagPending();
          syncErrorToastedRef.current = false;
        })
        .catch(() => {
          markHospitalBagPending();
          if (!syncErrorToastedRef.current) {
            syncErrorToastedRef.current = true;
            toast({
              title: "Couldn't save to server",
              description:
                "Your changes are saved locally and will sync automatically when you're back online.",
              variant: "destructive",
              duration: 5000,
            });
          }
        });
    } else {
      saveHospitalBag(updated);
    }
  };

  const toggleItem = (catId: string, itemId: string) => {
    persist(
      categories.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.id === itemId ? { ...item, checked: !item.checked } : item,
              ),
            },
      ),
    );
  };

  const addCustomItem = (catId: string) => {
    const label = (customInputs[catId] ?? "").trim();
    if (!label) return;
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const id = `${catId}-custom-${Date.now()}`;
    persist(
      categories.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              items: [...c.items, { id, label, checked: false, custom: true }],
            },
      ),
    );
    setCustomInputs({ ...customInputs, [catId]: "" });
  };

  const removeCustomItem = (catId: string, itemId: string) => {
    persist(
      categories.map((c) =>
        c.id !== catId
          ? c
          : { ...c, items: c.items.filter((i) => i.id !== itemId) },
      ),
    );
  };

  const handleReset = () => {
    if (
      confirm(
        "Reset the checklist? Your checked items and custom additions will be cleared.",
      )
    ) {
      // Always produce a clean default (no localStorage/server state).
      const fresh = makeDefaultHospitalBag();
      persist(fresh);
    }
  };

  const { checked, total } = countHospitalBagItems(categories);
  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Luggage className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold font-serif text-foreground">
              Hospital Bag
            </h2>
            <p className="text-xs text-muted-foreground">
              Pack around 36 weeks so you're ready anytime
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printHtml(buildHospitalBagHtml(categories))}
            className="gap-1.5 rounded-xl text-xs"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 rounded-xl text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
        </div>
      </div>

      <Card className="p-4 rounded-2xl border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {checked} of {total} packed
          </span>
          <span className="text-xs text-muted-foreground">{percent}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        {percent === 100 && (
          <p className="text-xs text-primary mt-2 text-center font-medium">
            🎉 You're all packed and ready!
          </p>
        )}
      </Card>

      <div className="space-y-4">
        {categories.map((cat) => (
          <Card
            key={cat.id}
            className="p-4 rounded-2xl border-border/50 space-y-3"
          >
            <h3 className="font-semibold text-sm text-foreground">
              {cat.title}
            </h3>

            <div className="space-y-2">
              {cat.items.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleItem(cat.id, item.id)}
                      className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}
                    >
                      {item.label}
                    </span>
                    {item.note && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.note}
                      </p>
                    )}
                  </div>
                  {item.custom && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        removeCustomItem(cat.id, item.id);
                      }}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-2 pt-1 border-t border-border/40">
              <Input
                value={customInputs[cat.id] ?? ""}
                onChange={(e) =>
                  setCustomInputs({ ...customInputs, [cat.id]: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomItem(cat.id);
                }}
                placeholder="Add a custom item…"
                className="h-8 text-xs rounded-xl border-border/50 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addCustomItem(cat.id)}
                className="h-8 w-8 p-0 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
