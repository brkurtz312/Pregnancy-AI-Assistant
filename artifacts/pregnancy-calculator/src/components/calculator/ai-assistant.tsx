import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useAskAssistant,
  useGetWeeklyInsight,
  ApiError,
} from "@workspace/api-client-react";
import { Show } from "@clerk/react";
import { Link } from "wouter";
import { usePass } from "@/hooks/use-pass";
import {
  Sparkles,
  MessageCircle,
  Send,
  RefreshCw,
  Info,
  Loader2,
  Crown,
} from "lucide-react";

interface AiAssistantProps {
  currentWeek: number;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What foods should I avoid?",
  "How much weight gain is healthy?",
  "Is this amount of exercise safe?",
  "What prenatal tests happen now?",
];

export function AiAssistant({ currentWeek }: AiAssistantProps) {
  const week = currentWeek > 0 ? Math.min(42, currentWeek) : null;

  const weekly = useGetWeeklyInsight();
  const ask = useAskAssistant();
  const {
    isSignedIn,
    hasPass,
    freeRemaining,
    freeLimit,
    startCheckout,
    isStartingCheckout,
    refresh,
  } = usePass();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);

  // Auto-load the weekly insight whenever the current week changes.
  useEffect(() => {
    if (week == null) return;
    weekly.mutate({ data: { week } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  // Keep the latest question pinned to the top so each new answer reads from
  // its beginning; the user can scroll down to see the rest.
  useEffect(() => {
    const el = lastUserMsgRef.current;
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    }
  }, [messages]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;

    const history = messages.slice(-8);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");

    ask.mutate(
      { data: { question, week: week ?? undefined, history } },
      {
        onSuccess: (res) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: res.answer },
          ]);
          setDisclaimer(res.disclaimer);
          if (!hasPass) refresh();
        },
        onError: (err) => {
          if (
            err instanceof ApiError &&
            err.status === 403 &&
            (err.data as { code?: string } | null)?.code ===
              "FREE_LIMIT_REACHED"
          ) {
            // Roll back the optimistic user turn and show the upgrade prompt.
            setMessages((prev) => prev.slice(0, -1));
            setInput(question);
            setLimitReached(true);
            refresh();
            return;
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "Sorry — I couldn't answer that just now. Please check your connection and try again.",
            },
          ]);
        },
      },
    );
  };

  return (
    <div className="space-y-4 mt-2" data-testid="ai-assistant-section">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        Ask About Your Pregnancy
      </h2>

      {/* Weekly insight */}
      {week != null && (
        <Card className="border-primary/20 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                Your Week {week} Insight
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary"
                onClick={() => weekly.mutate({ data: { week } })}
                disabled={weekly.isPending}
                data-testid="button-refresh-insight"
              >
                <RefreshCw
                  className={`w-4 h-4 ${weekly.isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {weekly.isPending ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gathering evidence-based guidance for week {week}…
              </div>
            ) : weekly.isError ? (
              <p className="text-sm text-muted-foreground py-2">
                Couldn't load this week's insight.{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={() => weekly.mutate({ data: { week } })}
                >
                  Try again
                </button>
              </p>
            ) : weekly.data ? (
              <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
                {weekly.data.insight}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Q&A chat */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-accent" />
            Ask a Question
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            ref={scrollRef}
            className="relative max-h-80 overflow-y-auto space-y-3 pr-1"
            data-testid="chat-messages"
          >
            {messages.length === 0 && (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Ask anything about your pregnancy, your baby's development, or
                  what to expect. Answers reflect evidence-based guidance from
                  organizations like ACOG and the AAP.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <Badge
                      key={q}
                      variant="outline"
                      className="cursor-pointer border-primary/30 text-primary/80 hover:bg-primary/5 font-normal py-1.5 px-3 rounded-full"
                      onClick={() => send(q)}
                      data-testid="suggested-question"
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                ref={
                  m.role === "user" && i === lastUserIndex
                    ? lastUserMsgRef
                    : undefined
                }
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground/90 rounded-bl-sm"
                  }`}
                  data-testid={`message-${m.role}`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {ask.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {limitReached ? (
            <div
              className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3"
              data-testid="limit-reached-prompt"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Crown className="w-5 h-5 text-primary" />
                You've used your free questions this week
              </div>
              <p className="text-sm text-muted-foreground">
                Unlock the{" "}
                <span className="font-medium text-foreground">
                  Full Pregnancy Pass
                </span>{" "}
                for unlimited questions — a one-time $19.99, tied to your
                account and available on every device.
              </p>
              <Show when="signed-in">
                <Button
                  onClick={startCheckout}
                  disabled={isStartingCheckout}
                  className="gap-1.5 rounded-full w-full sm:w-auto"
                  data-testid="button-unlock-pass-inline"
                >
                  <Sparkles className="w-4 h-4" />
                  Unlock Full Pass — $19.99
                </Button>
              </Show>
              <Show when="signed-out">
                <p className="text-sm text-muted-foreground">
                  <Link
                    href="/sign-in"
                    className="text-primary font-medium underline underline-offset-2"
                    data-testid="link-sign-in-limit"
                  >
                    Sign in
                  </Link>{" "}
                  to unlock the pass and keep your access across devices.
                </p>
              </Show>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Type your question…"
                className="resize-none min-h-[44px] max-h-32 rounded-xl"
                rows={1}
                data-testid="input-question"
              />
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || ask.isPending}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}

          {isSignedIn && !hasPass && !limitReached && (
            <p
              className="text-xs text-muted-foreground/80"
              data-testid="text-free-remaining"
            >
              {freeRemaining} of {freeLimit} free questions left this week.
            </p>
          )}

          <p className="text-xs text-muted-foreground/80 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {disclaimer ??
              "This assistant gives general, evidence-based education — not medical advice. Always consult your healthcare provider about your specific situation."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
