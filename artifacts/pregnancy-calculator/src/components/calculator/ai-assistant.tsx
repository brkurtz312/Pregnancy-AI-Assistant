import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAskAssistant, useGetWeeklyInsight } from "@workspace/api-client-react";
import {
  Sparkles,
  MessageCircle,
  Send,
  RefreshCw,
  Info,
  Loader2,
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

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-load the weekly insight whenever the current week changes.
  useEffect(() => {
    if (week == null) return;
    weekly.mutate({ data: { week } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

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
          setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
          setDisclaimer(res.disclaimer);
        },
        onError: () => {
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
                <RefreshCw className={`w-4 h-4 ${weekly.isPending ? "animate-spin" : ""}`} />
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
            className="max-h-80 overflow-y-auto space-y-3 pr-1"
            data-testid="chat-messages"
          >
            {messages.length === 0 && (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Ask anything about your pregnancy, your baby's development, or what to expect.
                  Answers reflect evidence-based guidance from organizations like ACOG and the AAP.
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
