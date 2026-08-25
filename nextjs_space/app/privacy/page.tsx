import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How FinanceFlow collects, uses and protects your business data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="[DATE]"
      intro="This policy explains what data FinanceFlow collects, why it is collected and what choices you have. It applies to the FinanceFlow web application and website."
    >
      <LegalSection heading="Who we are">
        <p>
          FinanceFlow is operated by [LEGAL ENTITY NAME], registered at [REGISTERED ADDRESS],
          company registration number [REGISTRATION NUMBER]. For any privacy question, contact us at
          [CONTACT EMAIL].
        </p>
      </LegalSection>

      <LegalSection heading="Data we collect">
        <ul>
          <li><strong>Account data.</strong> Your name, email address and a hashed password.</li>
          <li><strong>Business data.</strong> Business name, country, default currency, tax details and address that you enter during setup.</li>
          <li><strong>Financial records.</strong> Customers, vendors, invoices, invoice line items, income, expenses and payments that you create.</li>
          <li><strong>Technical data.</strong> Standard server logs generated when you use the service, such as request times and error records.</li>
        </ul>
        <p>We do not connect to your bank and never ask for banking credentials.</p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul>
          <li>To provide the service: storing and displaying the records you create.</li>
          <li>To authenticate you and keep your session secure.</li>
          <li>To diagnose faults and keep the service running reliably.</li>
        </ul>
        <p>We do not sell your data and we do not use your financial records for advertising.</p>
      </LegalSection>

      <LegalSection heading="Legal basis">
        <p>
          Where [APPLICABLE LAW] applies, we process account and business data to perform our
          contract with you, and technical data on the basis of our legitimate interest in operating
          a secure and reliable service.
        </p>
      </LegalSection>

      <LegalSection heading="Where data is stored">
        <p>
          Application data is stored in a managed PostgreSQL database hosted by [DATABASE PROVIDER]
          in [REGION]. The application is hosted by [HOSTING PROVIDER]. Data is transmitted over
          encrypted connections.
        </p>
      </LegalSection>

      <LegalSection heading="Sharing">
        <p>
          We share data only with the infrastructure providers required to run the service (hosting,
          database and, where you use it, document generation and file storage). We do not share your
          records with other customers. Each business account is isolated from every other.
        </p>
      </LegalSection>

      <LegalSection heading="Retention">
        <p>
          We keep your data for as long as your account is active. [DESCRIBE RETENTION PERIOD AFTER
          ACCOUNT CLOSURE.]
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export or delete
          your data, and to object to certain processing. To exercise any of these, contact
          [CONTACT EMAIL]. We will respond within [RESPONSE PERIOD].
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes materially we will update the date at the top of this page and,
          where appropriate, notify you in the application.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
