import { Link } from "wouter";

/**
 * Privacy policy for the app and this website.
 *
 * App Store Connect's Privacy Policy URL points here
 * (https://pregnancy-assistant.com/privacy). It must agree with the App Privacy
 * answers recorded in docs/app-privacy.md and with what the code actually
 * stores and sends. Change all three together, and update EFFECTIVE_DATE.
 */

export const EFFECTIVE_DATE = "November 11, 2026";
export const PRIVACY_EMAIL = "privacy@brk-services.com";
/** The legal entity, as registered with Apple. Not PLLC. */
export const COMPANY_NAME = "BRK Services LLC";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl font-bold text-[#2d1f1a] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[#4a3530] leading-relaxed">{children}</div>
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-2">{children}</ul>;
}

export default function PrivacyPage() {
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
        <h1 className="font-serif text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#8a6055]">
          Pregnancy AI Assistant by {COMPANY_NAME} · Effective {EFFECTIVE_DATE}
        </p>

        <div className="mt-8 rounded-2xl border border-[#e8d5c8] bg-white p-5 text-[#4a3530] leading-relaxed">
          <p className="font-semibold text-[#2d1f1a] mb-2">In short</p>
          <List>
            <li>
              If you create an account, what you log in the app (your due date,
              symptoms, kick counts, journal and similar) is stored on our
              server so it follows you to every device you sign in on.
            </li>
            <li>
              We use it only to run the app. We do not sell it, show ads, or
              track you across other apps and websites.
            </li>
            <li>
              Photos, videos and heart rate recordings stay on your phone.
            </li>
            <li>
              You can delete your account, and everything we store with it, from
              inside the app at any time.
            </li>
          </List>
        </div>

        <Section title="Who we are">
          <p>
            This policy covers the Pregnancy AI Assistant app for iPhone and
            Apple Watch and the website at pregnancy-assistant.com (together,
            "the app"), provided by {COMPANY_NAME} ("we", "us"). Questions and
            requests about your data go to{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="text-[#c96b6b] underline"
            >
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="What we collect, and why">
          <p>
            <strong>Your account.</strong> Your email address, and your name if
            you sign in with Apple or Google, so you can sign in and keep your
            data across devices.
          </p>
          <p>
            <strong>Your profile.</strong> What you choose to enter: first name,
            ZIP code, due date and how it was worked out, delivery date,
            pre-pregnancy weight, and your care provider's and hospital's names,
            phone numbers and addresses.
          </p>
          <p>
            <strong>Health information you log.</strong> Symptoms, kick counts,
            contractions (including those recorded on Apple Watch), prenatal
            visit notes such as weight, blood pressure and fetal heart rate,
            your birth plan, hospital bag checklist, and journal entries with
            their mood. These are stored so the app can show you your history
            and keep it in step across your devices.
          </p>
          <p>
            <strong>Support people.</strong> The first name, role and phone
            number of anyone you add as a support contact.
          </p>
          <p>
            <strong>Questions you ask the AI assistant.</strong> Your question,
            the recent conversation and your week of pregnancy are sent to our
            AI provider to produce an answer. We do not keep the questions or
            answers on our server; we keep only a count of how many you have
            asked this week, to apply the free weekly limit.
          </p>
          <p>
            <strong>Your purchase.</strong> Whether you have bought the Full
            Pregnancy Pass, and when, so we can unlock it on every device.
            Payment itself is handled by Apple; we never see your card details.
          </p>
          <p>
            <strong>Anonymous usage counts.</strong> We count a few steps, such
            as opening the Full Pregnancy Pass screen or a purchase being
            cancelled, to find out where buying the Pass goes wrong. These
            counts record only the step, whether you were signed in, your device
            type (iPhone, Android or web) and app version. They contain no name,
            email, account, device identifier or IP address and cannot be linked
            to you.
          </p>
          <p>
            <strong>IP addresses.</strong> If you ask the AI assistant without
            signing in, we use your IP address to apply the free weekly question
            limit. IP addresses are also used briefly to limit how often any one
            connection can call our server, and may appear in our server logs,
            to protect the service from abuse.
          </p>
        </Section>

        <Section title="What stays on your phone">
          <List>
            <li>Photos and videos you attach to journal entries.</li>
            <li>Fetal heart rate recordings.</li>
            <li>
              Your location. When you allow it, the app checks on your phone
              whether you are at your care provider's office or hospital. Your
              location is never sent to us or anyone else. To make that check,
              the app looks up your provider's and hospital's addresses (not
              yours) with OpenStreetMap.
            </li>
            <li>
              Anything you enter while not signed in, apart from questions to
              the AI assistant.
            </li>
          </List>
        </Section>

        <Section title="Services that handle data for us">
          <p>
            We share data only with the companies that run parts of the app for
            us, and only what each needs:
          </p>
          <List>
            <li>
              <strong>Clerk</strong> — sign-in and account management (your
              email and name).
            </li>
            <li>
              <strong>Railway</strong> — hosts our server and database, where
              the information above is stored.
            </li>
            <li>
              <strong>Cloudflare</strong> — delivers our website and protects it
              from attacks; it sees your IP address as traffic passes through.
            </li>
            <li>
              <strong>Anthropic</strong> — generates the AI assistant's answers
              from the questions you send.
            </li>
            <li>
              <strong>RevenueCat</strong> and <strong>Apple</strong> — process
              and verify in-app purchases.
            </li>
            <li>
              <strong>OpenStreetMap</strong> — turns your provider's and
              hospital's addresses into map coordinates, as described above.
            </li>
          </List>
          <p>
            Each handles data under its own privacy policy. We do not sell your
            data, share it for advertising, or use it to track you.
          </p>
        </Section>

        <Section title="Keeping and deleting your data">
          <p>
            We keep your account data until you delete your account. To delete
            it, open the app, tap the account icon, and choose{" "}
            <strong>Delete Account</strong>. That immediately and permanently
            erases your profile, health logs, journal, support contacts and
            question counts from our server, and removes your sign-in account.
          </p>
          <p>
            Records of a purchase are kept by Apple and RevenueCat as part of
            the transaction, under their policies. Anonymous usage counts are
            not linked to you, so they are unaffected.
          </p>
          <p>
            You can see and change what you have entered at any time in the app.
            For anything else, including a copy of your data, write to{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="text-[#c96b6b] underline"
            >
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="Security">
          <p>
            Everything sent between the app and our server is encrypted in
            transit. Access to the database is restricted to the systems that
            run the app. No system is perfectly secure, but we work to protect
            your information and limit what we hold.
          </p>
        </Section>

        <Section title="Medical information">
          <p>
            The app offers general education, not medical advice. What you log
            is for your own use and is not a medical record. Always talk to your
            healthcare provider about your care.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The app is meant for adults who are pregnant or supporting someone
            who is. It is not directed at children under 13, and we do not
            knowingly collect their information. If you believe a child has
            given us information, contact us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If what we collect or how we use it changes, we will update this
            page and its effective date before the change takes effect.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {COMPANY_NAME} ·{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="text-[#c96b6b] underline"
            >
              {PRIVACY_EMAIL}
            </a>
          </p>
        </Section>
      </main>
    </div>
  );
}
