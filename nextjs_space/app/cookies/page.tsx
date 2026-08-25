import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How FinanceFlow uses cookies and similar technologies.',
  alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="[DATE]"
      intro="This page explains the cookies FinanceFlow sets and what they are used for."
    >
      <LegalSection heading="What we use">
        <p>
          FinanceFlow uses a small number of cookies, all of them necessary for the application to
          function. We do not use advertising cookies.
        </p>
        <ul>
          <li>
            <strong>Session cookie.</strong> Set when you log in, so the application knows who you
            are between requests. Removing it signs you out.
          </li>
          <li>
            <strong>Security token.</strong> Used to protect sign-in and form submissions against
            cross-site request forgery.
          </li>
          <li>
            <strong>Theme preference.</strong> Remembers whether you chose the light or dark
            appearance.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Analytics and advertising">
        <p>
          [STATE WHETHER ANY ANALYTICS OR ADVERTISING TOOLS ARE IN USE. IF ANY ARE ADDED LATER, LIST
          THE PROVIDER, THE PURPOSE AND THE RETENTION PERIOD HERE, AND ADD A CONSENT MECHANISM WHERE
          REQUIRED BY LAW.]
        </p>
      </LegalSection>

      <LegalSection heading="Managing cookies">
        <p>
          Every browser lets you view and delete cookies. Because the cookies listed above are
          required for sign-in, blocking them will prevent you from using the application.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about this policy: [CONTACT EMAIL].</p>
      </LegalSection>
    </LegalPage>
  );
}
