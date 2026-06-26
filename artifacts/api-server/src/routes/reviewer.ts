import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";

const router: IRouter = Router();

const DEMO_USER_ID = "user_3FbMbELUGoggA6nXU8lht1GWJOJ";

router.post("/reviewer/sign-in-token", async (req, res) => {
  const { code } = req.body as { code?: string };
  const accessCode = process.env.DEV_ACCESS_CODE;

  if (!code || !accessCode) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  let match = false;
  try {
    const a = Buffer.from(String(code));
    const b = Buffer.from(String(accessCode));
    match = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const clerkKey = process.env.CLERK_SECRET_KEY;
  if (!clerkKey) {
    res.status(503).json({ error: "Not configured" });
    return;
  }

  const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clerkKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: DEMO_USER_ID, expires_in_seconds: 3600 }),
  });

  if (!tokenRes.ok) {
    res.status(502).json({ error: "Token generation failed" });
    return;
  }

  const data = (await tokenRes.json()) as { token: string };
  res.json({ token: data.token });
});

export default router;
