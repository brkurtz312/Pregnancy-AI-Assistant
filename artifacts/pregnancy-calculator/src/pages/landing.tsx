import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth, Show } from "@clerk/react";
import {
  Check,
  ArrowRight,
  Infinity as InfinityIcon,
  Loader2,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    color: "#fce8e0",
    title: "Precise dates",
    body: "Track gestational age, key milestones, and your due date down to the day.",
  },
  {
    emoji: "🌿",
    color: "#e8f4ed",
    title: "Weekly development",
    body: "See how your baby is growing each week with gentle, illustrated insights.",
  },
  {
    emoji: "💬",
    color: "#e8edf8",
    title: "AI companion",
    body: "Ask anything about your pregnancy and get caring, clear answers any time.",
  },
];

const START_CHECKOUT_PARAM = "start_checkout";

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const { startCheckout, isStartingCheckout, hasPass } = usePass();
  const autoCheckoutFired = useRef(false);

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
    <div className="min-h-screen bg-[#fdf6f0] text-[#2d1f1a] overflow-x-hidden selection:bg-[#c96b6b]/20">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-[#fdf6f0]/90 backdrop-blur-md border-b border-[#e8d5c8]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            data-testid="link-home"
          >
            <div className="w-9 h-9 rounded-2xl bg-[#c96b6b] flex items-center justify-center shrink-0">
              <span className="text-lg leading-none">🌸</span>
            </div>
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
                className="text-[#8a6055] hover:text-[#2d1f1a]"
                data-testid="button-nav-sign-in"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </Show>
            <Button
              asChild
              size="sm"
              className="rounded-full gap-1.5 bg-[#c96b6b] hover:bg-[#b85e5e] text-white shadow-sm border-0"
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
          className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#f4c5a8]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-20 -left-24 w-[400px] h-[400px] rounded-full bg-[#e8b4b8]/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full bg-[#f9d8c0]/20 blur-2xl"
        />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-20 pb-16 md:pt-28 md:pb-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[#fce8e0] text-[#c96b6b] text-sm font-medium px-4 py-1.5 rounded-full mb-8 border border-[#f0c8bc]">
            <span>✦</span>
            Your gentle pregnancy companion
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-serif leading-[1.1] tracking-tight mb-6">
            Every week of your
            <br />
            <em className="text-[#c96b6b] not-italic">pregnancy,</em>
            <br />
            beautifully tracked.
          </h1>

          <p className="text-lg text-[#8a6055] max-w-xl mx-auto mb-10 leading-relaxed">
            Calculate your due date, follow your baby's growth week by week, and
            ask an AI companion anything — free to start.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-full gap-2 w-full sm:w-auto bg-[#c96b6b] hover:bg-[#b85e5e] text-white border-0 shadow-lg shadow-[#c96b6b]/25 hover:shadow-xl hover:shadow-[#c96b6b]/30 transition-all"
              data-testid="button-hero-start-free"
            >
              <Link href="/app">Start free — no account needed</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full w-full sm:w-auto border-[#d4a99c] text-[#8a6055] hover:bg-[#fce8e0] hover:border-[#c96b6b]/40 bg-transparent"
              data-testid="button-hero-pricing"
            >
              <a href="#pricing">See what's included</a>
            </Button>
          </div>
          <p className="text-sm text-[#b49080] mt-5">
            No subscription · One-time optional pass
          </p>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-14 md:py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {HIGHLIGHTS.map(({ emoji, color, title, body }) => (
            <div
              key={title}
              className="rounded-3xl p-7 border border-white/80 shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: color }}
            >
              <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center text-2xl mb-5 shadow-sm">
                {emoji}
              </div>
              <h3 className="font-serif text-xl font-semibold mb-2 text-[#2d1f1a]">
                {title}
              </h3>
              <p className="text-[#6b5050] leading-relaxed text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16 scroll-mt-20"
      >
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold font-serif tracking-tight mb-3">
            Free to start, more when you need it
          </h2>
          <p className="text-[#8a6055] max-w-lg mx-auto">
            Everything you need to follow your pregnancy is free. Upgrade only
            if you want unlimited answers from your AI companion.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 items-start">
          {/* Free plan */}
          <div className="bg-white rounded-3xl p-7 md:p-8 border border-[#e8d5c8] shadow-sm space-y-6">
            <div className="space-y-1.5">
              <div className="text-3xl mb-1">🤍</div>
              <h3 className="font-serif text-2xl font-semibold text-[#2d1f1a]">
                Free
              </h3>
              <p className="text-[#8a6055] text-sm">
                The full calculator, forever free.
              </p>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="text-4xl font-bold font-serif text-[#2d1f1a]">
                  $0
                </span>
                <span className="text-[#8a6055]">/ forever</span>
              </div>
            </div>
            <ul className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <span className="text-[#c96b6b] shrink-0 mt-0.5 text-base leading-none">
                    ✓
                  </span>
                  <span className="text-[#6b5050] text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-2xl gap-2 border-[#d4a99c] text-[#8a6055] hover:bg-[#fce8e0] bg-transparent"
              data-testid="button-plan-free"
            >
              <Link href="/app">
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Full Pregnancy Pass */}
          <div className="relative rounded-3xl p-7 md:p-8 text-white shadow-xl shadow-[#c96b6b]/20 space-y-6 overflow-hidden">
            {/* Gradient background */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-[#c96b6b] to-[#a84f4f]"
            />
            {/* Subtle blob */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"
            />

            <div className="relative -mt-2 mb-2">
              <span className="inline-flex items-center gap-1.5 bg-[#f4c5a8] text-[#7a3030] text-xs font-semibold px-3 py-1 rounded-full">
                👑 Best for the whole journey
              </span>
            </div>

            <div className="relative space-y-1.5">
              <div className="text-3xl mb-1">✨</div>
              <h3 className="font-serif text-2xl font-semibold">
                Full Pregnancy Pass
              </h3>
              <p className="text-white/75 text-sm">
                Unlimited AI support, all pregnancy long.
              </p>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="text-4xl font-bold font-serif">$14.99</span>
                <span className="text-white/70">one-time</span>
              </div>
            </div>

            <ul className="relative space-y-3">
              {PASS_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  {feature.includes("Unlimited") ? (
                    <InfinityIcon className="w-4 h-4 text-[#f4c5a8] shrink-0 mt-0.5" />
                  ) : (
                    <Check className="w-4 h-4 text-[#f4c5a8] shrink-0 mt-0.5" />
                  )}
                  <span className="text-white/90 text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            {hasPass ? (
              <div
                className="relative flex flex-col items-center gap-3 rounded-2xl bg-white/15 border border-white/30 px-6 py-5 text-center"
                data-testid="pass-active-banner"
              >
                <span className="flex items-center justify-center w-11 h-11 rounded-full bg-white/25 shadow-inner">
                  <Crown className="w-6 h-6 text-white" />
                </span>
                <div>
                  <p className="font-semibold text-white text-base leading-tight">
                    You have the Full Pass
                  </p>
                  <p className="text-white/70 text-xs mt-1">
                    Unlimited AI support is active on your account.
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="relative gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/30 shadow-none text-xs font-medium"
                >
                  <Link href="/app">
                    Open the app
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={handleGetPass}
                  disabled={isStartingCheckout}
                  className="relative w-full rounded-2xl gap-2 bg-white text-[#c96b6b] hover:bg-[#fdf6f0] font-semibold shadow-sm border-0 disabled:opacity-70"
                  data-testid="button-plan-pass"
                >
                  {isStartingCheckout ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    <>Get the Full Pass →</>
                  )}
                </Button>
                <p className="relative text-center text-xs text-white/60">
                  {isSignedIn
                    ? "One-time payment — your pass follows your account across every device."
                    : "Sign in to unlock — your pass follows your account across every device."}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 pb-20">
        <div className="relative overflow-hidden bg-white rounded-3xl p-10 md:p-14 border border-[#e8d5c8] text-center shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#c96b6b]/8 via-[#f4c5a8]/5 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#f4c5a8]/20 blur-3xl"
          />
          <h2 className="relative text-3xl md:text-4xl font-bold font-serif tracking-tight text-[#2d1f1a]">
            Start tracking your pregnancy today
          </h2>
          <p className="relative text-lg text-[#8a6055] max-w-xl mx-auto mt-3">
            Open the calculator and see your due date, your baby's progress, and
            your weekly milestones in seconds.
          </p>
          <Button
            asChild
            size="lg"
            className="relative rounded-full gap-2 mt-7 bg-[#c96b6b] hover:bg-[#b85e5e] text-white border-0 shadow-lg shadow-[#c96b6b]/25"
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
      <footer className="border-t border-[#e8d5c8]">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#8a6055]">
          <div className="flex items-center gap-2">
            <span className="text-base">🌸</span>
            <span className="font-medium text-[#2d1f1a]">
              Pregnancy Assistant
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/app"
              className="hover:text-[#2d1f1a] transition-colors"
            >
              Open the app
            </Link>
            <a
              href="#pricing"
              className="hover:text-[#2d1f1a] transition-colors"
            >
              Pricing
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
