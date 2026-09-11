import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { CookieSettingsLink } from '@/components/cookie-settings-link';
import { companyInfo, companyAddressLine, companyMailto, siteConfig } from '@/lib/site';
import { getServerLocale } from '@/lib/i18n/server';
import { CONSENT_COOKIE, GOOGLE_ADS_ID } from '@/lib/consent';

/**
 * Cookie Policy.
 *
 * Published in both languages, unlike /privacy and /terms. A cookie policy is
 * a disclosure — it tells you what is already happening — rather than terms
 * you are agreeing to, and the consent it describes is being collected from
 * Turkish visitors through a Turkish banner. Disclosing that in English only
 * would leave the consent it asks for unsupported by anything the visitor can
 * read. The two versions are maintained as separate authored texts, not as a
 * translated string table, so neither can drift into a machine rendering of
 * the other.
 *
 * Every lifetime named below is taken from the code that sets the cookie:
 * `SESSION_MAX_AGE` in lib/session-config.ts, `LOCALE_COOKIE_MAX_AGE` in
 * lib/i18n, and `CONSENT_COOKIE_MAX_AGE` in lib/consent.ts. Changing one of
 * those means changing the figure here.
 */

const EN_DESCRIPTION =
  'The cookies CorpControl sets, what each one does, how long it lasts, and how to change what you allow.';

const TR_DESCRIPTION =
  'CorpControl’un kullandığı çerezler, her birinin amacı, saklama süreleri ve tercihlerinizi nasıl değiştirebileceğiniz.';

/** Class used by every inline link in the body, matching the other legal pages. */
const LINK =
  'rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Class for the "cookie settings" button, which is a control and reads as one. */
const SETTINGS_BUTTON =
  'rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function generateMetadata(): Metadata {
  const locale = getServerLocale();
  const turkish = locale === 'tr';
  const title = turkish ? 'Çerez Politikası' : 'Cookie Policy';
  const description = turkish ? TR_DESCRIPTION : EN_DESCRIPTION;

  return {
    title,
    description,
    alternates: { canonical: '/cookies' },
    /**
     * `openGraph` replaces the root object rather than merging into it, so the
     * shared fields are restated alongside `locale` — the same reason /kvkk
     * spells them out.
     */
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title,
      description,
      url: '/cookies',
      locale: turkish ? 'tr_TR' : 'en_US',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${siteConfig.name} dashboard` }],
    },
  };
}

export default function CookiesPage() {
  return getServerLocale() === 'tr' ? <CookiesTr /> : <CookiesEn />;
}

function CookiesEn() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="11 September 2026"
      intro="This page lists every cookie CorpControl sets, what each one is for and how long it lasts. Cookies needed to run the service are set as soon as you use it. Cookies used for advertising and measurement are set only if you allow them, and you can withdraw that at any time."
    >
      <LegalSection heading="Strictly necessary cookies">
        <p>
          These are set by the application itself, without asking, because the service cannot work
          without them. No third party can read them.
        </p>
        <ul>
          <li>
            <strong>Session cookie.</strong> Created when you sign in and holds your signed session
            token. It is what tells the application, on each request, that you are you. It lasts up
            to seven days of inactivity and is extended while you keep using the service. Deleting it
            signs you out.
          </li>
          <li>
            <strong>CSRF token cookie.</strong> Set on the sign-in and sign-out forms. It protects
            those forms against cross-site request forgery, where another site tries to submit a
            request as you. It is deleted when you close the browser.
          </li>
          <li>
            <strong>Callback URL cookie.</strong> Remembers the page you were trying to reach when you
            were asked to sign in, so you can be returned there afterwards. It is deleted when you
            close the browser.
          </li>
          <li>
            <strong>Language cookie</strong> (<code>NEXT_LOCALE</code>). Records the language you pick
            in the language selector, so the site stays in that language on your next visit. It holds
            nothing but a language code and lasts one year.
          </li>
          <li>
            <strong>Consent cookie</strong> (<code>{CONSENT_COOKIE}</code>). Records the choice you
            made about the cookies below, so you are not asked again on every page. It holds the
            categories you allowed and the date you allowed them, and lasts six months, after which
            you will be asked again.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Advertising and measurement cookies">
        <p>
          CorpControl advertises on Google. To find out which adverts bring people to the site, and
          which of those people go on to open an account, we use the Google Ads tag{' '}
          <code>{GOOGLE_ADS_ID}</code>, supplied by Google Ireland Limited and Google LLC.{' '}
          <strong>These are set only if you allow them.</strong> If you decline, or if you have not
          answered yet, the Google script is never requested and none of these cookies exist.
        </p>
        <ul>
          <li>
            <strong>Advertising.</strong> Google Ads sets a first-party cookie (
            <code>_gcl_au</code>, ninety days) that links a click on one of our adverts to what you
            subsequently do on the site, so a sign-up can be attributed to the advert that produced
            it. Depending on your own Google settings, Google may additionally set or read cookies on
            its own domains, such as <code>google.com</code> and <code>doubleclick.net</code>, and use
            them to show you adverts elsewhere.
          </li>
          <li>
            <strong>Measurement.</strong> The same tag counts conversions in aggregate — how many
            visits from a given advert or search term ended in a sign-up. This is what tells us
            whether the advertising is worth continuing.
          </li>
        </ul>
        <p>
          Personal data collected through these cookies is transferred to Google and may be processed
          outside your country, including in the United States, under the transfer safeguards Google
          publishes. Google determines how long the data it receives is kept; see{' '}
          <a href="https://policies.google.com/technologies/cookies" className={LINK} target="_blank" rel="noopener noreferrer">
            Google&rsquo;s cookie notice
          </a>{' '}
          and{' '}
          <a href="https://business.safety.google/privacy/" className={LINK} target="_blank" rel="noopener noreferrer">
            Google&rsquo;s business privacy notice
          </a>
          .
        </p>
        <p>
          The records you enter into CorpControl — customers, invoices, payments, income and expenses
          — are never sent to Google and are never used for advertising. What these cookies carry is
          how you arrived at the site and what you did on the public pages, nothing from inside your
          workspace.
        </p>
      </LegalSection>

      <LegalSection heading="How consent is handled">
        <p>
          Before any of the above runs, the Google tag is told that advertising storage, advertising
          user data, advertising personalisation and analytics storage are all denied. That is the
          state every visitor starts in. Nothing is loaded from Google until you have allowed at
          least one of the two optional categories, and if you later withdraw consent the denial is
          sent to Google immediately.
        </p>
        <p>
          Your choice is stored for six months. You can change it whenever you like, and choosing to
          reject costs you nothing: the whole service works exactly the same either way.
        </p>
        <p>
          <CookieSettingsLink className={SETTINGS_BUTTON} />
        </p>
      </LegalSection>

      <LegalSection heading="Other browser storage">
        <p>
          Your choice of light or dark appearance is kept in your browser&rsquo;s local storage rather
          than in a cookie. It never leaves your device and is not sent to the service with your
          requests. Clearing your browser&rsquo;s site data resets it to the default.
        </p>
      </LegalSection>

      <LegalSection heading="Managing cookies in your browser">
        <p>
          Every browser lets you view, block and delete cookies through its settings. Blocking the
          advertising and measurement cookies there has the same effect as declining them here.
          Blocking the strictly necessary cookies is different: they are what carry your sign-in, so
          doing that will sign you out and prevent you from using the application until they are
          allowed again.
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
          <Link href="/privacy" className={LINK}>
            Privacy Policy
          </Link>
          . Visitors in Turkey may also want the{' '}
          <Link href="/kvkk" className={LINK}>
            KVKK notice
          </Link>
          . For questions about this page, email{' '}
          <a href={companyMailto} className={LINK}>
            {companyInfo.email}
          </a>{' '}
          or use our{' '}
          <Link href="/contact" className={LINK}>
            contact page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

function CookiesTr() {
  return (
    <LegalPage
      title="Çerez Politikası"
      updated="11 Eylül 2026"
      intro="Bu sayfa, CorpControl’un kullandığı tüm çerezleri, her birinin amacını ve saklama süresini listeler. Hizmetin çalışması için zorunlu olan çerezler siz siteyi kullandığınız anda yerleştirilir. Reklam ve ölçümleme çerezleri ise yalnızca izin vermeniz hâlinde kullanılır; bu izni dilediğiniz zaman geri alabilirsiniz."
      lang="tr"
    >
      <LegalSection heading="Zorunlu çerezler">
        <p>
          Aşağıdaki çerezler, hizmet bunlar olmadan çalışamadığı için uygulamanın kendisi tarafından,
          ayrıca onay alınmaksızın yerleştirilir. Üçüncü taraflar bu çerezleri okuyamaz.
        </p>
        <ul>
          <li>
            <strong>Oturum çerezi.</strong> Oturum açtığınızda oluşturulur ve imzalı oturum
            belirtecinizi taşır. Her istekte uygulamaya kimliğinizi bildiren şey budur. Hareketsizlik
            hâlinde en fazla yedi gün geçerlidir ve hizmeti kullandıkça süresi uzar. Silinmesi
            oturumunuzu kapatır.
          </li>
          <li>
            <strong>CSRF belirteci çerezi.</strong> Giriş ve çıkış formlarında kullanılır. Bu formları,
            başka bir sitenin sizin adınıza istek göndermesi anlamına gelen siteler arası istek
            sahteciliğine karşı korur. Tarayıcıyı kapattığınızda silinir.
          </li>
          <li>
            <strong>Yönlendirme adresi çerezi.</strong> Oturum açmanız istendiğinde ulaşmaya
            çalıştığınız sayfayı hatırlar; böylece giriş sonrasında oraya dönebilirsiniz. Tarayıcıyı
            kapattığınızda silinir.
          </li>
          <li>
            <strong>Dil çerezi</strong> (<code>NEXT_LOCALE</code>). Dil seçicisinden seçtiğiniz dili
            kaydeder; böylece bir sonraki ziyaretinizde site aynı dilde açılır. Yalnızca bir dil kodu
            içerir ve bir yıl saklanır.
          </li>
          <li>
            <strong>Onay çerezi</strong> (<code>{CONSENT_COOKIE}</code>). Aşağıdaki çerezlerle ilgili
            tercihinizi kaydeder; böylece her sayfada yeniden sorulmaz. İzin verdiğiniz kategorileri ve
            izin tarihini içerir, altı ay saklanır ve bu sürenin sonunda tercihiniz yeniden sorulur.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Reklam ve ölçümleme çerezleri">
        <p>
          CorpControl, Google üzerinden reklam vermektedir. Hangi reklamın siteye ziyaretçi
          getirdiğini ve bu ziyaretçilerden kaçının hesap açtığını görebilmek için, Google Ireland
          Limited ve Google LLC tarafından sağlanan <code>{GOOGLE_ADS_ID}</code> numaralı Google Ads
          etiketini kullanıyoruz. <strong>Bu çerezler yalnızca izin vermeniz hâlinde kullanılır.</strong>{' '}
          Reddetmeniz hâlinde veya henüz bir tercih belirtmediyseniz Google betiği hiç çağrılmaz ve bu
          çerezlerin hiçbiri oluşmaz.
        </p>
        <ul>
          <li>
            <strong>Reklam.</strong> Google Ads, reklamlarımızdan birine yaptığınız tıklamayı sitede
            sonrasında yaptıklarınızla ilişkilendiren birinci taraf bir çerez (<code>_gcl_au</code>,
            doksan gün) yerleştirir; böylece bir kaydın hangi reklamdan geldiği belirlenebilir. Kendi
            Google ayarlarınıza bağlı olarak Google, ayrıca <code>google.com</code> ve{' '}
            <code>doubleclick.net</code> gibi kendi alan adlarında çerez yerleştirebilir veya okuyabilir
            ve bunları başka sitelerde size reklam göstermek için kullanabilir.
          </li>
          <li>
            <strong>Ölçümleme.</strong> Aynı etiket, dönüşümleri toplu olarak sayar: belirli bir
            reklamdan veya arama teriminden gelen ziyaretlerin kaçının kayıtla sonuçlandığını. Reklam
            harcamasının sürdürülmeye değer olup olmadığını gösteren veri budur.
          </li>
        </ul>
        <p>
          Bu çerezler aracılığıyla toplanan kişisel veriler Google&rsquo;a aktarılır ve Google&rsquo;ın
          yayımladığı aktarım güvenceleri çerçevesinde, Amerika Birleşik Devletleri dâhil olmak üzere
          ülkenizin dışında işlenebilir. Google&rsquo;ın aldığı verileri ne kadar süreyle sakladığını
          Google belirler; ayrıntılar için{' '}
          <a href="https://policies.google.com/technologies/cookies" className={LINK} target="_blank" rel="noopener noreferrer">
            Google çerez bildirimine
          </a>{' '}
          ve{' '}
          <a href="https://business.safety.google/privacy/" className={LINK} target="_blank" rel="noopener noreferrer">
            Google iş gizliliği bildirimine
          </a>{' '}
          bakabilirsiniz.
        </p>
        <p>
          CorpControl&rsquo;a girdiğiniz kayıtlar — müşteriler, faturalar, tahsilatlar, gelirler ve
          giderler — Google&rsquo;a hiçbir şekilde gönderilmez ve reklam amacıyla kullanılmaz. Bu
          çerezlerin taşıdığı bilgi, siteye nasıl ulaştığınız ve herkese açık sayfalarda ne yaptığınızdır;
          çalışma alanınızın içinden hiçbir veri taşınmaz.
        </p>
      </LegalSection>

      <LegalSection heading="Onayın nasıl yönetildiği">
        <p>
          Yukarıdakilerin hiçbiri çalışmadan önce Google etiketine; reklam depolaması, reklam kullanıcı
          verisi, reklam kişiselleştirmesi ve analitik depolamasının tamamının reddedildiği bildirilir.
          Her ziyaretçi bu durumda başlar. İki isteğe bağlı kategoriden en az birine izin vermediğiniz
          sürece Google&rsquo;dan hiçbir şey yüklenmez; onayınızı daha sonra geri almanız hâlinde ret
          bilgisi Google&rsquo;a derhâl iletilir.
        </p>
        <p>
          Tercihiniz altı ay saklanır. Dilediğiniz zaman değiştirebilirsiniz ve reddetmenin size hiçbir
          maliyeti yoktur: hizmetin tamamı her iki durumda da aynı şekilde çalışır.
        </p>
        <p>
          <CookieSettingsLink className={SETTINGS_BUTTON} />
        </p>
      </LegalSection>

      <LegalSection heading="Diğer tarayıcı depolaması">
        <p>
          Açık veya koyu görünüm tercihiniz çerezde değil, tarayıcınızın yerel depolamasında tutulur.
          Cihazınızdan hiç çıkmaz ve isteklerinizle birlikte hizmete gönderilmez. Tarayıcınızın site
          verilerini temizlemeniz bu tercihi varsayılana döndürür.
        </p>
      </LegalSection>

      <LegalSection heading="Çerezleri tarayıcınızdan yönetme">
        <p>
          Her tarayıcı, ayarları üzerinden çerezleri görüntülemenize, engellemenize ve silmenize izin
          verir. Reklam ve ölçümleme çerezlerini oradan engellemenin, buradan reddetmekle aynı etkisi
          olur. Zorunlu çerezler içinse durum farklıdır: oturumunuzu taşıyan şey onlar olduğundan,
          engellenmeleri oturumunuzu kapatır ve yeniden izin verilene kadar uygulamayı
          kullanmanızı engeller.
        </p>
      </LegalSection>

      <LegalSection heading="Daha fazla bilgi">
        <p>
          Burada açıklanan çerezler, CorpControl&rsquo;u işleten{' '}
          <strong>{companyInfo.legalName}</strong> tarafından yerleştirilmektedir. Şirket,{' '}
          {companyInfo.address.country} ülkesinde kurulu bir {companyInfo.entityType} olup adresi{' '}
          {companyAddressLine} şeklindedir.
        </p>
        <p>
          Kişisel verilerinizin 6698 sayılı Kanun kapsamında nasıl işlendiğine ilişkin ayrıntılar için{' '}
          <Link href="/kvkk" className={LINK}>
            KVKK Aydınlatma Metni
          </Link>{' '}
          sayfasına, İngilizce gizlilik açıklaması için{' '}
          <Link href="/privacy" className={LINK}>
            Gizlilik Politikası
          </Link>{' '}
          sayfasına bakabilirsiniz. Bu sayfayla ilgili sorularınız için{' '}
          <a href={companyMailto} className={LINK}>
            {companyInfo.email}
          </a>{' '}
          adresine e-posta gönderebilir veya{' '}
          <Link href="/contact" className={LINK}>
            iletişim sayfamızı
          </Link>{' '}
          kullanabilirsiniz.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
