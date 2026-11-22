import { Link } from "wouter";
import { COMPANY_NAME, List, PRIVACY_EMAIL, Section } from "@/pages/privacy";

/**
 * How to delete an account, with or without the app.
 *
 * Google Play's Data safety form requires a web page where people can ask for
 * their account to be deleted without reinstalling the app; its account
 * deletion URL points here (https://pregnancy-assistant.com/delete-account).
 * Play expects the page to name the app and developer, give the steps, and
 * say what is deleted, what is kept and for how long. Keep it in step with
 * the privacy page and with lib/account-deletion.ts on the server.
 */

/** How long an emailed request may take. Stated on the page; keep it true. */
export const EMAIL_REQUEST_DAYS = 30;

export default function DeleteAccountPage() {
  const mailto = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
    "Delete my account",
  )}`;

  return (
    <div className="min-h-screen bg-[#fdf6f0] text-[#2d1f1a]">
      <header className="border-b border-[#e8d5c8]">
        <div className="max-w-3xl mx-auto flex items-center px-4 py-4 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            data-testid="link-home"
          >
            <div className="w-9 h-9 rounded-2xl bg-[#c96b6b] flex items-center justify-center shrink-0">
              <span className="text-lg leading-none">🌸</span>
            </div>
            <span className="font-serif text-lg font-bold tracking-tight">
              Pregnancy Assistant
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-10">
        <h1 className="font-serif text-4xl font-bold">Delete your account</h1>
        <p className="mt-2 text-sm text-[#8a6055]">
          Pregnancy AI Assistant by {COMPANY_NAME}
        </p>

        <Section title="In the app (fastest)">
          <p>On iPhone or Android:</p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>Open Pregnancy AI Assistant and sign in.</li>
            <li>Tap the account icon at the top right.</li>
            <li>
              Tap <strong>Delete Account</strong>, then{" "}
              <strong>Permanently Delete Account</strong>.
            </li>
          </ol>
          <p>Your account and data are deleted straight away.</p>
        </Section>

        <Section title="Without the app">
          <p>
            Email{" "}
            <a href={mailto} className="text-[#c96b6b] underline">
              {PRIVACY_EMAIL}
            </a>{" "}
            from the email address you sign in with, with the subject "Delete my
            account". We will delete your account within {EMAIL_REQUEST_DAYS}{" "}
            days and reply to confirm. If you write from a different address, we
            will ask you to confirm the request from your sign-in address first,
            so no one can delete your account but you.
          </p>
        </Section>

        <Section title="What is deleted">
          <List>
            <li>
              Your sign-in account, including your email address and name.
            </li>
            <li>
              Your profile: due date, ZIP code, weight, and your care provider's
              and hospital's details.
            </li>
            <li>
              Everything you have logged: symptoms, kick counts, contractions,
              prenatal visits, birth plan, hospital bag checklist and journal
              entries.
            </li>
            <li>Your support contacts.</li>
            <li>Your count of AI assistant questions.</li>
          </List>
          <p>
            Photos, videos and heart rate recordings are kept only on your
            phone, so we never had them. They are removed when you delete them
            or uninstall the app.
          </p>
        </Section>

        <Section title="What is kept">
          <List>
            <li>
              Records of a Full Pregnancy Pass purchase, kept by Apple or Google
              Play and by RevenueCat as part of the transaction, under their
              policies.
            </li>
            <li>
              Anonymous usage counts, which contain nothing that identifies you.
            </li>
            <li>
              Server logs, which may briefly include your IP address and are
              deleted automatically as they age.
            </li>
          </List>
          <p>
            Deleting your account does not refund a purchase. Uninstalling the
            app does not delete your account.
          </p>
        </Section>

        <p className="mt-10 text-[#4a3530]">
          See the{" "}
          <Link href="/privacy" className="text-[#c96b6b] underline">
            privacy policy
          </Link>{" "}
          for more about what we collect and why.
        </p>
      </main>
    </div>
  );
}
