import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, ClerkLoaded } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PassProvider } from "@/hooks/use-pass";
import NotFound from "@/pages/not-found";
import CalculatorPage from "@/pages/calculator";
import LandingPage from "@/pages/landing";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// The same wiring runs in dev and prod: env vars are empty in dev and
// auto-populated in prod. Do not gate these on NODE_ENV / import.meta.env.PROD.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "hsl(340 65% 55%)",
    colorForeground: "hsl(340 15% 15%)",
    colorMutedForeground: "hsl(340 15% 45%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(340 15% 15%)",
    colorNeutral: "hsl(340 15% 15%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    formButtonPrimary:
      "bg-[hsl(340_65%_55%)] hover:bg-[hsl(340_65%_48%)] text-white",
    footerActionLink: "text-[hsl(340_65%_55%)] hover:text-[hsl(340_65%_45%)]",
  },
};

// Card sizing is scoped to the sign-in / sign-up pages only. Applying it
// globally also cramps the "Manage account" (UserProfile) modal, which needs
// its own wider, natural-height layout.
const authCardAppearance = {
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "w-[26rem] max-w-full rounded-2xl border border-[hsl(340_15%_88%)] shadow-xl overflow-hidden",
  },
};

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const Component = mode === "sign-in" ? SignIn : SignUp;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <ClerkLoaded>
        <Component
          routing="path"
          path={`${basePath}/${mode}`}
          signInUrl={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={`${basePath}/app`}
          appearance={authCardAppearance}
        />
      </ClerkLoaded>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/app" component={CalculatorPage} />
      <Route path="/sign-in/*?">{() => <AuthPage mode="sign-in" />}</Route>
      <Route path="/sign-up/*?">{() => <AuthPage mode="sign-up" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
    >
      <QueryClientProvider client={queryClient}>
        <PassProvider>
          <TooltipProvider>
            <WouterRouter base={basePath}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </PassProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
