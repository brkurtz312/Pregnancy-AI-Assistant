import "./_group.css";

export function Editorial() {
  return (
    <div
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      className="min-h-screen bg-[#fafaf8] text-[#1a1a18] overflow-x-hidden"
    >
      {/* Nav */}
      <header className="border-b border-[#e5e5e0]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1a1a18] rounded-lg flex items-center justify-center">
              <span className="text-[#fafaf8] text-sm">✦</span>
            </div>
            <span
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
              className="text-xl font-semibold tracking-wide"
            >
              Pregnancy Assistant
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[#6b6b62]">
            <a href="#" className="hover:text-[#1a1a18] transition-colors">
              Features
            </a>
            <a href="#" className="hover:text-[#1a1a18] transition-colors">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <button className="text-sm text-[#6b6b62]">Sign in</button>
            <button className="text-sm bg-[#1a1a18] text-[#fafaf8] px-5 py-2.5 rounded-lg font-medium hover:bg-[#333] transition-colors">
              Open the app
            </button>
          </div>
        </div>
      </header>

      {/* Hero — editorial magazine style */}
      <section className="max-w-6xl mx-auto px-8 pt-16 pb-12 grid md:grid-cols-[1fr_auto] gap-12 items-start border-b border-[#e5e5e0]">
        <div>
          <div className="inline-block text-xs uppercase tracking-[0.2em] text-[#b05070] font-medium mb-8 border-b-2 border-[#b05070] pb-1">
            Your gentle pregnancy companion
          </div>
          <h1
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
            className="text-[4.5rem] leading-[0.95] font-light tracking-tight mb-8 text-[#1a1a18]"
          >
            Every week of
            <br />
            your pregnancy,
            <br />
            <em className="italic text-[#b05070]">beautifully</em>
            <br />
            tracked.
          </h1>
          <p className="text-base text-[#6b6b62] max-w-md leading-relaxed mb-10">
            Calculate your due date, follow your baby's weekly development, and
            ask an AI companion anything — free to start, with an optional
            one-time pass.
          </p>
          <div className="flex items-center gap-4">
            <button className="bg-[#b05070] text-white px-7 py-3 text-sm font-medium hover:bg-[#943d5c] transition-colors">
              Start free
            </button>
            <button className="text-sm text-[#6b6b62] underline underline-offset-4 hover:text-[#1a1a18] transition-colors">
              See what's included
            </button>
          </div>
          <p className="text-xs text-[#9b9b8e] mt-4 tracking-wide">
            No account needed · No subscription
          </p>
        </div>

        {/* Issue number / sidebar detail */}
        <div className="hidden md:flex flex-col items-end gap-6 pt-2 text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-[#9b9b8e] writing-mode-vertical">
            <div
              className="text-5xl font-light text-[#e5e5e0]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              40
            </div>
            <div className="text-xs text-[#9b9b8e] mt-1">weeks</div>
          </div>
          <div className="w-px h-32 bg-[#e5e5e0]" />
          <div className="text-xs text-[#9b9b8e] uppercase tracking-[0.15em]">
            of moments
          </div>
        </div>
      </section>

      {/* Features — editorial grid */}
      <section className="max-w-6xl mx-auto px-8 py-14">
        <div className="grid md:grid-cols-3 gap-0 border border-[#e5e5e0]">
          {[
            {
              num: "01",
              title: "Precise dates",
              body: "Track gestational age, key milestones, and your due date down to the day.",
            },
            {
              num: "02",
              title: "Weekly development",
              body: "See how your baby is growing each week with gentle, illustrated insights.",
            },
            {
              num: "03",
              title: "AI companion",
              body: "Ask anything about your pregnancy and get caring, clear answers any time.",
            },
          ].map(({ num, title, body }, i) => (
            <div
              key={num}
              className={`p-8 ${i < 2 ? "border-r border-[#e5e5e0]" : ""}`}
            >
              <div className="text-xs text-[#9b9b8e] mb-5 font-mono">{num}</div>
              <h3
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                className="text-2xl font-semibold mb-3"
              >
                {title}
              </h3>
              <p className="text-sm text-[#6b6b62] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-8 pb-20 border-t border-[#e5e5e0] pt-14">
        <div className="grid md:grid-cols-[1fr_1fr] gap-10 items-start">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#9b9b8e] mb-4">
              Pricing
            </div>
            <h2
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
              className="text-4xl font-light leading-tight mb-4"
            >
              Free to start,
              <br />
              more when
              <br />
              you need it.
            </h2>
            <p className="text-sm text-[#6b6b62] leading-relaxed">
              Everything you need to follow your pregnancy is free. Upgrade only
              for unlimited AI support.
            </p>
          </div>

          <div className="space-y-4">
            <div className="border border-[#e5e5e0] p-7 bg-white">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    className="text-2xl font-semibold"
                  >
                    Free
                  </h3>
                  <p className="text-xs text-[#9b9b8e] mt-0.5">
                    The full calculator, forever free.
                  </p>
                </div>
                <div
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  className="text-3xl font-light"
                >
                  $0
                </div>
              </div>
              {[
                "All four calculation methods",
                "Weekly fetal development",
                "5 AI questions / week",
              ].map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 mb-2 text-sm text-[#6b6b62]"
                >
                  <span className="text-[#b05070] text-xs">—</span> {f}
                </div>
              ))}
              <button className="mt-5 w-full border border-[#1a1a18] text-[#1a1a18] py-2.5 text-sm font-medium hover:bg-[#1a1a18] hover:text-white transition-colors">
                Start free
              </button>
            </div>

            <div className="border-2 border-[#1a1a18] p-7 bg-[#1a1a18] text-white relative">
              <div className="absolute -top-3 left-6 bg-[#b05070] text-white text-xs px-3 py-0.5 font-medium">
                Best for the whole journey
              </div>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    className="text-2xl font-semibold"
                  >
                    Full Pregnancy Pass
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Unlimited AI, all pregnancy long.
                  </p>
                </div>
                <div
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  className="text-3xl font-light"
                >
                  $14.99
                </div>
              </div>
              {[
                "Everything in free",
                "Unlimited AI questions",
                "One-time — no subscription",
              ].map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 mb-2 text-sm text-white/80"
                >
                  <span className="text-[#e89ab0] text-xs">—</span> {f}
                </div>
              ))}
              <button className="mt-5 w-full bg-[#b05070] text-white py-2.5 text-sm font-medium hover:bg-[#943d5c] transition-colors">
                Get the Full Pass
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
