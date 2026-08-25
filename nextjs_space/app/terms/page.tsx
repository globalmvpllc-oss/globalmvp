import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you use FinanceFlow.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="[DATE]"
      intro="These terms govern your use of FinanceFlow. By creating an account you agree to them."
    >
      <LegalSection heading="The service">
        <p>
          FinanceFlow is a web application for recording and reviewing business financial
          information: customers, vendors, invoices, income, expenses and payments. It is a
          record-keeping tool. It is not accounting, tax or legal advice, and it does not file
          anything on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <ul>
          <li>You must provide accurate information when registering.</li>
          <li>You are responsible for keeping your password confidential.</li>
          <li>You are responsible for activity that happens under your account.</li>
          <li>You must be legally able to enter into a contract in your jurisdiction.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use FinanceFlow to:</p>
        <ul>
          <li>break any applicable law or regulation;</li>
          <li>store data you have no right to store;</li>
          <li>attempt to access another customer&rsquo;s data;</li>
          <li>disrupt, overload or probe the service or its infrastructure.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your data">
        <p>
          The records you enter remain yours. We process them to provide the service, as described in
          the Privacy Policy. You are responsible for the accuracy of what you record and for meeting
          your own invoicing, tax and accounting obligations.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We aim to keep the service available but do not guarantee uninterrupted operation.
          Maintenance, third-party outages and factors outside our control may cause downtime.
          [DESCRIBE ANY SERVICE LEVEL COMMITMENT, OR STATE THAT NONE IS OFFERED.]
        </p>
      </LegalSection>

      <LegalSection heading="Fees">
        <p>
          [DESCRIBE PAID PLANS, BILLING CYCLE, RENEWAL, REFUND AND CANCELLATION TERMS ONCE PRICING IS
          FINALISED.] Where a free tier is offered, its limits are described in the application.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the service at any time. We may suspend or close an account that
          breaches these terms. [DESCRIBE DATA EXPORT WINDOW AFTER TERMINATION.]
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          To the extent permitted by [APPLICABLE LAW], FinanceFlow is provided as is, and our
          liability is limited to [LIABILITY CAP]. We are not liable for indirect or consequential
          loss, including lost profits or lost data, except where the law does not allow that
          limitation.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>These terms are governed by the laws of [JURISDICTION], with courts of [VENUE] having jurisdiction.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about these terms: [CONTACT EMAIL].</p>
      </LegalSection>
    </LegalPage>
  );
}
