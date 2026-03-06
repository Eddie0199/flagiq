import React from "react";

const pageBackground = "#0b74ff";
const cardBackground = "rgba(255,255,255,0.96)";

function LegalLayout({ title, children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBackground,
        color: "#0f172a",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: 26,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          FlagIQ
        </header>

        <article
          style={{
            background: cardBackground,
            borderRadius: 16,
            boxShadow: "0 14px 30px rgba(15,23,42,0.22)",
            padding: "clamp(18px, 3vw, 36px)",
            lineHeight: 1.6,
            fontSize: 16,
          }}
        >
          <h1 style={{ fontSize: 32, marginTop: 0 }}>{title}</h1>
          {children}

          <hr style={{ margin: "28px 0 16px", borderColor: "rgba(15,23,42,0.12)" }} />
          <nav
            aria-label="Legal links"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontWeight: 600,
            }}
          >
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </nav>
        </article>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <p>Effective Date: January 1, 2025</p>
      <p>
        These Terms &amp; Conditions ("Terms") govern your use of the FlagIQ mobile application
        (the "App"), published by WildMoustacheGames ("we," "us," or "our"). By downloading
        or using the App, you agree to these Terms. If you do not agree, do not use the App.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old, or the minimum age required by your jurisdiction, to
        use the App. If you are between 13 and 18, you represent that you have parental consent.
      </p>

      <h2>2. License to Use</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable, revocable license to use the
        App for personal, non-commercial purposes. You may not copy, modify, distribute, sell, or
        lease any part of the App except as permitted by law.
      </p>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the App for any unlawful or unauthorized purpose;</li>
        <li>
          Reverse engineer, decompile, or attempt to extract the source code of the App except
          where permitted by applicable law;
        </li>
        <li>Interfere with or disrupt the App or servers connected to the App;</li>
        <li>Upload or transmit malicious code, malware, or other harmful content.</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        The App, including all content, features, and functionality, is owned by WildMoustacheGames
        or its licensors and is protected by copyright, trademark, and other laws. "FlagIQ" and
        associated graphics are our trademarks or registered trademarks.
      </p>

      <h2>5. In-App Purchases</h2>
      <p>
        If the App offers optional purchases, all sales are final except where refunds are
        required by applicable law or the app store&apos;s policies. You are responsible for
        reviewing the purchase terms provided by the app store.
      </p>

      <h2>6. Third-Party Services</h2>
      <p>
        The App may link to or rely on third-party services. Those services are governed by their
        own terms and privacy policies. We are not responsible for third-party content or services.
      </p>

      <h2>7. Termination</h2>
      <p>
        We may suspend or terminate your access to the App at any time if we believe you have
        violated these Terms or if required by law. You may stop using the App at any time.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The App is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, whether
        express or implied, including implied warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We do not guarantee that the App will be
        uninterrupted, secure, or error-free.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, WildMoustacheGames will not be liable for
        indirect, incidental, special, consequential, or punitive damages, or any loss of profits
        or data, arising from your use of the App. Our total liability for any claim related to
        the App is limited to the amount you paid (if any) for the App in the 12 months preceding
        the claim.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless WildMoustacheGames and its officers, directors,
        employees, and agents from any claims, damages, liabilities, and expenses arising out of
        your use of the App or violation of these Terms.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. We will update the "Effective Date" when
        changes occur. Continued use of the App after changes means you accept the updated Terms.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction where WildMoustacheGames is
        established, without regard to conflict of law principles. You agree to submit to the
        personal jurisdiction of courts in that location.
      </p>

      <h2>13. Contact Us</h2>
      <p>For questions about these Terms, contact us at:</p>
      <p>
        WildMoustacheGames
        <br />
        Email: <a href="mailto:support@wildmoustachegames.com">support@wildmoustachegames.com</a>
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p>Effective Date: January 1, 2025</p>
      <p>
        This Privacy Policy describes how WildMoustacheGames ("we," "us," or "our") collects,
        uses, and shares information when you use the FlagIQ mobile application (the "App") and
        visit our legal pages hosted at wildmoustachegames.com.
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        FlagIQ is designed as a casual, offline-friendly game. We aim to minimize the data we
        collect:
      </p>
      <ul>
        <li>
          <strong>Game progress data:</strong> Stored locally on your device to remember your
          preferences, scores, and progress.
        </li>
        <li>
          <strong>Support communications:</strong> If you contact us at{" "}
          <a href="mailto:support@wildmoustachegames.com">support@wildmoustachegames.com</a>, we
          collect the information you provide in that email so we can assist you.
        </li>
      </ul>
      <p>
        We do not knowingly collect sensitive personal information such as government identifiers,
        financial information, or precise location data.
      </p>

      <h2>2. How We Use Information</h2>
      <p>We use the information we collect solely to:</p>
      <ul>
        <li>Provide, maintain, and improve FlagIQ;</li>
        <li>Respond to support requests and communicate with you;</li>
        <li>Monitor basic app functionality (such as saving your progress).</li>
      </ul>

      <h2>3. Sharing and Disclosure</h2>
      <p>We do not sell your personal information. We only share information in these situations:</p>
      <ul>
        <li>
          <strong>Service providers:</strong> Vendors that help us operate the App (for example,
          cloud hosting) may process data on our behalf under confidentiality obligations.
        </li>
        <li>
          <strong>Legal compliance:</strong> If required to comply with applicable law, regulation,
          legal process, or governmental request; to enforce our Terms &amp; Conditions; or to
          protect the rights, property, or safety of WildMoustacheGames, our users, or others.
        </li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        Game progress data remains on your device unless you delete the App or your device
        storage. Support communications are retained only as long as necessary to resolve your
        inquiry or as required by law.
      </p>

      <h2>5. Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards to protect
        information. No method of transmission or storage is completely secure, and we cannot
        guarantee absolute security.
      </p>

      <h2>6. Children&apos;s Privacy</h2>
      <p>
        FlagIQ is not directed to children under 13. We do not knowingly collect personal
        information from children under 13. If you believe a child has provided us information,
        contact us so we can delete it.
      </p>

      <h2>7. International Users</h2>
      <p>
        Your information may be processed in countries other than your own. These countries may
        have data protection laws that differ from those in your jurisdiction.
      </p>

      <h2>8. Your Choices</h2>
      <ul>
        <li>
          <strong>Local data:</strong> You can delete local game data by removing the App from your
          device.
        </li>
        <li>
          <strong>Communications:</strong> To update or delete support communications, email us at{" "}
          <a href="mailto:support@wildmoustachegames.com">support@wildmoustachegames.com</a>.
        </li>
      </ul>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will update the "Effective Date"
        above when changes are made. Continued use of the App after an update means you accept the
        revised policy.
      </p>

      <h2>10. Contact Us</h2>
      <p>If you have questions or concerns about this Privacy Policy or our data practices, contact us at:</p>
      <p>
        WildMoustacheGames
        <br />
        Email: <a href="mailto:support@wildmoustachegames.com">support@wildmoustachegames.com</a>
      </p>
    </>
  );
}

export default function LegalPage({ page }) {
  if (page === "terms") {
    return (
      <LegalLayout title="Terms & Conditions">
        <TermsContent />
      </LegalLayout>
    );
  }

  return (
    <LegalLayout title="Privacy Policy">
      <PrivacyContent />
    </LegalLayout>
  );
}
