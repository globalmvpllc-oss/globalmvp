import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'KVKK Notice',
  description:
    'Information notice for data subjects under Turkish Personal Data Protection Law No. 6698 (KVKK).',
  alternates: { canonical: '/kvkk' },
};

export default function KvkkPage() {
  return (
    <LegalPage
      title="KVKK Information Notice"
      updated="[DATE]"
      intro="This notice is provided under Article 10 of Turkish Personal Data Protection Law No. 6698 (KVKK) for data subjects in Türkiye."
    >
      <LegalSection heading="Data controller">
        <p>
          The data controller is [LEGAL ENTITY NAME], registered at [REGISTERED ADDRESS], Mersis /
          registration number [REGISTRATION NUMBER], contact [CONTACT EMAIL]. [STATE WHETHER THE
          CONTROLLER IS REGISTERED WITH VERBIS AND, IF SO, THE REGISTRATION NUMBER.]
        </p>
      </LegalSection>

      <LegalSection heading="Personal data processed">
        <ul>
          <li><strong>Identity data:</strong> name.</li>
          <li><strong>Contact data:</strong> email address, and any phone or address you enter for your business.</li>
          <li><strong>Customer transaction data:</strong> invoices, payments, income and expense records you create.</li>
          <li><strong>Transaction security data:</strong> hashed password and session records.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Purposes of processing">
        <ul>
          <li>Delivering and operating the FinanceFlow service.</li>
          <li>Establishing and maintaining your account and session security.</li>
          <li>Fulfilling contractual and legal obligations.</li>
          <li>Diagnosing faults and maintaining service continuity.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Legal grounds">
        <p>
          Processing is carried out under Article 5/2(c) of the KVKK, as it is directly necessary for
          the performance of a contract, and Article 5/2(f), the legitimate interests of the data
          controller, provided the fundamental rights of the data subject are not harmed.
        </p>
      </LegalSection>

      <LegalSection heading="Transfer abroad">
        <p>
          Application and database infrastructure is provided by [HOSTING PROVIDER] and [DATABASE
          PROVIDER], with servers located in [REGION]. Where this involves transfer of personal data
          abroad, it is carried out in accordance with Article 9 of the KVKK. [DESCRIBE THE
          APPLICABLE TRANSFER MECHANISM.]
        </p>
      </LegalSection>

      <LegalSection heading="Your rights under Article 11">
        <p>As a data subject you have the right to:</p>
        <ul>
          <li>learn whether your personal data is processed;</li>
          <li>request information about the processing;</li>
          <li>learn the purpose of processing and whether data is used accordingly;</li>
          <li>know the third parties to whom data is transferred, at home or abroad;</li>
          <li>request correction of incomplete or inaccurate data;</li>
          <li>request erasure or destruction under the conditions of Article 7;</li>
          <li>object to a result produced solely by automated analysis;</li>
          <li>claim compensation for damage arising from unlawful processing.</li>
        </ul>
        <p>
          Applications may be submitted in writing to [REGISTERED ADDRESS] or to [CONTACT EMAIL]. We
          respond within thirty days at the latest.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
