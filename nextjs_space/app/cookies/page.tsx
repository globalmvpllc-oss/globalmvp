import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { companyInfo, companyAddressLine, companyMailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'The cookies CorpControl sets, what each one does, and what happens if you block them.',
  alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="25 August 2026"
      intro="This page lists every cookie CorpControl sets and explains what each one is for. The list is short, because the service only uses cookies it needs in order to work."
    >
      <LegalSection heading="Cookies we set">
        <p>
          All of the cookies below are strictly necessary: they are what makes signing in possible,
          what keeps that sign-in secure, and what remembers a preference you set yourself. They are
          set by the application itself, not by anyone else.
        </p>
        <ul>
          <li>
            <strong>Session cookie.</strong> Created when you sign in and holds your signed session
            token. It is what tells the application, on each request, that you are you. Deleting it
            signs you out.
          </li>
          <li>
            <strong>CSRF token cookie.</strong> Set on the sign-in and sign-out forms. It protects
            those forms against cross-site request forgery, where another site tries to submit a
            request as you.
          </li>
          <li>
            <strong>Callback URL cookie.</strong> Short-lived. It remembers the page you were trying to
            reach when you were asked to sign in, so you can be returned there afterwards.
          </li>
          <li>
            <strong>Language cookie.</strong> Records the language you pick in the language selector,
            so the site and the application stay in that language on your next visit. It holds nothing
            but a language code, it is set only when you choose a language, and blocking it simply
            means the site opens in English each time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we do not use">
        <p>
          CorpControl sets <strong>no analytics cookies, no advertising cookies and no tracking
          pixels</strong>. There is no Google Analytics, no advertising network and no social media
          tracker in the application. Nobody outside the service is given the ability to set a cookie
          through it.
        </p>
        <p>
          Because every cookie we set is strictly necessary for a service you asked for, no consent
          banner is presented. If analytics or similar tools are added in future, this page will be
          updated first and consent will be requested where the law requires it.
        </p>
      </LegalSection>

      <LegalSection heading="Other browser storage">
        <p>
          Your choice of light or dark appearance is kept in your browser&rsquo;s local storage rather
          than in a cookie. It never leaves your device and is not sent to the service with your
          requests. Clearing your browser&rsquo;s site data resets it to the default.
        </p>
      </LegalSection>

      <LegalSection heading="Managing cookies">
        <p>
          Every browser lets you view, block and delete cookies through its settings. Because the
          cookies listed above are what carry your sign-in, blocking or deleting them will sign you out
          and prevent you from using the application until they are allowed again.
        </p>
      </LegalSection>

      <LegalSection heading="More information">
        <p>
          The cookies described here are set by <strong>{companyInfo.legalName}</strong>, a{' '}
          {companyInfo.entityType} registered in {companyInfo.address.country} at{' '}
          {companyAddressLine}, which operates CorpControl.
        </p>
        <p>
          For how information is handled once you are signed in, see the{' '}
          <Link href="/privacy" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Privacy Policy
          </Link>
          . For questions about this page, email{' '}
          <a href={companyMailto} className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {companyInfo.email}
          </a>{' '}
          or use our{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
