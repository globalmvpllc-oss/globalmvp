import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'KVKK Aydınlatma Metni',
  description:
    '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında CorpControl kullanıcıları için aydınlatma metni.',
  alternates: { canonical: '/kvkk' },
};

export default function KvkkPage() {
  return (
    <LegalPage
      title="KVKK Aydınlatma Metni"
      updated="25 Ağustos 2026"
      intro="Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca, CorpControl hizmetini kullanan ilgili kişileri bilgilendirmek amacıyla hazırlanmıştır."
    >
      <LegalSection heading="Veri sorumlusu">
        <p>
          Kişisel verileriniz, CorpControl hizmetini sunmaktan sorumlu olan tüzel kişi tarafından, veri
          sorumlusu sıfatıyla işlenmektedir. Bu metinde geçen &ldquo;biz&rdquo; ifadesi bu tüzel kişiyi
          belirtir. Başvuru ve iletişim yolları için{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            iletişim sayfamıza
          </Link>{' '}
          bakabilirsiniz.
        </p>
      </LegalSection>

      <LegalSection heading="İşlenen kişisel veriler">
        <ul>
          <li>
            <strong>Kimlik verisi:</strong> ad ve soyad.
          </li>
          <li>
            <strong>İletişim verisi:</strong> e-posta adresi; işletmeniz için girdiğiniz telefon,
            adres ve ülke bilgisi.
          </li>
          <li>
            <strong>Müşteri işlem verisi:</strong> oluşturduğunuz fatura, fatura kalemleri, tahsilat ve
            ödeme kayıtları, gelir ve gider kayıtları, müşteri ve tedarikçi bilgileri.
          </li>
          <li>
            <strong>İşlem güvenliği verisi:</strong> parolanızın kriptografik özeti ve oturum
            kayıtları. Parolanız hiçbir zaman okunabilir biçimde saklanmaz.
          </li>
          <li>
            <strong>Diğer:</strong> hizmetin çalışması sırasında oluşan sunucu ve hata kayıtları.
          </li>
        </ul>
        <p>
          CorpControl banka hesaplarına bağlanmaz ve bankacılık kimlik bilgilerinizi talep etmez.
          Kişisel verileriniz üzerinde otomatik sistemlerle profilleme veya otomatik karar verme
          yapılmaz.
        </p>
      </LegalSection>

      <LegalSection heading="İşleme amaçları">
        <ul>
          <li>Hizmetin sunulması, kayıtlarınızın saklanması, hesaplanması ve görüntülenmesi.</li>
          <li>Hesabınızın oluşturulması, kimliğinizin doğrulanması ve oturum güvenliğinin sağlanması.</li>
          <li>Talep etmeniz hâlinde fatura PDF'i gibi belgelerin oluşturulması.</li>
          <li>Bilgi güvenliğinin sağlanması, hata tespiti ve hizmet sürekliliğinin korunması.</li>
          <li>Tabi olduğumuz mevzuattan doğan yükümlülüklerin yerine getirilmesi.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Hukuki sebepler">
        <p>Kişisel verileriniz aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:</p>
        <ul>
          <li>
            <strong>KVKK m.5/2(c):</strong> Sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili
            olması — hesap ve işletme verileriniz ile oluşturduğunuz kayıtlar bakımından.
          </li>
          <li>
            <strong>KVKK m.5/2(ç):</strong> Hukuki yükümlülüğün yerine getirilmesi — mevzuatın
            saklamamızı gerektirdiği hâllerde.
          </li>
          <li>
            <strong>KVKK m.5/2(f):</strong> İlgili kişinin temel hak ve özgürlüklerine zarar vermemek
            kaydıyla meşru menfaat — güvenlik ve hata kayıtları bakımından.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Kendi müşterilerinize ait veriler">
        <p>
          CorpControl'a girdiğiniz verilerin önemli bir bölümü kendi müşterilerinize ve
          tedarikçilerinize aittir. Bu veriler bakımından veri sorumlusu <strong>sizsiniz</strong>; biz
          bu verileri hizmeti sunmak amacıyla sizin adınıza işleriz.
        </p>
        <p>
          Bu verileri işlemeye yetkili olduğunuzu, ilgili kişilere gerekli aydınlatmayı yaptığınızı ve
          mevzuata uygun davrandığınızı temin etmek sizin sorumluluğunuzdadır.
        </p>
      </LegalSection>

      <LegalSection heading="Veri aktarımı ve yurt dışına aktarım">
        <p>
          Kişisel verileriniz, hizmetin sunulabilmesi için gerekli olan altyapı sağlayıcılarına, yalnızca
          kendi işlevlerini yerine getirebilecekleri ölçüde aktarılır: uygulama barındırma sağlayıcısı,
          yönetilen PostgreSQL veritabanı sağlayıcısı, dosya depolama için Amazon S3 ve fatura PDF'i
          talep ettiğinizde belge dönüştürme hizmeti için Abacus AI.
        </p>
        <p>
          Bu sağlayıcıların sunucuları Türkiye dışında bulunabilir. Bu durumda aktarım, KVKK'nın 9.
          maddesi çerçevesinde ve sağlayıcıların uluslararası veri aktarımı için sunduğu güvenceler
          esas alınarak gerçekleştirilir.
        </p>
        <p>
          Verileriniz başka kullanıcılarla paylaşılmaz. Her işletme çalışma alanı diğerlerinden
          ayrıştırılmıştır.
        </p>
      </LegalSection>

      <LegalSection heading="Saklama süresi">
        <p>
          Kayıtlarınız, hesabınız açık olduğu sürece saklanır. Hesabınızın kapatılması hâlinde veriler,
          yalnızca tabi olduğumuz hukuki ve mali yükümlülüklerin gerektirdiği süre boyunca tutulur ve bu
          sürenin sonunda silinir veya anonim hâle getirilir.
        </p>
        <p>
          Sabit bir saklama süresi henüz belirlenmemiştir; gerçeğe uymayan bir süre yayımlamak yerine
          bunu açıkça belirtmeyi tercih ediyoruz.
        </p>
      </LegalSection>

      <LegalSection heading="Veri güvenliği">
        <p>Uygulamada fiilen uygulanan teknik tedbirler şunlardır:</p>
        <ul>
          <li>Parolalar yalnızca tuzlanmış kriptografik özet olarak saklanır.</li>
          <li>Oturumlar imzalı belirteçlerle taşınır; geçerli belirteci olmayan istekler reddedilir.</li>
          <li>
            Her sorgu, oturum açan kullanıcının çalışma alanıyla sınırlandırılır; bir işletme başka bir
            işletmenin kayıtlarına erişemez.
          </li>
          <li>Tarayıcı ile hizmet ve hizmet ile veritabanı arasındaki trafik şifrelenir.</li>
        </ul>
        <p>
          Herhangi bir güvenlik sertifikasyonumuz bulunmamaktadır ve böyle bir iddiada bulunmuyoruz.
        </p>
      </LegalSection>

      <LegalSection heading="İlgili kişinin hakları (KVKK m.11)">
        <p>Kanunun 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
        <ul>
          <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme;</li>
          <li>İşlenmişse buna ilişkin bilgi talep etme;</li>
          <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme;</li>
          <li>Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme;</li>
          <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme;</li>
          <li>Kanunun 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme;</li>
          <li>Düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme;</li>
          <li>
            Münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonuç ortaya
            çıkmasına itiraz etme;
          </li>
          <li>Hukuka aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.</li>
        </ul>
        <p>
          Çalışma alanınızdaki bilgilerin çoğunu uygulama üzerinden doğrudan görüntüleyebilir ve
          düzeltebilirsiniz.
        </p>
      </LegalSection>

      <LegalSection heading="Başvuru yöntemi">
        <p>
          Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e
          uygun şekilde, kimliğinizi tevsik eden bilgilerle birlikte{' '}
          <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            iletişim sayfamızda
          </Link>{' '}
          yayımlanan kanallar aracılığıyla iletebilirsiniz.
        </p>
        <p>
          Talebiniz, niteliğine göre en kısa sürede ve her hâlükârda en geç otuz gün içinde
          sonuçlandırılır. İşlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul tarafından belirlenen
          tarifedeki ücret talep edilebilir.
        </p>
      </LegalSection>

      <LegalSection heading="Değişiklikler">
        <p>
          Bu aydınlatma metni güncellenebilir. Yürürlükteki sürüm, sayfanın başında belirtilen tarihle
          gösterilir.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
