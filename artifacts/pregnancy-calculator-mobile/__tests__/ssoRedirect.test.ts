/**
 * Google sign-in's return trip on Android (lib/sso-redirect.ts and
 * app/+native-intent.tsx).
 *
 * 1. The router ignores the sign-in redirect link while the app is running,
 *    and opens the sign-in screen if the link launches the app.
 * 2. startGoogleSSO finishes a sign-in that the browser reported as a
 *    dismissal when the redirect link did arrive.
 * 3. It leaves every other outcome, and other platforms, untouched.
 */
import { Linking, Platform } from "react-native";

import { redirectSystemPath } from "../app/+native-intent";
import { isSsoCallbackUrl, startGoogleSSO } from "../lib/sso-redirect";

const REDIRECT = "pregnancy-calculator-mobile://sso-callback";
const RETURNED = `${REDIRECT}?rotating_token_nonce=nonce%2D123`;

type UrlListener = (event: { url: string }) => void;
let urlListeners: UrlListener[] = [];
const originalOS = Platform.OS;

function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

function makeSignIn(status: string | null = "verified") {
  const signIn = {
    createdSessionId: null as string | null,
    firstFactorVerification: { status },
    reload: jest.fn(async () => {
      if (status === "verified") signIn.createdSessionId = "sess_recovered";
    }),
  };
  return signIn;
}

function makeSignUp() {
  const signUp = {
    createdSessionId: null as string | null,
    create: jest.fn(async () => {
      signUp.createdSessionId = "sess_new_user";
    }),
  };
  return signUp;
}

beforeEach(() => {
  urlListeners = [];
  jest.spyOn(Linking, "addEventListener").mockImplementation(((
    _type: string,
    listener: UrlListener,
  ) => {
    urlListeners.push(listener);
    return {
      remove: () => {
        urlListeners = urlListeners.filter((l) => l !== listener);
      },
    };
  }) as unknown as typeof Linking.addEventListener);
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  setOS("android");
});

afterEach(() => {
  jest.restoreAllMocks();
  setOS(originalOS);
});

describe("redirectSystemPath", () => {
  it("ignores the sign-in redirect while the app is running", () => {
    expect(redirectSystemPath({ path: RETURNED, initial: false })).toBeNull();
  });

  it("opens the sign-in screen when the redirect launches the app", () => {
    expect(redirectSystemPath({ path: RETURNED, initial: true })).toBe(
      "/sign-in",
    );
  });

  it("passes every other link through unchanged", () => {
    const link = "pregnancy-calculator-mobile://development?week=20";
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
    expect(redirectSystemPath({ path: "/journal", initial: true })).toBe(
      "/journal",
    );
  });
});

describe("isSsoCallbackUrl", () => {
  it("matches the redirect with or without query", () => {
    expect(isSsoCallbackUrl(REDIRECT)).toBe(true);
    expect(isSsoCallbackUrl(RETURNED)).toBe(true);
    expect(isSsoCallbackUrl("exp://192.168.1.2:8081/--/sso-callback")).toBe(
      true,
    );
  });

  it("does not match lookalike paths", () => {
    expect(isSsoCallbackUrl("pregnancy-calculator-mobile://")).toBe(false);
    expect(
      isSsoCallbackUrl("pregnancy-calculator-mobile://not-sso-callbacks"),
    ).toBe(false);
  });
});

describe("startGoogleSSO", () => {
  const params = { strategy: "oauth_google", redirectUrl: REDIRECT };

  it("passes the params through and returns a successful flow unchanged", async () => {
    const result = { createdSessionId: "sess_ok", setActive: jest.fn() };
    const start = jest.fn().mockResolvedValue(result);

    await expect(startGoogleSSO(start, params)).resolves.toBe(result);
    expect(start).toHaveBeenCalledWith(params);
  });

  it("finishes the sign-in when the redirect arrived but the flow reported a dismissal", async () => {
    const signIn = makeSignIn("verified");
    const start = jest.fn(async () => {
      urlListeners.forEach((l) => l({ url: RETURNED }));
      return {
        createdSessionId: null,
        authSessionResult: { type: "dismiss" },
        signIn,
        signUp: makeSignUp(),
      };
    });

    const result = await startGoogleSSO(start, params);

    expect(signIn.reload).toHaveBeenCalledWith({
      rotatingTokenNonce: "nonce-123",
    });
    expect(result.createdSessionId).toBe("sess_recovered");
    expect(urlListeners).toHaveLength(0);
  });

  it("waits briefly for a redirect that arrives just after the dismissal", async () => {
    const signIn = makeSignIn("verified");
    const start = jest.fn(async () => {
      setTimeout(() => urlListeners.forEach((l) => l({ url: RETURNED })), 200);
      return {
        createdSessionId: null,
        authSessionResult: { type: "dismiss" },
        signIn,
        signUp: makeSignUp(),
      };
    });

    const result = await startGoogleSSO(start, params);
    expect(result.createdSessionId).toBe("sess_recovered");
  });

  it("uses the launch link when Android recreated the screen to deliver it", async () => {
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(RETURNED);
    const signIn = makeSignIn("verified");
    const start = jest.fn().mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "dismiss" },
      signIn,
      signUp: makeSignUp(),
    });

    const result = await startGoogleSSO(start, params);
    expect(result.createdSessionId).toBe("sess_recovered");
  });

  it("creates the account for a new Google user, as Clerk's useSSO does", async () => {
    const signIn = makeSignIn("transferable");
    const signUp = makeSignUp();
    const start = jest.fn(async () => {
      urlListeners.forEach((l) => l({ url: RETURNED }));
      return {
        createdSessionId: null,
        authSessionResult: { type: "dismiss" },
        signIn,
        signUp,
      };
    });

    const result = await startGoogleSSO(start, params);
    expect(signUp.create).toHaveBeenCalledWith({ transfer: true });
    expect(result.createdSessionId).toBe("sess_new_user");
  });

  it("leaves a real dismissal alone when no redirect arrives", async () => {
    const signIn = makeSignIn("verified");
    const dismissed = {
      createdSessionId: null,
      authSessionResult: { type: "dismiss" },
      signIn,
      signUp: makeSignUp(),
    };
    const start = jest.fn().mockResolvedValue(dismissed);

    await expect(startGoogleSSO(start, params)).resolves.toBe(dismissed);
    expect(signIn.reload).not.toHaveBeenCalled();
  });

  it("ignores links that are not the sign-in redirect", async () => {
    const signIn = makeSignIn("verified");
    const start = jest.fn(async () => {
      urlListeners.forEach((l) =>
        l({
          url: "pregnancy-calculator-mobile://journal?rotating_token_nonce=x",
        }),
      );
      return {
        createdSessionId: null,
        authSessionResult: { type: "dismiss" },
        signIn,
        signUp: makeSignUp(),
      };
    });

    const result = await startGoogleSSO(start, params);
    expect(result.createdSessionId).toBeNull();
    expect(signIn.reload).not.toHaveBeenCalled();
  });

  it("surfaces a failed recovery as an error", async () => {
    const signIn = makeSignIn("verified");
    signIn.reload.mockRejectedValue(new Error("nonce expired"));
    const start = jest.fn(async () => {
      urlListeners.forEach((l) => l({ url: RETURNED }));
      return {
        createdSessionId: null,
        authSessionResult: { type: "dismiss" },
        signIn,
        signUp: makeSignUp(),
      };
    });

    await expect(startGoogleSSO(start, params)).rejects.toThrow(
      "nonce expired",
    );
    expect(urlListeners).toHaveLength(0);
  });

  it("does nothing extra on iOS, which has a native auth session", async () => {
    setOS("ios");
    (Linking.addEventListener as jest.Mock).mockClear();
    const signIn = makeSignIn("verified");
    const dismissed = {
      createdSessionId: null,
      authSessionResult: { type: "dismiss" },
      signIn,
      signUp: makeSignUp(),
    };
    const start = jest.fn().mockResolvedValue(dismissed);

    await expect(startGoogleSSO(start, params)).resolves.toBe(dismissed);
    expect(Linking.addEventListener).not.toHaveBeenCalled();
    expect(signIn.reload).not.toHaveBeenCalled();
  });
});
