import "./_group.css";

export function Bold() {
  return (
    <div
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      className="min-h-screen bg-[#0f0a14] text-white overflow-x-hidden"
    >
      {/* Nav */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#f06292] to-[#ce3f6f] flex items-center justify-center">
              <span className="text-white text-sm font-bold">P</span>
            </div>
            <span
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="text-base font-semibold"
            >
              Pregnancy Assistant
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-sm text-white/60 hover:text-white transition-colors px-4 py-2">
              Sign in
            </button>
            <button className="text-sm bg-[#f06292] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#e05080] transition-colors">
              Open the app →
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Glow effects */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#f06292]/10 rounded-full blur-3xl -translate-y-1/4" />
        <div className="pointer-events-none absolute top-1/3 left-0 w-[400px] h-[400px] bg-[#9b59b6]/8 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center relative">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-[#f9a8c4] text-xs font-medium px-4 py-2 rounded-full mb-8 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f06292] animate-pulse" />
            Your gentle pregnancy companion
          </div>

          <h1
            style={{ fontFamily: "'Playfair Display', serif" }}
            className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
          >
            Every week of your
            <br />
            pregnancy,{" "}
            <span className="bg-gradient-to-r from-[#f06292] via-[#f48fb1] to-[#ce93d8] bg-clip-text text-transparent">
              beautifully
            </span>
            <br />
            tracked.
          </h1>

          <p className="text-lg text-white/55 max-w-xl mx-auto mb-10 leading-relaxed font-light">
            Calculate your due date, follow your baby's growth week by week, and
            ask an AI companion anything — free to start.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="bg-gradient-to-r from-[#f06292] to-[#ce3f6f] text-white px-8 py-3.5 rounded-xl font-medium text-base shadow-lg shadow-[#f06292]/20 hover:shadow-xl hover:shadow-[#f06292]/30 transition-all">
              Start free — no account needed
            </button>
            <button className="text-white/60 border border-white/15 px-8 py-3.5 rounded-xl font-medium text-base hover:border-white/30 hover:text-white/80 transition-all backdrop-blur-sm">
              See what's included
            </button>
          </div>
          <p className="text-xs text-white/30 mt-5 tracking-wide">
            No subscription required · One-time optional upgrade
          </p>
        </div>
      </section>

      {/* Bento-style feature grid */}
      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: "🗓️",
              gradient: "from-[#f06292]/20 to-[#f48fb1]/5",
              border: "border-[#f06292]/20",
              title: "Precise dates",
              body: "Track gestational age, milestones, and your due date down to the day.",
              tag: "Calculator",
            },
            {
              icon: "🌱",
              gradient: "from-[#66bb6a]/15 to-[#a5d6a7]/5",
              border: "border-[#66bb6a]/20",
              title: "Weekly development",
              body: "Illustrated, week-by-week view of how your baby is growing.",
              tag: "Development",
            },
            {
              icon: "✦",
              gradient: "from-[#ce93d8]/20 to-[#f3e5f5]/5",
              border: "border-[#ce93d8]/20",
              title: "AI companion",
              body: "Get caring, personalised answers to your pregnancy questions anytime.",
              tag: "AI",
            },
          ].map(({ icon, gradient, border, title, body, tag }) => (
            <div
              key={title}
              className={`bg-gradient-to-br ${gradient} rounded-2xl p-6 border ${border} backdrop-blur-sm`}
            >
              <div className="flex justify-between items-start mb-5">
                <span className="text-2xl">{icon}</span>
                <span className="text-xs text-white/30 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                  {tag}
                </span>
              </div>
              <h3
                style={{ fontFamily: "'Playfair Display', serif" }}
                className="text-lg font-semibold mb-2"
              >
                {title}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Stats strip */}
        <div className="mt-4 bg-white/3 border border-white/8 rounded-2xl p-6 grid grid-cols-3 gap-6 text-center">
          {[
            { num: "40", label: "weeks tracked" },
            { num: "5", label: "AI questions free, weekly" },
            { num: "$0", label: "to get started" },
          ].map(({ num, label }) => (
            <div key={label}>
              <div
                style={{ fontFamily: "'Playfair Display', serif" }}
                className="text-3xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent"
              >
                {num}
              </div>
              <div className="text-xs text-white/40 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <h2
            style={{ fontFamily: "'Playfair Display', serif" }}
            className="text-3xl md:text-4xl font-bold mb-3"
          >
            Free to start,{" "}
            <span className="bg-gradient-to-r from-[#f06292] to-[#ce93d8] bg-clip-text text-transparent">
              more when you need it
            </span>
          </h2>
          <p className="text-white/50 max-w-md mx-auto">
            Everything is free. Upgrade only for unlimited AI support.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white/4 border border-white/10 rounded-2xl p-8">
            <div className="text-3xl mb-4">🤍</div>
            <h3
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="text-2xl font-semibold mb-1"
            >
              Free
            </h3>
            <p className="text-white/40 text-sm mb-4">
              The full calculator, forever free.
            </p>
            <div
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="text-4xl font-bold mb-6"
            >
              $0
            </div>
            {[
              "All four calculation methods",
              "Weekly fetal development",
              "5 AI questions per week",
              "Milestones & countdowns",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 mb-2.5">
                <span className="text-[#f06292] text-sm">✓</span>
                <span className="text-sm text-white/60">{f}</span>
              </div>
            ))}
            <button className="mt-6 w-full border border-white/20 text-white/70 py-3 rounded-xl text-sm font-medium hover:border-white/40 hover:text-white transition-all">
              Start free
            </button>
          </div>

          <div className="relative bg-gradient-to-br from-[#2a0f1f] via-[#1e0a18] to-[#150a1e] border border-[#f06292]/30 rounded-2xl p-8 shadow-xl shadow-[#f06292]/10">
            <div className="absolute -top-3 left-6 bg-gradient-to-r from-[#f06292] to-[#ce3f6f] text-white text-xs font-medium px-3 py-1 rounded-full">
              👑 Best for the whole journey
            </div>
            <div className="text-3xl mb-4">✨</div>
            <h3
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="text-2xl font-semibold mb-1"
            >
              Full Pregnancy Pass
            </h3>
            <p className="text-white/40 text-sm mb-4">
              Unlimited AI support, all pregnancy long.
            </p>
            <div
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="text-4xl font-bold bg-gradient-to-r from-[#f06292] to-[#f48fb1] bg-clip-text text-transparent mb-6"
            >
              $9.99
            </div>
            {[
              "Everything in free",
              "Unlimited AI questions",
              "All devices, one account",
              "One-time — no subscription",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 mb-2.5">
                <span className="text-[#f9a8c4] text-sm">✓</span>
                <span className="text-sm text-white/70">{f}</span>
              </div>
            ))}
            <button className="mt-6 w-full bg-gradient-to-r from-[#f06292] to-[#ce3f6f] text-white py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[#f06292]/25 transition-all">
              Get the Full Pass →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
