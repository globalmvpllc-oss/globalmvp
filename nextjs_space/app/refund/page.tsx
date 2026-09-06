import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { companyInfo, companyAddressLine, companyMailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'When a CorpControl subscription can be refunded, what cancelling does, and how to cancel.',
  alternates: { canonical: '/refund' },
};

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="6 September 2026"
      intro="This page explains what happens to your money when you cancel a paid CorpControl subscription, and how to cancel one."
    >
      <LegalSection heading="Who this policy is from">
        <p>
          CorpControl is operated by <strong>{companyInfo.legalName}</strong>, a{' '}
          {companyInfo.entityType} registered in {companyInfo.address.country} at{' '}
          {companyAddressLine}. This policy applies to paid subscriptions bought through CorpControl.
        </p>
      </LegalSection>

      <LegalSection heading="Paid subscriptions are non-refundable">
        <p>
          Payments for a paid CorpControl subscription are not refunded. That includes the current
          billing period and any period already paid for.
        </p>
        <p>
          A free plan is available, and paid plans can be evaluated before you commit. The price and
          billing cycle of every plan on sale are published on the{' '}
          <Link href="/pricing" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            pricing page
          </Link>
          , and the price is shown again at checkout before anything is charged.
        </p>
      </LegalSection>

      <LegalSection heading="What cancelling does">
        <ul>
          <li>Cancelling stops the next renewal. You are not billed again after you cancel.</li>
          <li>
            Your paid features stay available until the end of the period you have already paid for.
            Nothing is switched off the moment you cancel.
          </li>
          <li>
            At the end of that period the subscription ends and the account returns to the free plan.
            Your records stay in your workspace.
          </li>
          <li>
            No pro-rata refund and no credit is given for time left unused when you cancel, and no
            refund is given for a period during which you did not use the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="How to cancel">
        <p>
          Cancellation is self-service and takes a moment:
        </p>
        <ul>
          <li>
            Sign in and open <strong>Settings &rsaquo; Billing</strong>.
          </li>
          <li>
            Choose <strong>Manage subscription</strong>. This opens the customer billing portal
            operated by our payment provider, Polar.
          </li>
          <li>
            Cancel the subscription there. The same portal holds your payment method and your
            invoices and receipts.
          </li>
        </ul>
        <p>
          The billing page reflects the change once Polar confirms it, and shows the date your paid
          access runs until.
        </p>
      </LegalSection>

      <LegalSection heading="Your statutory rights">
        <p>
          Nothing on this page removes or limits any mandatory consumer right you have under the law
          that applies to you. Where such a law gives you a right to cancel, to withdraw or to a
          refund, that right applies regardless of what this policy says, and we will honour it.
        </p>
      </LegalSection>

      <LegalSection heading="Billing problems">
        <p>
          If you believe you have been charged in error — a duplicate charge, a charge after
          cancelling, or a charge you do not recognise — tell us and we will investigate. This is
          separate from the policy above: an incorrect charge is corrected, not refused.
        </p>
      </LegalSection>

      <LegalSection heading="Questions">
        <p>
          For anything about a payment, a cancellation or this policy, email{' '}
          <a href={companyMailto} className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {companyInfo.email}
          </a>
          . Other channels are listed on our{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            contact page
          </Link>
          . The terms this policy sits under are the{' '}
          <Link href="/terms" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
