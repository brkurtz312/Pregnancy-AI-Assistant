import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Printer } from "lucide-react";
import {
  BIRTH_PLAN_SECTIONS,
  loadBirthPlanAnswers,
  saveBirthPlanAnswers,
  buildBirthPlanHtml,
  type BirthPlanAnswers,
  type BirthPlanField,
  type BirthPlanValue,
} from "@/lib/web-birth-plan";
import {
  apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";
import {
  isBirthPlanPending,
  markBirthPlanPending,
  clearBirthPlanPending,
} from "@/lib/sync-queue";
import { printHtml } from "@/lib/print-html";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "@/hooks/use-toast";

export function BirthPlan() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [answers, setAnswers] = useState<BirthPlanAnswers>({});
  // Keyed to userId so migration re-runs if a different account signs in.
  const migratedForUserRef = useRef<string | null>(null);
  // Debounce sync-error toasts so rapid field edits don't spam.
  const syncErrorToastedRef = useRef(false);

  const isAuthed = !!isSignedIn;
  const userId = user?.id ?? null;

  /** Push locally-pending birth plan answers to the server and clear the flag. */
  const flushPending = useCallback(
    async (current: BirthPlanAnswers) => {
      if (!isAuthed || !isBirthPlanPending()) return;
      try {
        await apiSaveBirthPlanAnswers(current, getToken);
        clearBirthPlanPending();
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
      apiLoadBirthPlanAnswers(getToken)
        .then((serverAnswers) => {
          if (migratedForUserRef.current !== userId) {
            migratedForUserRef.current = userId;
            if (serverAnswers === null) {
              const local = loadBirthPlanAnswers();
              if (Object.keys(local).length > 0) {
                apiSaveBirthPlanAnswers(local, getToken).catch(() => {});
                setAnswers(local);
              } else {
                setAnswers({});
              }
            } else {
              if (isBirthPlanPending()) {
                // Use local storage payload — it contains the unsynced edits.
                const localAnswers = loadBirthPlanAnswers();
                setAnswers(localAnswers);
                flushPending(localAnswers).then(() => {
                  // After flush, reload from server to show canonical state.
                  apiLoadBirthPlanAnswers(getToken)
                    .then((fresh) =>
                      setAnswers((fresh as BirthPlanAnswers) ?? {}),
                    )
                    .catch(() => setAnswers(loadBirthPlanAnswers()));
                });
              } else {
                setAnswers(serverAnswers as BirthPlanAnswers);
              }
            }
          } else {
            if (isBirthPlanPending()) {
              const localAnswers = loadBirthPlanAnswers();
              setAnswers(localAnswers);
              flushPending(localAnswers).then(() => {
                apiLoadBirthPlanAnswers(getToken)
                  .then((fresh) =>
                    setAnswers((fresh as BirthPlanAnswers) ?? {}),
                  )
                  .catch(() => setAnswers(loadBirthPlanAnswers()));
              });
            } else {
              setAnswers((serverAnswers as BirthPlanAnswers) ?? {});
            }
          }
        })
        .catch(() => {
          setAnswers(loadBirthPlanAnswers());
        });
    } else {
      setAnswers(loadBirthPlanAnswers());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, userId]);

  // Retry pending sync whenever the browser comes back online.
  useEffect(() => {
    const handleOnline = () => {
      if (isAuthed && isBirthPlanPending()) {
        flushPending(loadBirthPlanAnswers());
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isAuthed, flushPending]);

  const setField = (id: string, value: BirthPlanValue) => {
    const updated = { ...answers, [id]: value };
    setAnswers(updated);
    if (isAuthed) {
      // Always write to localStorage as a local fallback.
      saveBirthPlanAnswers(updated);
      apiSaveBirthPlanAnswers(updated, getToken)
        .then(() => {
          clearBirthPlanPending();
          syncErrorToastedRef.current = false;
        })
        .catch(() => {
          markBirthPlanPending();
          if (!syncErrorToastedRef.current) {
            syncErrorToastedRef.current = true;
            toast({
              title: "Couldn't save to server",
              description:
                "Your answers are saved locally and will sync automatically when you're back online.",
              variant: "destructive",
              duration: 5000,
            });
          }
        });
    } else {
      saveBirthPlanAnswers(updated);
    }
  };

  const countAnswered = () => {
    let answered = 0;
    let total = 0;
    for (const section of BIRTH_PLAN_SECTIONS) {
      for (const field of section.fields) {
        total++;
        const v = answers[field.id];
        if (
          v !== undefined &&
          v !== "" &&
          !(Array.isArray(v) && v.length === 0)
        )
          answered++;
      }
    }
    return { answered, total };
  };

  const { answered, total } = countAnswered();
  const percent = Math.round((answered / total) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold font-serif text-foreground">
              Birth Plan
            </h2>
            <p className="text-xs text-muted-foreground">
              Based on the ACOG sample birth plan
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => printHtml(buildBirthPlanHtml(answers))}
          className="gap-1.5 rounded-xl text-xs bg-primary hover:bg-primary/90"
        >
          <Printer className="w-3.5 h-3.5" /> Print PDF
        </Button>
      </div>

      <Card className="p-4 rounded-2xl border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {answered} of {total} answered
          </span>
          <span className="text-xs text-muted-foreground">{percent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Your answers save automatically. Review this plan with your ob-gyn
          well before your due date.
        </p>
      </Card>

      <div className="space-y-6">
        {BIRTH_PLAN_SECTIONS.map((section) => (
          <Card
            key={section.id}
            className="p-5 rounded-2xl border-border/50 space-y-4"
          >
            <div>
              <h3 className="font-semibold font-serif text-lg text-foreground">
                {section.title}
              </h3>
              {section.intro && (
                <p className="text-xs text-muted-foreground mt-1">
                  {section.intro}
                </p>
              )}
            </div>

            <div className="space-y-5">
              {section.fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={answers[field.id]}
                  onChange={(v) => setField(field.id, v)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 rounded-2xl border-border/50 bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          This birth plan is for personal use. Unexpected things can happen
          during labor and delivery — your safest possible birth is the shared
          goal. Always discuss preferences with your care team.
        </p>
      </Card>
    </div>
  );
}

interface FieldProps {
  field: BirthPlanField;
  value: BirthPlanValue;
  onChange: (v: BirthPlanValue) => void;
}

function FieldRenderer({ field, value, onChange }: FieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-foreground leading-snug block">
        {field.label}
      </label>
      {field.helper && (
        <p className="text-xs text-muted-foreground">{field.helper}</p>
      )}

      {field.type === "text" && (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className="rounded-xl border-border/50 text-sm"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className="rounded-xl border-border/50 text-sm resize-none min-h-[80px]"
        />
      )}

      {field.type === "boolean" && (
        <div className="flex gap-2">
          {(["Yes", "No"] as const).map((label) => {
            const isActive =
              (label === "Yes" && value === true) ||
              (label === "No" && value === false);
            return (
              <button
                key={label}
                onClick={() => onChange(label === "Yes" ? true : false)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                  isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-background border-border/50 text-muted-foreground hover:border-primary/50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "single" && field.options && (
        <div className="flex flex-col gap-2">
          {field.options.map((opt) => {
            const isActive = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`text-left px-4 py-2.5 rounded-xl text-sm transition-all border ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/40 font-medium"
                    : "bg-background border-border/50 text-foreground hover:border-primary/30"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "multi" && field.options && (
        <div className="flex flex-col gap-2">
          {field.options.map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    selected
                      ? current.filter((v) => v !== opt.value)
                      : [...current, opt.value],
                  );
                }}
                className={`text-left px-4 py-2.5 rounded-xl text-sm transition-all border ${
                  selected
                    ? "bg-primary/10 text-primary border-primary/40 font-medium"
                    : "bg-background border-border/50 text-foreground hover:border-primary/30"
                }`}
              >
                <span
                  className={`mr-2 text-xs ${selected ? "text-primary" : "text-muted-foreground"}`}
                >
                  {selected ? "☑" : "☐"}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
