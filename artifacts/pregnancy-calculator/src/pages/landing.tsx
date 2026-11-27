import { Link } from "wouter";
import { useAuth, Show } from "@clerk/react";
import {
  Check,
  ArrowRight,
  Infinity as InfinityIcon,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePass } from "@/hooks/use-pass";
import {
  ALREADY_PURCHASED_HINT,
  APP_NAME,
  APP_STORE_URL,
  APP_VERSION,
  GET_PASS_LABEL,
  GOOGLE_PLAY_URL,
} from "@/lib/app-store";

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
  {
    emoji: "⏱️",
    color: "#fdf0dc",
    title: "Kicks & contractions",
    body: "Count your baby's kicks and time contractions on your phone, or right from your Apple Watch.",
  },
  {
    emoji: "📓",
    color: "#f3e8f6",
    title: "Pregnancy journal",
    body: "Keep notes, photos and videos from every week in one private journal.",
  },
  {
    emoji: "🔔",
    color: "#e6f2f4",
    title: "Appointment reminders",
    body: "Schedule prenatal visits and get a reminder the morning before, with what your provider may cover.",
  },
];

/**
 * Official App Store and Google Play badges, each a link to the app's listing.
 * The badge artwork is Apple's and Google's own (public/images/badges); its
 * proportions must not be changed, so only the height is set.
 */
function StoreBadges({
  className = "",
  testIdPrefix,
}: {
  className?: string;
  testIdPrefix: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 ${className}`}
    >
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={`Download ${APP_NAME} on the App Store`}
        data-testid={`${testIdPrefix}-app-store`}
        className="rounded-[10px] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96b6b] focus-visible:ring-offset-2"
      >
        <img
          src="/images/badges/app-store.svg"
          alt="Download on the App Store"
          className="h-12 w-auto"
          width={144}
          height={48}
        />
      </a>
      <a
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={`Get ${APP_NAME} on Google Play`}
        data-testid={`${testIdPrefix}-google-play`}
        className="rounded-[10px] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96b6b] focus-visible:ring-offset-2"
      >
        <img
          src="/images/badges/google-play.png"
          alt="Get it on Google Play"
          className="h-12 w-auto"
          width={162}
          height={48}
        />
      </a>
    </div>
  );
}

const GROWTH_WEEKS = [
  { week: 12, size: "w-28 h-28 md:w-40 md:h-40" },
  { week: 20, size: "w-32 h-32 md:w-48 md:h-48" },
  { week: 28, size: "w-36 h-36 md:w-56 md:h-56" },
];

/** The promo video, exported from the ad. Lives in public/videos. */
const PROMO_VIDEO = "/videos/pregnancy-ai-assistant-promo.mp4";
const PROMO_POSTER = "/videos/pregnancy-ai-assistant-promo-poster.jpg";

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const { hasPass } = usePass();

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
              {APP_NAME}
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
            {APP_NAME} is now on iPhone, Apple Watch and Android. Calculate your
            due date, follow your baby's growth week by week, count kicks, time
            contractions, keep a journal, and ask an AI companion anything —
            free to start.
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

          <div className="mt-10 flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-[#8a6055]">Get the app</p>
            <StoreBadges testIdPrefix="hero-badge" />
            <p
              className="text-xs text-[#8a6055]"
              data-testid="text-app-version"
            >
              Version {APP_VERSION} · iPhone, Apple Watch &amp; Android
            </p>
          </div>
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

      {/* Ask anything */}
      <section
        className="max-w-6xl mx-auto px-4 md:px-8 py-14 md:py-20"
        aria-labelledby="ask-heading"
      >
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div className="space-y-4 text-center md:text-left">
            <h2
              id="ask-heading"
              className="text-3xl md:text-5xl font-bold font-serif tracking-tight leading-[1.1]"
            >
              That 3 a.m. pregnancy question?
            </h2>
            <p className="text-lg text-[#8a6055] leading-relaxed">
              Ask anything and get a clear answer, day or night, with 5 free
              questions every week.
            </p>
            <p className="text-sm text-[#8a6055]">
              General information, not medical advice.
            </p>
          </div>
          <div
            className="relative rounded-[2rem] bg-[#f4e3dc] p-5 md:p-8"
            data-testid="ask-example"
          >
            <div className="flex flex-col items-end gap-1.5 mb-5">
              <p className="max-w-[85%] rounded-3xl rounded-br-md bg-[#b65e5e] px-5 py-3.5 text-white font-medium leading-snug">
                Is it normal to feel baby hiccups?
              </p>
              <span className="text-xs text-[#8a6055]">3:04 a.m.</span>
            </div>
            <div className="rounded-3xl bg-white p-5 md:p-6 shadow-md shadow-[#2d1f1a]/5">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src="/images/app-icon.webp"
                  alt=""
                  className="w-9 h-9 rounded-[10px] ring-1 ring-[#e8d5c8]"
                  width={36}
                  height={36}
                />
                <span className="text-sm font-semibold text-[#8a6055]">
                  {APP_NAME}
                </span>
              </div>
              <p className="text-[#2d1f1a] leading-relaxed">
                Yes, it is very common. Many people feel small, rhythmic jumps
                from the second trimester on, and they are usually harmless. If
                anything feels different, check with your provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Week by week */}
      <section
        className="bg-[#2a1c18] text-[#fcf6f3]"
        aria-labelledby="weeks-heading"
      >
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
          <h2
            id="weeks-heading"
            className="text-3xl md:text-5xl font-bold font-serif tracking-tight leading-[1.1] mb-4"
          >
            See how baby grows, week by week.
          </h2>
          <p className="text-lg text-[#e9d5cc] max-w-xl mx-auto mb-12">
            Development, milestones and size for every stage of pregnancy.
          </p>
          <ul className="flex items-end justify-center gap-4 md:gap-10">
            {GROWTH_WEEKS.map(({ week, size }) => (
              <li key={week} className="flex flex-col items-center gap-3">
                <img
                  src={`/images/weeks/week-${week}.webp`}
                  alt={`Illustration of a baby at week ${week}`}
                  className={`${size} object-cover [mask-image:radial-gradient(closest-side,#000_72%,transparent)]`}
                  loading="lazy"
                  width={224}
                  height={224}
                />
                <span className="text-sm md:text-base font-semibold text-[#e7a57a]">
                  Week {week}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Promo video */}
      <section
        className="max-w-6xl mx-auto px-4 md:px-8 py-14 md:py-20"
        aria-labelledby="video-heading"
      >
        <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-4 text-center md:text-left">
            <h2
              id="video-heading"
              className="text-3xl md:text-5xl font-bold font-serif tracking-tight leading-[1.1]"
            >
              See it in 15 seconds
            </h2>
            <p className="text-lg text-[#8a6055] leading-relaxed max-w-md mx-auto md:mx-0">
              Ask a question, count kicks, time contractions and follow your
              baby week by week, all in one app.
            </p>
            <StoreBadges
              className="md:justify-start pt-2"
              testIdPrefix="video-badge"
            />
          </div>
          <video
            className="mx-auto w-full max-w-[300px] aspect-[9/16] rounded-[2rem] bg-[#2a1c18] shadow-xl shadow-[#2d1f1a]/15"
            src={PROMO_VIDEO}
            poster={PROMO_POSTER}
            controls
            muted
            playsInline
            preload="none"
            aria-label={`${APP_NAME} promo video`}
            data-testid="promo-video"
          />
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
                <span className="text-4xl font-bold font-serif">$9.99</span>
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
                  asChild
                  size="lg"
                  className="relative w-full rounded-2xl gap-2 bg-white text-[#c96b6b] hover:bg-[#fdf6f0] font-semibold shadow-sm border-0"
                  data-testid="button-plan-pass"
                >
                  <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
                    {GET_PASS_LABEL} →
                  </a>
                </Button>
                <p className="relative text-center text-xs text-white/60">
                  {isSignedIn
                    ? "One-time payment in the App Store — your pass follows your account across every device."
                    : ALREADY_PURCHASED_HINT}
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
          <p className="relative text-sm text-[#8a6055] mt-8 mb-3">
            Or take {APP_NAME} with you
          </p>
          <StoreBadges className="relative" testIdPrefix="cta-badge" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8d5c8]">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#8a6055]">
          <div className="flex items-center gap-2">
            <span className="text-base">🌸</span>
            <span className="font-medium text-[#2d1f1a]">{APP_NAME}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
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
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#2d1f1a] transition-colors"
            >
              App Store
            </a>
            <a
              href={GOOGLE_PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#2d1f1a] transition-colors"
            >
              Google Play
            </a>
            <Link
              href="/privacy"
              className="hover:text-[#2d1f1a] transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
