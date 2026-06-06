import { Link } from "wouter";
import { Show } from "@clerk/react";
import {
  Baby,
  Sparkles,
  Crown,
  Check,
  CalendarHeart,
  MessageCircleHeart,
  Images,
  ArrowRight,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    icon: CalendarHeart,
    title: "Precise dates",
    body: "Track gestational age, key milestones, and your due date down to the day.",
  },
  {
    icon: Images,
    title: "Weekly development",
    body: "See how your baby is growing each week with gentle, illustrated insights.",
  },
  {
    icon: MessageCircleHeart,
    title: "AI companion",
    body: "Ask anything about your pregnancy and get caring, clear answers any time.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            data-testid="link-home"
          >
            <span className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-xl">
              <Baby className="w-5 h-5 text-primary" />
            </span>
            <span className="font-serif text-lg font-bold tracking-tight">
              Pregnancy Calculator
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Show when="signed-out">
              <Button
                asChild
                variant="ghost"
                size="sm"
                data-testid="button-nav-sign-in"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </Show>
            <Button
              asChild
              size="sm"
              className="rounded-full gap-1.5"
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-accent/5 to-transparent"
        />
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-16 pb-14 md:pt-24 md:pb-20 text-center space-y-6">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/10 text-primary py-1.5 px-3 rounded-full font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Your gentle pregnancy companion
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold font-serif tracking-tight leading-tight">
            Every week of your pregnancy,
            <span className="text-primary"> beautifully tracked.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Calculate your due date, follow your baby's weekly development, and
            ask an AI companion anything — free to start, with an optional
            one-time pass for unlimited support.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              asChild
              size="lg"
              className="rounded-full gap-2 w-full sm:w-auto"
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
              className="rounded-full w-full sm:w-auto"
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

      {/* Highlights */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <Card
              key={title}
              className="p-6 bg-card border-border/50 rounded-3xl space-y-3"
            >
              <span className="inline-flex items-center justify-center p-2.5 bg-primary/10 rounded-2xl">
                <Icon className="w-6 h-6 text-primary" />
              </span>
              <h3 className="font-serif text-xl font-semibold">{title}</h3>
              <p className="text-muted-foreground leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing / Free vs Paid */}
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
          <Card className="p-7 md:p-8 bg-card border-border/50 rounded-3xl space-y-6">
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
                  <span className="text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-full gap-2"
              data-testid="button-plan-free"
            >
              <Link href="/app">
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>

          {/* Full Pregnancy Pass */}
          <Card className="relative p-7 md:p-8 bg-card border-2 border-primary/40 rounded-3xl shadow-lg space-y-6">
            <Badge className="absolute -top-3 left-7 gap-1.5 rounded-full px-3 py-1">
              <Crown className="w-3.5 h-3.5" />
              Best for the whole journey
            </Badge>
            <div className="space-y-1.5">
              <span className="inline-flex items-center justify-center p-2.5 bg-primary/10 rounded-2xl">
                <Sparkles className="w-6 h-6 text-primary" />
              </span>
              <h3 className="font-serif text-2xl font-semibold pt-2">
                Full Pregnancy Pass
              </h3>
              <p className="text-muted-foreground">
                Unlimited AI support, all pregnancy long.
              </p>
              <div className="flex items-baseline gap-1.5 pt-2">
                <span className="text-4xl font-bold font-serif">$19.99</span>
                <span className="text-muted-foreground">one-time</span>
              </div>
            </div>
            <ul className="space-y-3">
              {PASS_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  {feature.includes("Unlimited") ? (
                    <InfinityIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  )}
                  <span className="text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="lg"
              className="w-full rounded-full gap-2"
              data-testid="button-plan-pass"
            >
              <Link href="/app">
                Get the Full Pass
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Sign in inside the app to unlock — your pass follows your account
              across every device.
            </p>
          </Card>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 pb-20">
        <Card className="relative overflow-hidden p-10 md:p-14 rounded-3xl border-border/50 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent"
          />
          <h2 className="text-3xl md:text-4xl font-bold font-serif tracking-tight">
            Start tracking your pregnancy today
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mt-3">
            Open the calculator and see your due date, your baby's progress, and
            your weekly milestones in seconds.
          </p>
          <Button
            asChild
            size="lg"
            className="rounded-full gap-2 mt-7"
            data-testid="button-cta-open-app"
          >
            <Link href="/app">
              Open the calculator
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Baby className="w-4 h-4 text-primary" />
            <span>Pregnancy Calculator</span>
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
