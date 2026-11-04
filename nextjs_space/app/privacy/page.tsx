import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/lib/i18n/metadata';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { companyInfo, companyAddressLine, companyMailto } from '@/lib/site';

// Title and description follow the visitor's language.
export function generateMetadata(): Metadata {
  return localizedPageMetadata({
    titleKey: 'meta.privacyTitle',
    descriptionKey: 'meta.privacyDescription',
    canonical: '/privacy',
  });
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="25 August 2026"
      intro="This policy explains what information CorpControl processes, why it is processed, and what control you have over it. It applies to the CorpControl web application and website."
    >
      <LegalSection heading="Who this policy is from">
        <p>
          CorpControl is operated by <strong>{companyInfo.legalName}</strong>, a{' '}
          {companyInfo.entityType} registered in {companyInfo.address.country} at{' '}
          {companyAddressLine}. {companyInfo.legalName} is the controller of the personal information
          described here and is referred to in this policy as &ldquo;we&rdquo; or &ldquo;us&rdquo;.
        </p>
        <p>
          You can reach us at{' '}
          <a href={companyMailto} className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {companyInfo.email}
          </a>{' '}
          or on {companyInfo.phone}. Every published channel is listed on our{' '}
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
          CorpControl does not connect to bank accounts and never asks for banking credentials. It
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
        <p>
          We do advertise the product itself, on Google and on Meta (Facebook and Instagram). If you
          allow it, Google Ads, Google Analytics 4 and the Meta Pixel measure which advert brought you
          here and whether that visit led to a sign-up or a purchase. They receive a plan name, an
          amount, a currency and an order id, never your name, email address or phone number, and
          nothing from inside your workspace. Nothing is loaded from Google or Meta unless you have
          consented. <strong>REVIEW REQUIRED.</strong> What is set, for how long, and how to change your answer is in the{' '}
          <Link href="/cookies" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Information about your own customers">
        <p>
          Much of what you enter into CorpControl is information about other people and businesses:
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
          Running CorpControl requires a small number of infrastructure providers. Each receives only
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
          CorpControl is a tool for businesses and is not directed at children. We do not knowingly
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
