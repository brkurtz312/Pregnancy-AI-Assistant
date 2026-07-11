import "./_group.css";

export function Warm() {
  return (
    <div
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      className="min-h-screen bg-[#fdf6f0] text-[#2d1f1a] overflow-x-hidden"
    >
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-[#fdf6f0]/90 backdrop-blur-md border-b border-[#e8d5c8]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#c96b6b] flex items-center justify-center">
              <span className="text-white text-lg">🌸</span>
            </div>
            <span style={{ fontFamily: "'Playfair Display', serif" }} className="text-lg font-bold">
              Pregnancy Assistant
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-sm text-[#8a6055] hover:text-[#2d1f1a] transition-colors px-3 py-1.5">
              Sign in
            </button>
            <button className="text-sm bg-[#c96b6b] text-white px-5 py-2 rounded-full font-medium hover:bg-[#b85e5e] transition-colors shadow-sm">
              Open the app →
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background blobs */}
        <div className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#f4c5a8]/30 blur-3xl" />
        <div className="pointer-events-none absolute top-20 -left-24 w-[400px] h-[400px] rounded-full bg-[#e8b4b8]/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full bg-[#f9d8c0]/20 blur-2xl" />

        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[#fce8e0] text-[#c96b6b] text-sm font-medium px-4 py-1.5 rounded-full mb-8 border border-[#f0c8bc]">
            <span>✦</span>
            Your gentle pregnancy companion
          </div>

          {/* Headline */}
          <h1
            style={{ fontFamily: "'Playfair Display', serif" }}
            className="text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight mb-6"
          >
            Every week of your
            <br />
            <em className="text-[#c96b6b] not-italic">pregnancy,</em>
            <br />
            beautifully tracked.
          </h1>

          <p className="text-lg text-[#8a6055] max-w-xl mx-auto mb-10 leading-relaxed">
            Calculate your due date, follow your baby's growth week by week,
            and ask an AI companion anything — free to start.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="bg-[#c96b6b] text-white px-8 py-3.5 rounded-full font-medium text-base shadow-lg shadow-[#c96b6b]/25 hover:bg-[#b85e5e] transition-all hover:shadow-xl hover:shadow-[#c96b6b]/30">
              Start free — no account needed
            </button>
            <button className="text-[#8a6055] border border-[#d4a99c] px-8 py-3.5 rounded-full font-medium text-base hover:bg-[#fce8e0] transition-colors">
              See what's included
            </button>
          </div>
          <p className="text-sm text-[#b49080] mt-5">No subscription · One-time optional pass</p>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { emoji: "🗓️", color: "#fce8e0", accent: "#c96b6b", title: "Precise dates", body: "Track gestational age, key milestones, and your due date down to the day." },
            { emoji: "🌿", color: "#e8f4ed", accent: "#5a9e7a", title: "Weekly development", body: "See how your baby is growing each week with gentle, illustrated insights." },
            { emoji: "💬", color: "#e8edf8", accent: "#6b7ec9", title: "AI companion", body: "Ask anything about your pregnancy and get caring, clear answers any time." },
          ].map(({ emoji, color, accent, title, body }) => (
            <div
              key={title}
              className="rounded-3xl p-7 border border-white/80 shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: color }}
            >
              <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center text-2xl mb-5 shadow-sm">
                {emoji}
              </div>
              <h3 style={{ fontFamily: "'Playfair Display', serif" }} className="text-xl font-semibold mb-2" style={{ color: "#2d1f1a" }}>
                {title}
              </h3>
              <p className="text-[#6b5050] leading-relaxed text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <h2 style={{ fontFamily: "'Playfair Display', serif" }} className="text-3xl md:text-4xl font-bold mb-3">
            Free to start, more when you need it
          </h2>
          <p className="text-[#8a6055] max-w-lg mx-auto">
            Everything you need to follow your pregnancy is free.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-8 border border-[#e8d5c8] shadow-sm">
            <div className="text-3xl mb-4">🤍</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif" }} className="text-2xl font-semibold mb-1">Free</h3>
            <p className="text-[#8a6055] mb-4 text-sm">The full calculator, forever free.</p>
            <div className="text-4xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>$0</div>
            {["All four calculation methods", "Weekly fetal development", "5 AI questions per week", "Milestones & countdowns"].map(f => (
              <div key={f} className="flex items-center gap-2.5 mb-2.5">
                <span className="text-[#c96b6b]">✓</span>
                <span className="text-sm text-[#6b5050]">{f}</span>
              </div>
            ))}
            <button className="mt-6 w-full border border-[#d4a99c] text-[#8a6055] py-3 rounded-2xl font-medium hover:bg-[#fce8e0] transition-colors">
              Start free
            </button>
          </div>

          <div className="relative bg-gradient-to-br from-[#c96b6b] to-[#a84f4f] rounded-3xl p-8 text-white shadow-xl shadow-[#c96b6b]/20">
            <div className="absolute -top-3 left-7 bg-[#f4c5a8] text-[#7a3030] text-xs font-semibold px-3 py-1 rounded-full">
              👑 Best for the whole journey
            </div>
            <div className="text-3xl mb-4">✨</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif" }} className="text-2xl font-semibold mb-1">Full Pregnancy Pass</h3>
            <p className="text-white/75 mb-4 text-sm">Unlimited AI support, all pregnancy long.</p>
            <div className="text-4xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>$14.99</div>
            {["Everything in free", "Unlimited AI questions", "All devices, one account", "One-time — no subscription"].map(f => (
              <div key={f} className="flex items-center gap-2.5 mb-2.5">
                <span className="text-[#f4c5a8]">✓</span>
                <span className="text-sm text-white/90">{f}</span>
              </div>
            ))}
            <button className="mt-6 w-full bg-white text-[#c96b6b] py-3 rounded-2xl font-semibold hover:bg-[#fdf6f0] transition-colors shadow-sm">
              Get the Full Pass →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
