import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How FinanceFlow handles the information you and your business put into the service.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="25 August 2026"
      intro="This policy explains what information FinanceFlow processes, why it is processed, and what control you have over it. It applies to the FinanceFlow web application and website."
    >
      <LegalSection heading="Who this policy is from">
        <p>
          FinanceFlow is operated by the entity responsible for providing the FinanceFlow service,
          referred to in this policy as &ldquo;we&rdquo; or &ldquo;us&rdquo;. If you need to reach us
          about anything in this policy, use the details published on our{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            contact page
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Information we process">
        <p>The service processes the following, all of it entered or generated through normal use:</p>
        <ul>
          <li>
            <strong>Account information.</strong> Your name, your email address, and a cryptographic
            hash of your password. We never store your password itself.
          </li>
          <li>
            <strong>Business information.</strong> The business name, country, default currency, tax
            details and address you provide when setting up your workspace.
          </li>
          <li>
            <strong>Records you create.</strong> Customers, vendors, invoices and their line items,
            income, expenses and payments, together with any notes, references and files you attach.
          </li>
          <li>
            <strong>Technical information.</strong> Standard server-side records generated when the
            application runs, such as request and error logs, used to keep the service working.
          </li>
        </ul>
        <p>
          FinanceFlow does not connect to bank accounts and never asks for banking credentials. It
          does not carry out automated profiling or automated decision-making about you.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul>
          <li>To provide the service: storing, calculating and displaying the records you create.</li>
          <li>To sign you in and keep your session secure.</li>
          <li>To generate documents you ask for, such as invoice PDFs.</li>
          <li>To keep the service secure and to investigate faults.</li>
        </ul>
        <p>
          We do not sell your information, and we do not use the records in your workspace for
          advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Information about your own customers">
        <p>
          Much of what you enter into FinanceFlow is information about other people and businesses:
          your customers and vendors. For that information you are the one who decides why and how it
          is processed, and we process it on your behalf in order to run the service.
        </p>
        <p>
          You are responsible for making sure you have the right to enter that information, that it is
          used lawfully, and that the people it relates to receive whatever notice their own local law
          requires.
        </p>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>
          Running FinanceFlow requires a small number of infrastructure providers. Each receives only
          what it needs to perform its function:
        </p>
        <ul>
          <li>
            <strong>Application hosting.</strong> A cloud hosting provider serves the application and
            processes requests.
          </li>
          <li>
            <strong>Database.</strong> A managed PostgreSQL database stores the records described
            above.
          </li>
          <li>
            <strong>File storage.</strong> Amazon S3 stores files uploaded through the service.
          </li>
          <li>
            <strong>Document conversion.</strong> Abacus AI converts invoice documents to PDF when you
            request one. The content of the invoice being converted is sent to that provider for the
            duration of the conversion.
          </li>
        </ul>
        <p>
          We do not share your records with other customers of the service. Each business workspace is
          separated from every other, and requests can only reach the workspace they were
          authenticated for.
        </p>
      </LegalSection>

      <LegalSection heading="Where information is processed">
        <p>
          Our providers operate data centres in more than one country, so your information may be
          processed outside the country you are in. Where the law that applies to you restricts such
          transfers, we rely on the safeguards those providers make available for international
          transfers.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          We keep the records in your workspace for as long as your account is open, because the
          service exists to hold them. If your account is closed, we keep information only for as long
          as we need it to meet legal or accounting obligations that apply to us, and then remove it.
        </p>
        <p>
          We have not set a fixed retention period, and we would rather say so plainly than publish a
          number we could not stand behind. If you need a specific commitment before adopting the
          service, ask us and we will confirm what we can offer.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>These are the measures actually built into the service:</p>
        <ul>
          <li>Passwords are stored only as salted cryptographic hashes, never in readable form.</li>
          <li>Sessions are carried by signed tokens, and requests without a valid one are refused.</li>
          <li>
            Every query is scoped to the workspace of the signed-in user, so one business cannot read
            or change another&rsquo;s records.
          </li>
          <li>Traffic between your browser and the service, and between the service and its database, is encrypted in transit.</li>
        </ul>
        <p>
          We hold no security certifications and make no claim to any. No online service can promise
          perfect security, and we do not.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Data protection law in many countries gives people the right to ask for a copy of their
          personal information, to have inaccurate information corrected, to have information deleted,
          to restrict or object to certain processing, and to complain to a supervisory authority.
          Which of these apply to you depends on where you live.
        </p>
        <p>
          Whatever your location, you can view and correct most of the information in your workspace
          directly in the application. For anything you cannot change yourself, contact us and we will
          respond as quickly as we reasonably can.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          FinanceFlow is a tool for businesses and is not directed at children. We do not knowingly
          create accounts for anyone below the age at which they can enter into a contract where they
          live.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          If this policy changes in a way that materially affects you, we will update the date shown at
          the top of this page and, where it matters, tell you inside the application.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
