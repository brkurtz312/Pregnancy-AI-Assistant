import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth, Show } from "@clerk/react";
import {
  Baby,
  Sparkles,
  Crown,
  Check,
  ArrowRight,
  Infinity as InfinityIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePass } from "@/hooks/use-pass";

const FREE_FEATURES = [
  "All four calculation methods (LMP, due date, conception, ultrasound)",
  "Personalized due date, gestational age & countdown",
  "Weekly fetal development with illustrations",
  "Trimester milestones & upcoming-week previews",
  "5 AI pregnancy questions every week",
];

const PASS_FEATURES = [
  "Everything in the free plan",
  "Unlimited AI pregnancy questions",
  "Answers tied to your account, on every device",
  "One simple payment — no subscription",
  "Lasts your entire pregnancy",
];

const HIGHLIGHTS = [
  {
    emoji: "🗓️",
    cardBg: "bg-[hsl(0_40%_95%)]",
    title: "Precise dates",
    body: "Track gestational age, key milestones, and your due date down to the day.",
  },
  {
    emoji: "🌿",
    cardBg: "bg-[hsl(145_35%_93%)]",
    title: "Weekly development",
    body: "See how your baby is growing each week with gentle, illustrated insights.",
  },
  {
    emoji: "💬",
    cardBg: "bg-[hsl(210_40%_94%)]",
    title: "AI companion",
    body: "Ask anything about your pregnancy and get caring, clear answers any time.",
  },
];

const START_CHECKOUT_PARAM = "start_checkout";

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const { startCheckout, isStartingCheckout, hasPass } = usePass();
  const autoCheckoutFired = useRef(false);

  // When the user returns from sign-in with ?start_checkout=1, auto-trigger
  // checkout so they land directly in the purchase flow.
  useEffect(() => {
    if (!isSignedIn || autoCheckoutFired.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(START_CHECKOUT_PARAM) !== "1") return;

    autoCheckoutFired.current = true;

    params.delete(START_CHECKOUT_PARAM);
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname +
        (query ? `?${query}` : "") +
        window.location.hash,
    );

    startCheckout();
  }, [isSignedIn, startCheckout]);

  function handleGetPass() {
    if (isSignedIn) {
      startCheckout();
    } else {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const returnUrl =
        window.location.pathname +
        (window.location.search
          ? `${window.location.search}&${START_CHECKOUT_PARAM}=1`
          : `?${START_CHECKOUT_PARAM}=1`) +
        window.location.hash;
      window.location.href = `${basePath}/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            data-testid="link-home"
          >
            <span className="inline-flex items-center justify-center p-2 bg-primary/15 rounded-xl">
              <Baby className="w-5 h-5 text-primary" />
            </span>
            <span className="font-serif text-lg font-bold tracking-tight">
              Pregnancy Assistant
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Show when="signed-out">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-nav-sign-in"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </Show>
            <Button
              asChild
              size="sm"
              className="rounded-full gap-1.5 shadow-sm"
              data-testid="button-nav-open-app"
            >
              <Link href="/app">
                Open the app
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Warm blob decorations */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[hsl(25_80%_80%/0.28)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-20 -left-24 w-[400px] h-[400px] rounded-full bg-[hsl(0_50%_82%/0.22)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full bg-[hsl(30_70%_85%/0.18)] blur-2xl"
        />

        <div className="relative max-w-4xl mx-auto px-4 md:px-8 pt-16 pb-14 md:pt-24 md:pb-20 text-center space-y-7">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/10 text-primary py-1.5 px-3 rounded-full font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Your gentle pregnancy companion
          </Badge>

          <h1 className="text-4xl md:text-6xl font-bold font-serif tracking-tight leading-[1.1]">
            Every week of your pregnancy,
            <span className="text-primary"> beautifully tracked.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Calculate your due date, follow your baby's weekly development, and
            ask an AI companion anything — free to start, with an optional
            one-time pass for unlimited support.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <Button
              asChild
              size="lg"
              className="rounded-full gap-2 w-full sm:w-auto shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-shadow"
              data-testid="button-hero-start-free"
            >
              <Link href="/app">
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full w-full sm:w-auto border-border hover:bg-primary/5"
              data-testid="button-hero-pricing"
            >
              <a href="#pricing">See what's included</a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            No account needed to start · One-time pass, no subscription
          </p>
        </div>
      </section>

      {/* Highlights — tinted cards */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {HIGHLIGHTS.map(({ emoji, cardBg, title, body }) => (
            <div
              key={title}
              className={`${cardBg} rounded-3xl p-7 border border-white/70 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center text-2xl mb-5 shadow-sm">
                {emoji}
              </div>
              <h3 className="font-serif text-xl font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16 scroll-mt-20"
      >
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-3xl md:text-4xl font-bold font-serif tracking-tight">
            Free to start, more when you need it
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to follow your pregnancy is free. Upgrade only
            if you want unlimited answers from your AI companion.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 items-start">
          {/* Free plan */}
          <div className="bg-white rounded-3xl p-7 md:p-8 border border-border shadow-sm space-y-6">
            <div className="space-y-1.5">
              <span className="inline-flex items-center justify-center p-2.5 bg-muted rounded-2xl">
                <Baby className="w-6 h-6 text-foreground/70" />
              </span>
              <h3 className="font-serif text-2xl font-semibold pt-2">Free</h3>
              <p className="text-muted-foreground">
                The full calculator, forever free.
              </p>
              <div className="flex items-baseline gap-1.5 pt-2">
                <span className="text-4xl font-bold font-serif">$0</span>
                <span className="text-muted-foreground">/ forever</span>
              </div>
            </div>
            <ul className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground/90 text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-2xl gap-2 border-border hover:bg-primary/5"
              data-testid="button-plan-free"
            >
              <Link href="/app">
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Full Pregnancy Pass — warm gradient */}
          <div className="relative rounded-3xl p-7 md:p-8 text-white shadow-xl shadow-primary/20 space-y-6 overflow-hidden">
            {/* Gradient background */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-primary via-[hsl(10_45%_52%)] to-[hsl(15_50%_45%)]"
            />
            {/* Subtle blob inside card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"
            />

            <Badge className="relative -top-3 -left-1 gap-1.5 rounded-full px-3 py-1 bg-[hsl(30_80%_82%)] text-[hsl(10_45%_28%)] border-0 w-fit">
              <Crown className="w-3.5 h-3.5" />
              Best for the whole journey
            </Badge>

            <div className="relative space-y-1.5">
              <span className="inline-flex items-center justify-center p-2.5 bg-white/20 rounded-2xl">
                <Sparkles className="w-6 h-6 text-white" />
              </span>
              <h3 className="font-serif text-2xl font-semibold pt-2">
                Full Pregnancy Pass
              </h3>
              <p className="text-white/75">
                Unlimited AI support, all pregnancy long.
              </p>
              <div className="flex items-baseline gap-1.5 pt-2">
                <span className="text-4xl font-bold font-serif">$14.99</span>
                <span className="text-white/70">one-time</span>
              </div>
            </div>

            <ul className="relative space-y-3">
              {PASS_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  {feature.includes("Unlimited") ? (
                    <InfinityIcon className="w-5 h-5 text-white/80 shrink-0 mt-0.5" />
                  ) : (
                    <Check className="w-5 h-5 text-white/80 shrink-0 mt-0.5" />
                  )}
                  <span className="text-white/90 text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              size="lg"
              onClick={handleGetPass}
              disabled={isStartingCheckout || hasPass}
              className="relative w-full rounded-2xl gap-2 bg-white text-primary hover:bg-white/90 font-semibold shadow-sm disabled:opacity-70"
              data-testid="button-plan-pass"
            >
              {isStartingCheckout ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting…
                </>
              ) : hasPass ? (
                <>
                  <Crown className="w-4 h-4" />
                  Pass active
                </>
              ) : (
                <>
                  Get the Full Pass
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
            <p className="relative text-center text-xs text-white/60">
              {isSignedIn
                ? "One-time payment — your pass follows your account across every device."
                : "Sign in to unlock — your pass follows your account across every device."}
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 pb-20">
        <div className="relative overflow-hidden bg-white rounded-3xl p-10 md:p-14 border border-border/60 text-center shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-accent/5 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[hsl(25_80%_80%/0.2)] blur-3xl"
          />
          <h2 className="relative text-3xl md:text-4xl font-bold font-serif tracking-tight">
            Start tracking your pregnancy today
          </h2>
          <p className="relative text-lg text-muted-foreground max-w-xl mx-auto mt-3">
            Open the calculator and see your due date, your baby's progress, and
            your weekly milestones in seconds.
          </p>
          <Button
            asChild
            size="lg"
            className="relative rounded-full gap-2 mt-7 shadow-md shadow-primary/20"
            data-testid="button-cta-open-app"
          >
            <Link href="/app">
              Open the calculator
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Baby className="w-4 h-4 text-primary" />
            <span className="font-medium">Pregnancy Assistant</span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/app"
              className="hover:text-foreground transition-colors"
            >
              Open the app
            </Link>
            <a
              href="#pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
