# CorpControl: Ölçüm kurulumu (Google Ads, GA4, Meta)

Bu rehber, reklamların hangi kayıtları ve satışları getirdiğini görmek için gereken üç aracı kurmayı anlatır.
Her adımın sonunda bir **kimlik (ID)** elde edersiniz. Bu kimlikleri Vercel'e girersiniz; kod gerisini halleder.

> Menü adları zamanla küçük değişiklikler gösterebilir. Bulamadığınız bir düğme olursa ekrandaki arama kutusuna adını yazın.

---

## Özet: Vercel'e girilecek 5 değer

Hepsi ⚙️ **Config** değeridir, gizli değildir; tarayıcıya zaten gönderilirler. Vercel'de "Sensitive" işaretlemeyin.

| Değişken adı | Nereden gelir | Örnek biçim |
|---|---|---|
| `NEXT_PUBLIC_GA4_ID` | GA4 → Web akışı → Ölçüm kimliği | `G-` ile başlar |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | Google Ads → Dönüşüm etiketi | `AW-` ile başlar |
| `NEXT_PUBLIC_GADS_LABEL_SIGNUP` | Google Ads → "Kayıt" dönüşümünün etiketi | harf ve rakamlar |
| `NEXT_PUBLIC_GADS_LABEL_PURCHASE` | Google Ads → "Satın alma" dönüşümünün etiketi | harf ve rakamlar |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager → Pixel kimliği | yalnız rakam |

Bir değeri boş bırakırsanız o araç yüklenmez; site hata vermez.

---

## 1. Google Analytics 4 (GA4) mülkü

1. **analytics.google.com** adresine CorpControl'ün Google hesabıyla girin.
2. Sol altta **Yönetici** (dişli simgesi) → **Oluştur** → **Mülk**.
3. **Mülk adı:** `CorpControl` · **Saat dilimi:** sizin bölgeniz · **Para birimi:** `ABD Doları (USD)`. → **İleri**.
4. İşletme bilgilerini seçin (küçük işletme, "Online satışları artırma" vb.) → **Oluştur**.
5. **Platform seçin** ekranında **Web**.
6. **Web sitesi URL'si:** `https://corpcontrol.net` · **Akış adı:** `corpcontrol.net` → **Akış oluştur**.
7. Açılan ekranda sağ üstteki **Ölçüm kimliği** (`G-` ile başlayan) → bu `NEXT_PUBLIC_GA4_ID` değeridir.
8. Sayfayı kapatın. Kurulum talimatlarındaki kodu siteye eklemeyin; kod zaten hazır.
9. Satışları önemli olay saymak için: **Yönetici** → **Etkinlikler** (veya **Önemli etkinlikler**). `purchase` ve `sign_up` ilk kez geldikten sonra (1 güne kadar sürebilir) yanlarındaki **Önemli etkinlik olarak işaretle** anahtarını açın.

## 2. Google Ads dönüşümleri (2 adet)

Aynı işlemi iki kez yapacaksınız: önce **Kayıt**, sonra **Satın alma**.

1. **ads.google.com** → üst menüden **Hedefler** → **Dönüşümler** → **Özet**.
2. **+ Yeni dönüşüm işlemi** → **Web sitesi**.
3. Alan adı kutusuna `corpcontrol.net` yazın → **Tara**.
4. Aşağıda **Manuel olarak dönüşüm işlemi ekleyin** → **+ Manuel olarak dönüşüm işlemi ekle**.
5. Kayıt için:
   - **Hedef ve işlem optimizasyonu:** `Kaydolma` (Sign-up)
   - **Dönüşüm adı:** `CorpControl Kayıt`
   - **Değer:** `Tüm dönüşümler için aynı değeri kullan` → isterseniz `0` veya boş bırakın
   - **Sayım:** `Bir` (aynı kişinin ikinci kaydı sayılmasın)
   - **Kaydet** → **Bitti**
6. Satın alma için tekrar 1–4, sonra:
   - **Hedef:** `Satın alma`
   - **Dönüşüm adı:** `CorpControl Satın alma`
   - **Değer:** `Her dönüşüm için farklı değerler kullanın` (tutar siteden gönderilir) · varsayılan para birimi `USD`
   - **Sayım:** `Her`
   - **Kaydet** → **Bitti**
7. Her iki dönüşümde **Etiketi kendiniz yükleyin** (veya "Etiket kurulumu") bölümünü açın:
   - **Google etiketi** kutusunda `AW-` ile başlayan kimlik → `NEXT_PUBLIC_GOOGLE_ADS_ID` (iki dönüşümde aynıdır).
   - **Etkinlik snippet'i** kutusunda `'send_to': 'AW-1234567890/AbCdEfGh'` gibi bir satır vardır. **Eğik çizgiden sonraki kısım** etikettir:
     - Kayıt dönüşümününki → `NEXT_PUBLIC_GADS_LABEL_SIGNUP`
     - Satın alma dönüşümününki → `NEXT_PUBLIC_GADS_LABEL_PURCHASE`
8. Kodları siteye kopyalamayın; sadece bu üç değeri not edin.

## 3. Meta Pixel (Facebook / Instagram)

1. **business.facebook.com** → sol menüde **Events Manager** (Etkinlik Yöneticisi).
2. **+ Veri kaynaklarını bağla** → **Web** → **Bağla**.
3. **Pixel / veri kümesi adı:** `CorpControl` → **Oluştur**.
4. Kurulum yöntemi sorulursa **Kodu manuel olarak yükle**'yi seçip pencereyi kapatın; kod zaten hazır.
5. Pixel'in **Ayarlar** sekmesinde üstte görünen **Kimlik** (yalnız rakam) → `NEXT_PUBLIC_META_PIXEL_ID`.
6. Aynı **Ayarlar** sekmesinde:
   - **Otomatik gelişmiş eşleştirme:** **Kapalı**. Açık kalırsa Meta formlardaki e-posta gibi bilgileri kendisi toplamaya çalışır; biz bunu istemiyoruz.
   - **Otomatik etkinlik kurulumu:** **Kapalı** (kodda da kapalıdır).
7. **Business Ayarları** → **Marka güvenliği** → **Alan adları** → `corpcontrol.net` ekleyin ve doğrulayın (DNS kaydı ya da Meta'nın verdiği yöntemle).

## 4. Değerleri Vercel'e girme

1. **vercel.com** → globalmvp projesi → **Settings** → **Environment Variables**.
2. Yukarıdaki 5 değişkeni tek tek ekleyin:
   - **Environments:** önce yalnız **Preview** (deneme için). Çalıştığını görünce **Production**'a da ekleyin.
   - **Sensitive:** işaretlemeyin.
3. Bu değerler derleme sırasında koda gömülür. Ekledikten sonra **yeniden deploy** gerekir (Deployments → son kayıt → **Redeploy**).

## 5. Çalıştığını kontrol etme

1. Siteyi gizli pencerede açın. Çerez bandında **Reddet** deyin. Hiçbir araç yüklenmemeli.
2. Sayfanın altındaki **Çerez ayarları** bağlantısıyla bandı açıp **Kabul et** deyin.
3. Kontrol araçları:
   - **GA4:** Yönetici → **DebugView** veya **Raporlar → Gerçek zamanlı**. Ziyaretiniz görünmeli.
   - **Google Ads:** Chrome'a **Tag Assistant** eklentisini kurup siteyi açın; `AW-` etiketi görünmeli.
   - **Meta:** Chrome'a **Meta Pixel Helper** eklentisini kurun; `PageView` görünmeli. Events Manager → **Test etkinlikleri** sekmesi de kullanılabilir.
4. Gönderilen olaylar:
   - **Kayıt:** yeni hesap şirket bilgilerini bitirince → GA4 `sign_up`, Ads Kayıt, Meta `CompleteRegistration`.
   - **Ödeme başlatıldı:** Polar ödeme sayfasına giderken → GA4 `begin_checkout`, Meta `InitiateCheckout`.
   - **Ödeme tamamlandı:** Polar'dan dönüşte, ödeme Polar'dan doğrulandıktan sonra → GA4 `purchase`, Ads Satın alma, Meta `Purchase` (tutar ve para birimiyle; aynı ödeme bir kez sayılır).
   - **Plan yükseltme:** Pro → Business geçişinde → GA4 `purchase` (yalnız fark tutarı).
5. Olaylarda ad, e-posta ya da telefon gönderilmez. Yalnız plan adı, tutar, para birimi ve sipariş numarası gider.

> **Not:** Gerçek bir satın alma ile test etmeyin. Satın alma olayını görmek için Polar'ın **sandbox** (test) ortamı ve test kartı kullanılmalıdır.
