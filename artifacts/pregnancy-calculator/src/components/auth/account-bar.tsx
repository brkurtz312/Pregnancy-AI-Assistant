import { Show, UserButton } from "@clerk/react";
import { Link } from "wouter";
import { Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePass } from "@/hooks/use-pass";

export function AccountBar() {
  const {
    hasPass,
    freeRemaining,
    freeLimit,
    startCheckout,
    isStartingCheckout,
  } = usePass();

  return (
    <div
      className="flex items-center justify-end gap-2.5"
      data-testid="account-bar"
    >
      <Show when="signed-in">
        {hasPass ? (
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/10 text-primary py-1.5 px-3 rounded-full font-medium"
            data-testid="badge-pass-active"
          >
            <Crown className="w-3.5 h-3.5" />
            Full Pass
          </Badge>
        ) : (
          <>
            <Badge
              variant="outline"
              className="border-primary/30 text-primary/80 py-1.5 px-3 rounded-full font-normal hidden sm:inline-flex"
              data-testid="badge-free-remaining"
            >
              {freeRemaining}/{freeLimit} free questions left
            </Badge>
            <Button
              size="sm"
              onClick={startCheckout}
              disabled={isStartingCheckout}
              className="gap-1.5 rounded-full"
              data-testid="button-unlock-pass"
            >
              <Sparkles className="w-4 h-4" />
              Unlock Pass
            </Button>
          </>
        )}
        <UserButton />
      </Show>

      <Show when="signed-out">
        <Button asChild variant="ghost" size="sm" data-testid="button-sign-in">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button
          asChild
          size="sm"
          className="rounded-full"
          data-testid="button-sign-up"
        >
          <Link href="/sign-up">Get started</Link>
        </Button>
      </Show>
    </div>
  );
}
