import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { companyInfo, companyAddressLine, companyMailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you use CorpControl.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="25 August 2026"
      intro={`These terms form the agreement between you and ${companyInfo.legalName}, the provider of CorpControl. By creating an account or using the service, you accept them.`}
    >
      <LegalSection heading="Who we are">
        <p>
          CorpControl is provided by <strong>{companyInfo.legalName}</strong>, a{' '}
          {companyInfo.entityType} registered in {companyInfo.address.country} at{' '}
          {companyAddressLine}. &ldquo;We&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; in these
          terms mean {companyInfo.legalName}.
        </p>
        <p>
          Email{' '}
          <a href={companyMailto} className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {companyInfo.email}
          </a>{' '}
          or call {companyInfo.phone}.
        </p>
      </LegalSection>

      <LegalSection heading="What CorpControl is">
        <p>
          CorpControl is a software tool for recording and reviewing business finances: customers,
          vendors, invoices, income, expenses, payments, a dashboard, reports and a calendar of due
          dates.
        </p>
        <p>
          <strong>
            It is a record-keeping tool and nothing more. It is not an accountant, a bookkeeper, a tax
            advisor, a financial advisor or a legal advisor.
          </strong>{' '}
          It does not give advice, does not file anything with any authority, and does not check
          whether your records satisfy the rules that apply to you. Every financial, tax, accounting
          and legal decision remains yours, and you should take professional advice where you need it.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <p>
          You may use CorpControl only if you can form a binding contract where you live, and only for
          business purposes. If you create an account for an organisation, you confirm that you are
          authorised to accept these terms for it.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <ul>
          <li>Give accurate information when you register and keep it current.</li>
          <li>Keep your password confidential and do not share your login.</li>
          <li>You are responsible for everything done through your account.</li>
          <li>Tell us promptly if you believe someone else has gained access to it.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>use the service in breach of any law that applies to you;</li>
          <li>store information you have no right to store, or use it unlawfully;</li>
          <li>attempt to reach another customer&rsquo;s workspace or data;</li>
          <li>probe, scan, overload or interfere with the service or the systems behind it;</li>
          <li>copy, resell or redistribute the service, or reverse engineer it, except where the law says you may;</li>
          <li>use the service to produce documents intended to deceive, such as invoices for transactions that did not happen.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your data and your records">
        <p>
          The records you enter stay yours. We claim no ownership over them. We process them to run the
          service, as described in the{' '}
          <Link href="/privacy" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          You are responsible for the accuracy and completeness of what you record, and for meeting
          your own invoicing, tax and accounting obligations. Totals, statuses and reports in the
          service are calculated from what you enter; they are only as correct as the underlying
          entries.
        </p>
        <p>
          Keep your own copies of anything you are required to retain. We are not a substitute for your
          records archive.
        </p>
      </LegalSection>

      <LegalSection heading="Invoices and financial documents">
        <p>
          Documents produced by the service, including invoice PDFs, are generated from the data you
          supply. Whether such a document meets the invoicing, numbering, tax or archiving rules of
          your jurisdiction is for you to determine. The service does not certify compliance with any
          national invoicing or e-invoicing regime.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The service itself, including its software, interface, design and branding, belongs to us or
          our licensors. These terms grant you a limited, non-exclusive, non-transferable right to use
          the service while your account is active, and nothing more.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          CorpControl relies on third-party infrastructure for hosting, storage, database and document
          conversion. Those providers have their own terms, and outages or changes on their side can
          affect the service. We are not responsible for the acts or omissions of third parties beyond
          our reasonable control.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We work to keep the service running, but we do not guarantee uninterrupted or error-free
          operation and we offer no service level commitment. Maintenance, upstream provider outages
          and events beyond our control can all cause downtime. We may change, suspend or withdraw
          features, and where a change is significant we will give reasonable notice if circumstances
          allow.
        </p>
      </LegalSection>

      <LegalSection heading="Fees, renewal and cancellation">
        <p>
          A free plan is available, and paid plans are offered alongside it. The plans currently on
          sale, what each one includes and the price and billing cycle of each are published on the{' '}
          <Link href="/pricing" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            pricing page
          </Link>
          . The price shown at checkout is the price charged, and nothing is charged before you
          complete checkout.
        </p>
        <p>
          Payments are taken by our payment provider, Polar, which handles the checkout, the payment
          method and the billing history. We do not receive or store your card details.
        </p>
        <p>
          A paid subscription renews automatically at the end of each billing period, at the price
          then published for your plan, until you cancel it. You can cancel at any time from{' '}
          <strong>Settings &rsaquo; Billing</strong>, which opens the customer billing portal.
          Cancelling stops the next renewal; your paid features stay available until the end of the
          period you have already paid for.
        </p>
        <p>
          Refund terms are set out in our{' '}
          <Link href="/refund" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Refund Policy
          </Link>
          . If we change the price of a plan, the change applies from your next renewal and we will
          tell you before it takes effect.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          To the extent the law allows, the service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without warranties of any kind, whether express or implied, including
          implied warranties of merchantability, fitness for a particular purpose and non-infringement.
          We do not warrant that the service will meet your requirements, that it will be
          uninterrupted, or that calculations derived from your entries will satisfy any particular
          legal or accounting standard.
        </p>
        <p>Nothing here excludes a liability that cannot lawfully be excluded.</p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by the law that applies to you, we are not liable for
          indirect, incidental, special or consequential loss, or for lost profits, lost revenue, lost
          business or lost or corrupted data, however caused.
        </p>
        <p>
          Where liability cannot be excluded, our total liability for all claims arising in any twelve
          month period is limited to the amount you paid for the service in that period. If you paid
          nothing, our liability is limited to the extent the law permits.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You can stop using the service at any time. We may suspend or close an account that breaches
          these terms, that is used unlawfully, or that puts the service or other customers at risk.
        </p>
        <p>
          Export anything you need before closing your account. After closure we handle remaining
          information as described in the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms. The date at the top of this page shows the current version, and we
          will give notice in the application where a change materially affects your rights. Continuing
          to use the service after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the law applicable at the place where the provider of the service
          is established, and the courts of that place have jurisdiction over disputes arising from
          them. This does not remove any protection given to you by mandatory law in your own country
          of residence, and does not prevent you from bringing a claim before a court there where that
          law gives you the right to do so.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          For questions about these terms, email{' '}
          <a href={companyMailto} className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {companyInfo.email}
          </a>{' '}
          or use the details on our{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
