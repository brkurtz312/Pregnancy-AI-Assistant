import { useState, type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePass } from "@/hooks/use-pass";
import { useToast } from "@/hooks/use-toast";

function redeemErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429)
      return "Too many attempts. Please wait a few minutes and try again.";
    if (err.status === 503) return "Code redemption isn't available right now.";
  }
  return "That access code isn't valid.";
}

export function RedeemCodeDialog({ trigger }: { trigger: ReactNode }) {
  const { redeemCode, isRedeeming } = usePass();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter an access code.");
      return;
    }
    setError(null);
    try {
      await redeemCode(trimmed);
      setOpen(false);
      setCode("");
      toast({
        title: "Full Pass unlocked",
        description: "You now have unlimited access on this account.",
      });
    } catch (err) {
      setError(redeemErrorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="dialog-redeem-code">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Redeem an access code
          </DialogTitle>
          <DialogDescription>
            Enter a developer access code to unlock the Full Pregnancy Pass on
            your account — no payment required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="redeem-code">Access code</Label>
            <Input
              id="redeem-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter your code"
              autoComplete="off"
              autoFocus
              data-testid="input-redeem-code"
            />
            {error ? (
              <p
                className="text-sm text-destructive"
                data-testid="text-redeem-error"
              >
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isRedeeming}
              className="rounded-full"
              data-testid="button-submit-redeem"
            >
              {isRedeeming ? "Redeeming…" : "Unlock access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
