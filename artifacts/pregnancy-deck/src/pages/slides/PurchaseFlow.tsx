export default function PurchaseFlow() {
  const steps = [
    {
      n: "1",
      title: "Buy the pass",
      body: "On iOS through the App Store.",
      accent: false,
    },
    {
      n: "2",
      title: "Reconcile",
      body: "The app calls the server reconcile endpoint.",
      accent: false,
    },
    {
      n: "3",
      title: "Verify & grant",
      body: "Server confirms the entitlement, grants by Clerk ID.",
      accent: false,
    },
    {
      n: "4",
      title: "Unlimited access",
      body: "AI unlocks on iOS and web at once.",
      accent: true,
    },
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}>
        <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.16em" }}>
          05 · HOW IT WORKS
        </div>
        <h2
          style={{
            fontSize: "4.2vw",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "1.6vh 0 0 0",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
          }}
        >
          From purchase to access
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "2.4vh", marginTop: "4vh" }}>
          {steps.map((s) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: "2vw" }}>
              <div
                style={{
                  width: "4.6vw",
                  height: "4.6vw",
                  borderRadius: "50%",
                  backgroundColor: s.accent ? "#1a1a2e" : "#2a7b7b",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.4vw",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", lineHeight: 1.3 }}>
                <span style={{ fontWeight: 700, color: s.accent ? "#2a7b7b" : "#1a1a2e" }}>
                  {s.title}
                </span>
                {" — "}
                {s.body}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: "2.4vw", fontWeight: 500, color: "#4a4a68", marginTop: "4vh", lineHeight: 1.4 }}>
          Access is granted server-side — never by the client.
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100vw",
          height: "10vh",
          backgroundColor: "#2a7b7b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 8vw",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", letterSpacing: "0.05em" }}>
          Pregnancy AI Assistant
        </div>
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>06</div>
      </div>
    </div>
  );
}
