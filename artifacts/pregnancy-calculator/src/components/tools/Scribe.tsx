import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser, useAuth } from "@clerk/react";
import { usePass } from "@/hooks/use-pass";
import {
  Mic,
  MicOff,
  FileText,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Stethoscope,
  Crown,
} from "lucide-react";

type Status =
  | "idle"
  | "recording"
  | "stopped"
  | "generating"
  | "done"
  | "error";

interface PatientSummary {
  headline: string;
  whatWasDiscussed: string;
  nextSteps: string[];
  rememberTo: string;
}

const SAVED_NOTES_KEY = "pregnancy_scribe_notes_v1";

interface SavedNote {
  id: string;
  createdAt: string;
  transcript: string;
  summary: PatientSummary;
}

function loadSavedNotes(): SavedNote[] {
  try {
    const raw = localStorage.getItem(SAVED_NOTES_KEY);
    return raw ? (JSON.parse(raw) as SavedNote[]) : [];
  } catch {
    return [];
  }
}

function saveNote(note: SavedNote): void {
  const notes = [note, ...loadSavedNotes()].slice(0, 20);
  localStorage.setItem(SAVED_NOTES_KEY, JSON.stringify(notes));
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface ISpeechRecognitionErrorEvent {
  error: string;
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition;

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ||
    w["webkitSpeechRecognition"] ||
    null) as SpeechRecognitionConstructor | null;
};

export function Scribe() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const { startCheckout, isStartingCheckout, hasPass } = usePass();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLimitError, setIsLimitError] = useState(false);

  const [copied, setCopied] = useState(false);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [viewNote, setViewNote] = useState<SavedNote | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const isSpeechSupported = !!getSpeechRecognition();

  useEffect(() => {
    setSavedNotes(loadSavedNotes());
  }, []);

  useEffect(() => {
    if (hasPass && isLimitError) {
      setIsLimitError(false);
      setErrorMsg("");
      setStatus("stopped");
    }
  }, [hasPass, isLimitError]);

  const startRecording = () => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    finalTranscriptRef.current = "";
    setTranscript("");
    setSummary(null);
    setErrorMsg("");

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        setErrorMsg("Microphone error: " + event.error + ". Please try again.");
        setStatus("error");
      }
    };

    recognition.onend = () => {
      if (status !== "stopped") {
        setTranscript(finalTranscriptRef.current.trim());
        setStatus("stopped");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setStatus("recording");
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setTranscript(finalTranscriptRef.current.trim());
    setStatus("stopped");
  };

  const generateSummary = async () => {
    if (!transcript.trim() || transcript.trim().length < 20) {
      setErrorMsg("The transcript is too short. Please record more.");
      return;
    }

    setStatus("generating");
    setErrorMsg("");
    setIsLimitError(false);

    try {
      const token = await getToken();
      const res = await fetch("/api/scribe/generate-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ transcript, mode: "summary" }),
      });

      const data = (await res.json()) as {
        note?: PatientSummary;
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        if (data.code === "SCRIBE_LIMIT_REACHED" && !hasPass) {
          setIsLimitError(true);
          setErrorMsg(
            "You've used your free scribe session. Upgrade to the Full Pregnancy Pass for unlimited sessions.",
          );
        } else {
          setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        }
        setStatus("error");
        return;
      }

      const note = data.note;
      if (!note) {
        setErrorMsg("Unexpected response from server.");
        setStatus("error");
        return;
      }

      setSummary(note);
      setStatus("done");

      const saved: SavedNote = {
        id: `note-${Date.now()}`,
        createdAt: new Date().toISOString(),
        transcript,
        summary: note,
      };
      saveNote(saved);
      setSavedNotes(loadSavedNotes());
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  };

  const copyNote = async () => {
    if (!summary) return;
    const text = [
      summary.headline,
      "",
      "What was discussed:",
      summary.whatWasDiscussed,
      "",
      "Next steps:",
      ...(summary.nextSteps ?? []).map((s) => `• ${s}`),
      "",
      "Remember to:",
      summary.rememberTo,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setStatus("idle");
    setTranscript("");
    setSummary(null);
    setErrorMsg("");
    setIsLimitError(false);
    finalTranscriptRef.current = "";
  };

  if (!isSignedIn) {
    return (
      <Card className="p-8 rounded-2xl border-border/50 text-center space-y-3">
        <div className="text-4xl mb-2">🔒</div>
        <h3 className="font-serif font-semibold text-lg">
          Sign in to use Scribe
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          The Visit Notes Scribe records your prenatal appointments and
          generates a plain-language summary just for you. Sign in to get
          started.
        </p>
      </Card>
    );
  }

  if (!isSpeechSupported) {
    return (
      <Card className="p-8 rounded-2xl border-border/50 text-center space-y-3">
        <div className="text-4xl mb-2">🎙️</div>
        <h3 className="font-serif font-semibold text-lg">
          Browser not supported
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          The Scribe uses your browser's built-in speech recognition, which
          requires Google Chrome or Microsoft Edge. Please open this page in
          Chrome to use this feature.
        </p>
      </Card>
    );
  }

  if (viewNote) {
    return (
      <SummaryView
        summary={viewNote.summary}
        transcript={viewNote.transcript}
        date={viewNote.createdAt}
        onBack={() => setViewNote(null)}
        onCopy={async () => {
          const text = [
            viewNote.summary.headline,
            "",
            "What was discussed:",
            viewNote.summary.whatWasDiscussed,
            "",
            "Next steps:",
            ...(viewNote.summary.nextSteps ?? []).map((s) => `• ${s}`),
            "",
            "Remember to:",
            viewNote.summary.rememberTo,
          ].join("\n");
          await navigator.clipboard.writeText(text);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-xl">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold font-serif text-foreground">
            Visit Notes Scribe
          </h2>
          <p className="text-xs text-muted-foreground">
            Record your appointment · get a personal summary
          </p>
        </div>
      </div>

      <Card className="p-5 rounded-2xl border-border/50 bg-amber-50/50 border-amber-200/60">
        <p className="text-xs text-amber-800">
          <strong>Before you start:</strong> Let your provider know you'd like
          to record for your personal notes. Bring headphones if your
          appointment is in a noisy area.
        </p>
      </Card>

      {(status === "idle" ||
        status === "recording" ||
        status === "stopped" ||
        status === "error") && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-4">
            {status !== "recording" ? (
              <button
                onClick={startRecording}
                className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
              >
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg animate-pulse hover:bg-red-600 transition-colors"
              >
                <MicOff className="w-8 h-8" />
              </button>
            )}
            <p className="text-sm text-muted-foreground text-center">
              {status === "idle" &&
                "Tap the mic to start recording your appointment"}
              {status === "recording" && (
                <span className="text-red-500 font-medium">
                  Recording… tap to stop
                </span>
              )}
              {status === "stopped" &&
                "Recording stopped — review your transcript below"}
              {status === "error" && "Recording stopped"}
            </p>
          </div>

          {transcript && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Transcript
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="w-full min-h-[140px] p-3 text-sm border border-border/50 rounded-xl resize-none bg-background leading-relaxed"
                placeholder="Your transcript will appear here…"
              />
              <p className="text-xs text-muted-foreground">
                You can edit the transcript before generating your summary.
              </p>
            </div>
          )}

          {errorMsg && (
            <Card className="p-3 rounded-xl border-red-200 bg-red-50/50">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-xs text-red-700">{errorMsg}</p>
                  {isLimitError && !hasPass && (
                    <Button
                      size="sm"
                      onClick={startCheckout}
                      disabled={isStartingCheckout}
                      className="gap-1.5 rounded-xl text-xs bg-primary hover:bg-primary/90"
                      data-testid="upgrade-to-pass-cta"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      {isStartingCheckout ? "Opening…" : "Upgrade to Full Pass"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {status === "stopped" && transcript.trim().length > 20 && (
            <Button
              onClick={generateSummary}
              className="w-full rounded-2xl bg-primary hover:bg-primary/90 gap-2"
            >
              <FileText className="w-4 h-4" />
              Generate My Visit Summary
            </Button>
          )}
        </div>
      )}

      {status === "generating" && (
        <Card className="p-8 rounded-2xl border-border/50 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">
            Creating your personal visit summary…
          </p>
        </Card>
      )}

      {status === "done" && summary && (
        <div className="space-y-4">
          <SummaryView
            summary={summary}
            transcript={transcript}
            onBack={resetForm}
            onCopy={copyNote}
            backLabel="New Recording"
          />
          {copied && (
            <p className="text-xs text-center text-green-600 font-medium">
              ✓ Copied to clipboard
            </p>
          )}
        </div>
      )}

      {savedNotes.length > 0 && status !== "done" && (
        <div className="space-y-3 pt-2 border-t border-border/40">
          <h3 className="text-sm font-medium text-muted-foreground">
            Previous Notes
          </h3>
          {savedNotes.slice(0, 5).map((note) => (
            <Card
              key={note.id}
              onClick={() => setViewNote(note)}
              className="p-3 rounded-xl border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="text-xs text-muted-foreground mb-1">
                {formatShortDate(note.createdAt)}
              </div>
              <p className="text-sm line-clamp-2 text-foreground">
                {note.summary.headline}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface SummaryViewProps {
  summary: PatientSummary;
  transcript: string;
  date?: string;
  onBack: () => void;
  backLabel?: string;
  onCopy: () => Promise<void>;
}

function SummaryView({
  summary,
  date,
  onBack,
  backLabel = "Back",
  onCopy,
}: SummaryViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {date && (
        <p className="text-xs text-muted-foreground">{formatShortDate(date)}</p>
      )}

      <Card className="p-5 rounded-2xl border-primary/20 bg-primary/5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground leading-snug">
            {summary.headline}
          </p>
        </div>

        {summary.whatWasDiscussed && (
          <div>
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
              What Was Discussed
            </h4>
            <p className="text-sm text-foreground leading-relaxed">
              {summary.whatWasDiscussed}
            </p>
          </div>
        )}

        {summary.nextSteps && summary.nextSteps.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
              Next Steps
            </h4>
            <ul className="space-y-1.5">
              {summary.nextSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <span className="text-primary shrink-0 mt-0.5">→</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.rememberTo && (
          <div className="pt-2 border-t border-primary/10">
            <p className="text-xs text-primary/80 italic">
              {summary.rememberTo}
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={handleCopy}
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl text-xs"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="rounded-xl text-xs"
        >
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
