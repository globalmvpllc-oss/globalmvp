# CorpControl sohbet botu — bilgi metni ve talimat

Sitedeki sohbet botu CorpControl'ün içinde değil. Webtochat'in sohbet kutusu
(`app/layout.tsx` içindeki `widget.js?id=4c749a04-…` betiği). Bot bilgisini
Webtochat veritabanındaki CorpControl bot kaydından alıyor:

- **Bilgi tabanı** → `companies.knowledge_base`
- **Ek yönlendirme** → `companies.system_prompt`
- **Kutunun dili** (karşılama mesajı, butonlar) → `companies.widget_lang` (şu an `en`)

## Nereye yapıştırılacak

1. Webtochat paneline CorpControl botunun hesabıyla gir: **webtochat.net → Panel → Ayarlar**
   (`/admin/dashboard/settings`).
2. **"Ek yönlendirme"** kutusunun içini tamamen sil ve aşağıdaki **Bölüm 1**'i yapıştır.
3. **"Bilgi tabanı"** kutusunun içini tamamen sil ve aşağıdaki **Bölüm 2**'yi yapıştır.
4. **Kaydet**'e bas.
5. **Aşama 3 canlıya çıktığında** (ve TL fiyatlar Polar'a eklendiğinde) "Bilgi tabanı"
   kutusunu yine tamamen silip **Bölüm 3**'ü yapıştır. Bölüm 1 değişmez.

Yalnız ```` ``` ```` işaretlerinin arasındaki metni kopyala.

---

## Bölüm 1 — Ek yönlendirme (her zaman bu)

```
You are the support assistant for CorpControl (corpcontrol.net).

LANGUAGE: Reply in the language of the visitor's last message. If they write in Turkish, answer fully in Turkish using the TÜRKÇE part of the knowledge base. Otherwise answer in English using the ENGLISH part. Do not mix languages in one answer.

STYLE: Be concise: two or three short paragraphs at most. No emoji. Use a short list only when the visitor asks for features or a comparison.

RULES:
- Use only the knowledge base. Never invent features, prices, limits, dates or integrations.
- If something is not covered, say so plainly and send the visitor to corpcontrol.net/contact (Turkish: "Bu konuda corpcontrol.net/contact sayfasından bize yazabilirsiniz.").
- Do not describe planned features as available today.
- Do not give accounting, tax or legal advice; suggest asking their accountant (mali müşavir).

E-INVOICE: CorpControl does NOT issue legal e-Arşiv or e-Fatura invoices today. If asked about e-Fatura, e-Arşiv, GİB or legal invoices, answer exactly:
- Turkish: "Şu an proforma fatura ve PDF var; yasal e-Arşiv entegrasyonu hazırlanıyor."
- English: "Today CorpControl produces proforma invoices and PDFs; legal e-Arşiv integration is in preparation."
Never say that a legal e-invoice was issued or can be issued.
```

---

## Bölüm 2 — Bilgi tabanı (şimdi, bugünkü canlı sürüm)

```
===== TÜRKÇE =====

CORPCONTROL NEDİR
CorpControl; faturaları, müşterileri, gelirleri, giderleri ve ödemeleri tek bir yerde tutar. Serbest çalışanlar, danışmanlar, ajanslar ve küçük işletmeler içindir. Muhasebe programı değildir, banka bağlantısı gerektirmez. Tarayıcıdan çalışır, kurulum yoktur.

TÜRKİYE İÇİN
- Faturalarda KDV oranları: %0, %1, %10, %20. Satır bazında indirim.
- Vergi numarası (VKN/TCKN) ve vergi dairesi alanları; müşteriye ve şirkete yazılır.
- Türkiye'de kayıtlı şirketlerde fatura PDF'inin başlığı "PROFORMA FATURA"dır ve altında şu not bulunur: "Bu belge bilgilendirme amaçlıdır; yasal e-Arşiv/e-Fatura yerine geçmez."
- Yasal e-Arşiv / e-Fatura bugün kesilmez; entegrasyon hazırlanıyor.
- Para birimleri: TRY, USD, EUR, GBP.

ÖZELLİKLER
- Faturalar: kalemler, KDV, indirim; taslaktan ödendiye kadar takip. Faturayı PDF ekiyle müşteriye e-postayla gönderme.
- Otomatik gecikme hatırlatmaları: vadesi geçen faturalar için müşteriye hatırlatma e-postası. Ayarlar'dan açılır, varsayılan olarak kapalıdır.
- Teklifler: teklif hazırlama, e-postayla gönderme, kabul/ret işaretleme ve tek tıkla faturaya dönüştürme.
- Tekrarlayan faturalar: aylık, 3 aylık ya da yıllık. Her fatura taslak olarak oluşur; istenirse otomatik e-postayla gider.
- KDV raporu: seçilen dönemde hesaplanan KDV (satışlar) ve indirilecek KDV (giderler), oran oran; sonuç "Ödenecek KDV" ya da "Devreden KDV". Bilgilendirme amaçlıdır, beyanname yerine geçmez.
- Her liste ve rapor sayfasında "PDF indir": ekranda seçili filtreyle çıkar.
- Excel/CSV dışa aktarma: Pro ve Business planlarında.
- Müşteri ve tedarikçi ekstresi (cari hesap), PDF olarak.
- Çek ve senet takibi: alınan ve verilen çek/senetler; portföyde, tahsilde, tahsil edildi, karşılıksız gibi durumlar.
- Banka mutabakatı: banka ekstresini (CSV) içe aktarma ve hareketleri faturalar, ödemeler, gelir ve giderlerle otomatik ya da elle eşleştirme.
- Gelir ve gider: kategoriler, tarihler, vadeler. Ödemeler: tam ya da kısmi; fatura durumu kendiliğinden güncellenir.
- Takvim ve raporlar: vade tarihleri; gelir-gider, kategori ve para birimine göre raporlar.

PLANLAR (güncel fiyatlar her zaman corpcontrol.net/pricing sayfasındadır)
- Ücretsiz: 3 müşteri, ayda 20 fatura, 100 gelir, 100 gider kaydı, 20 fatura PDF'i.
- Pro: 9,99 USD/ay. 500 müşteri, ayda 500 fatura, 1000 gelir, 1000 gider, 500 PDF. Excel/CSV dışa aktarma.
- Business: 24,99 USD/ay. Bunların hepsi sınırsız.
- Yıllık ödemede aylığa göre yaklaşık %17 tasarruf.
- Yeni hesaplar ücretsiz planla başlar ve 15 gün boyunca bütün Pro özelliklerini kullanır. Kart gerekmez.
- Teklif, tekrarlayan fatura ve KDV raporu bütün planlarda vardır.
- Ödemeler Polar üzerinden alınır; abonelik istenildiği zaman iptal edilebilir.

HENÜZ YOK (planlı)
Yasal e-Arşiv/e-Fatura, gelişmiş raporlar, toplu dışa aktarma, ekip üyeleri, öncelikli destek. Her şirkette şu an tek kullanıcı vardır.

GÜVENLİK
Şifreler açık metin olarak saklanmaz. Her kayıt yalnız kendi işletmesine aittir. Bağlantılar HTTPS ile şifrelidir.

BAĞLANTILAR
Kayıt: corpcontrol.net/auth/signup
Giriş: corpcontrol.net/auth/login
Fiyatlar: corpcontrol.net/pricing
İletişim: corpcontrol.net/contact
Gizlilik: corpcontrol.net/privacy · KVKK: corpcontrol.net/kvkk · Koşullar: corpcontrol.net/terms · İade: corpcontrol.net/refund

===== ENGLISH =====

WHAT CORPCONTROL IS
CorpControl keeps invoices, customers, income, expenses and payments in one workspace for freelancers, consultants, agencies and small businesses. It is not accounting software and needs no bank connection. Browser-based, nothing to install.

FOR TURKEY
- VAT (KDV) rates on invoices: 0%, 1%, 10%, 20%. Per-line discounts.
- Tax number (VKN/TCKN) and tax office fields for the company and its customers.
- For companies registered in Turkey the invoice PDF is titled "PROFORMA FATURA" with the note that it is for information only and does not replace a legal e-Arşiv/e-Fatura invoice.
- Legal e-Arşiv / e-Fatura invoices are not issued today; the integration is in preparation.
- Currencies: TRY, USD, EUR, GBP.

FEATURES
- Invoices: line items, tax, discounts; tracked from draft to paid. Email an invoice to the customer with the PDF attached.
- Automatic overdue reminders: reminder emails to customers for overdue invoices. Switched on in Settings; off by default.
- Quotes: create, email, mark accepted or rejected, turn into an invoice in one click.
- Recurring invoices: monthly, every 3 months or yearly. Each invoice is created as a draft, or emailed automatically if chosen.
- VAT report: output VAT (sales) and input VAT (expenses) per rate for a period; result shown as VAT payable or VAT carried forward. For information only; not a tax return.
- "Download PDF" on every list and report page, using the filter shown on screen.
- Excel/CSV export: on the Pro and Business plans.
- Customer and vendor account statements as PDF.
- Cheques and promissory notes: received and issued, with statuses such as in portfolio, presented, cleared and bounced.
- Bank reconciliation: import a bank statement (CSV) and match lines to invoices, payments, income and expenses, automatically or by hand.
- Income and expenses with categories and due dates. Payments, full or partial, update the invoice status automatically.
- Calendar and reports: due dates; income vs expenses, by category and per currency.

PLANS (current prices are always on corpcontrol.net/pricing)
- Free: 3 customers, 20 invoices/month, 100 income and 100 expense entries/month, 20 invoice PDFs/month.
- Pro: 9.99 USD/month. 500 customers, 500 invoices/month, 1000 income, 1000 expenses, 500 PDFs/month. Excel/CSV export.
- Business: 24.99 USD/month. Unlimited on all of the above.
- Yearly billing saves about 17% versus monthly.
- New accounts start free and get all Pro features for 15 days. No card needed.
- Quotes, recurring invoices and the VAT report are on every plan.
- Payments are processed by Polar; cancel any time.

NOT YET AVAILABLE (planned)
Legal e-Arşiv/e-Fatura, advanced reports, bulk export, team members, priority support. Each company currently has a single user.

SECURITY
Passwords are never stored as text. Every record belongs to its own business only. Served over HTTPS.

LINKS
Sign up: corpcontrol.net/auth/signup
Log in: corpcontrol.net/auth/login
Pricing: corpcontrol.net/pricing
Contact: corpcontrol.net/contact
Privacy: corpcontrol.net/privacy · Terms: corpcontrol.net/terms · Refund policy: corpcontrol.net/refund
```

---

## Bölüm 3 — Bilgi tabanı (Aşama 3 canlıya çıkınca, TL fiyatlar Polar'a eklendikten sonra)

Bölüm 2'nin yerine bunu yapıştır. Farkı: TL fiyatlar, 7 gün deneme, mali müşavir erişimi.

```
===== TÜRKÇE =====

CORPCONTROL NEDİR
CorpControl; faturaları, müşterileri, gelirleri, giderleri ve ödemeleri tek bir yerde tutar. Serbest çalışanlar, danışmanlar, ajanslar ve küçük işletmeler içindir. Muhasebe programı değildir, banka bağlantısı gerektirmez. Tarayıcıdan çalışır, kurulum yoktur.

TÜRKİYE İÇİN
- Faturalarda KDV oranları: %0, %1, %10, %20. Satır bazında indirim.
- Vergi numarası (VKN/TCKN) ve vergi dairesi alanları; müşteriye ve şirkete yazılır.
- Türkiye'de kayıtlı şirketlerde fatura PDF'inin başlığı "PROFORMA FATURA"dır ve altında şu not bulunur: "Bu belge bilgilendirme amaçlıdır; yasal e-Arşiv/e-Fatura yerine geçmez."
- Yasal e-Arşiv / e-Fatura bugün kesilmez; entegrasyon hazırlanıyor.
- Para birimleri: TRY, USD, EUR, GBP.

ÖZELLİKLER
- Faturalar: kalemler, KDV, indirim; taslaktan ödendiye kadar takip. Faturayı PDF ekiyle müşteriye e-postayla gönderme.
- Otomatik gecikme hatırlatmaları: vadesi geçen faturalar için müşteriye hatırlatma e-postası. Ayarlar'dan açılır, varsayılan olarak kapalıdır.
- Teklifler: teklif hazırlama, e-postayla gönderme, kabul/ret işaretleme ve tek tıkla faturaya dönüştürme.
- Tekrarlayan faturalar: aylık, 3 aylık ya da yıllık. Her fatura taslak olarak oluşur; istenirse otomatik e-postayla gider.
- KDV raporu: seçilen dönemde hesaplanan KDV (satışlar) ve indirilecek KDV (giderler), oran oran; sonuç "Ödenecek KDV" ya da "Devreden KDV". Bilgilendirme amaçlıdır, beyanname yerine geçmez.
- Her liste ve rapor sayfasında "PDF indir": ekranda seçili filtreyle çıkar.
- Excel/CSV dışa aktarma: Pro ve Business planlarında.
- Müşteri ve tedarikçi ekstresi (cari hesap), PDF olarak.
- Çek ve senet takibi: alınan ve verilen çek/senetler; portföyde, tahsilde, tahsil edildi, karşılıksız gibi durumlar.
- Banka mutabakatı: banka ekstresini (CSV) içe aktarma ve hareketleri faturalar, ödemeler, gelir ve giderlerle otomatik ya da elle eşleştirme.
- Gelir ve gider: kategoriler, tarihler, vadeler. Ödemeler: tam ya da kısmi; fatura durumu kendiliğinden güncellenir.
- Takvim ve raporlar: vade tarihleri; gelir-gider, kategori ve para birimine göre raporlar.

MALİ MÜŞAVİR ERİŞİMİ
- Şirket sahibi Ayarlar'dan mali müşavirini e-postayla davet eder. Davet bağlantısı 7 gün geçerlidir.
- Müşavir bütün kayıtları, raporları ve KDV raporunu görür; PDF ve Excel/CSV indirir. Hiçbir şeyi değiştiremez, silemez ya da gönderemez. Ödeme ve abonelik ekranlarını görmez.
- Müşavir tek hesapla davet edildiği bütün şirketlere girer, şirketler arasında geçiş yapar.
- Bütün planlarda ücretsizdir; kullanıcı sayısına sayılmaz.
- Şirket sahibi erişimi tek tıkla kaldırabilir; müşavirin girişlerini ve indirmelerini Ayarlar'da görür.

PLANLAR (güncel fiyatlar her zaman corpcontrol.net/pricing sayfasındadır)
Türkiye'deki ziyaretçiler ve Türkiye'de kayıtlı şirketler için TL fiyatlar, KDV dahil:
- Pro: aylık 299 ₺ ya da yıllık 2.990 ₺.
- Business: aylık 699 ₺ ya da yıllık 6.990 ₺.
- Yıllık ödemede 2 ay bedava.
Diğer ülkeler için USD fiyatlar: Pro 9,99 USD/ay, Business 24,99 USD/ay.
- Ücretsiz plan: 3 müşteri, ayda 20 fatura, 100 gelir, 100 gider kaydı, 20 fatura PDF'i.
- Pro: 500 müşteri, ayda 500 fatura, 1000 gelir, 1000 gider, 500 PDF. Excel/CSV dışa aktarma.
- Business: bunların hepsi sınırsız.
- Yeni kayıt olan her şirket 7 gün boyunca bütün Pro özelliklerini ücretsiz kullanır, kart gerekmez. Süre bitince ücretsiz plana geçer; veriler silinmez.
- Teklif, tekrarlayan fatura, KDV raporu ve mali müşavir erişimi bütün planlarda vardır.
- Ödemeler Polar üzerinden alınır; abonelik istenildiği zaman iptal edilebilir.

HENÜZ YOK (planlı)
Yasal e-Arşiv/e-Fatura, gelişmiş raporlar, toplu dışa aktarma, ekip üyeleri (mali müşavir dışında), öncelikli destek.

GÜVENLİK
Şifreler açık metin olarak saklanmaz. Her kayıt yalnız kendi işletmesine aittir. Bağlantılar HTTPS ile şifrelidir.

BAĞLANTILAR
Kayıt: corpcontrol.net/auth/signup
Giriş: corpcontrol.net/auth/login
Fiyatlar: corpcontrol.net/pricing
İletişim: corpcontrol.net/contact
Gizlilik: corpcontrol.net/privacy · KVKK: corpcontrol.net/kvkk · Koşullar: corpcontrol.net/terms · İade: corpcontrol.net/refund

===== ENGLISH =====

WHAT CORPCONTROL IS
CorpControl keeps invoices, customers, income, expenses and payments in one workspace for freelancers, consultants, agencies and small businesses. It is not accounting software and needs no bank connection. Browser-based, nothing to install.

FOR TURKEY
- VAT (KDV) rates on invoices: 0%, 1%, 10%, 20%. Per-line discounts.
- Tax number (VKN/TCKN) and tax office fields for the company and its customers.
- For companies registered in Turkey the invoice PDF is titled "PROFORMA FATURA" with the note that it is for information only and does not replace a legal e-Arşiv/e-Fatura invoice.
- Legal e-Arşiv / e-Fatura invoices are not issued today; the integration is in preparation.
- Currencies: TRY, USD, EUR, GBP.

FEATURES
- Invoices: line items, tax, discounts; tracked from draft to paid. Email an invoice to the customer with the PDF attached.
- Automatic overdue reminders: reminder emails to customers for overdue invoices. Switched on in Settings; off by default.
- Quotes: create, email, mark accepted or rejected, turn into an invoice in one click.
- Recurring invoices: monthly, every 3 months or yearly. Each invoice is created as a draft, or emailed automatically if chosen.
- VAT report: output VAT (sales) and input VAT (expenses) per rate for a period; result shown as VAT payable or VAT carried forward. For information only; not a tax return.
- "Download PDF" on every list and report page, using the filter shown on screen.
- Excel/CSV export: on the Pro and Business plans.
- Customer and vendor account statements as PDF.
- Cheques and promissory notes: received and issued, with statuses such as in portfolio, presented, cleared and bounced.
- Bank reconciliation: import a bank statement (CSV) and match lines to invoices, payments, income and expenses, automatically or by hand.
- Income and expenses with categories and due dates. Payments, full or partial, update the invoice status automatically.
- Calendar and reports: due dates; income vs expenses, by category and per currency.

ACCOUNTANT ACCESS
- The owner invites their accountant by email from Settings. The link works for 7 days.
- The accountant sees every record and report, including the VAT report, and downloads PDFs and Excel/CSV files. They cannot change, delete or send anything, and do not see billing.
- One accountant account can open every company that invited it and switch between them.
- Free on every plan; not counted as a user.
- The owner can remove access in one click and sees the accountant's sign-ins and downloads in Settings.

PLANS (current prices are always on corpcontrol.net/pricing)
Visitors in Turkey and companies registered in Turkey see lira prices, VAT included:
- Pro: 299 TRY per month or 2,990 TRY per year.
- Business: 699 TRY per month or 6,990 TRY per year.
- Paying yearly gives 2 months free.
Everyone else sees USD prices: Pro 9.99 USD/month, Business 24.99 USD/month.
- Free: 3 customers, 20 invoices/month, 100 income and 100 expense entries/month, 20 invoice PDFs/month.
- Pro: 500 customers, 500 invoices/month, 1000 income, 1000 expenses, 500 PDFs/month. Excel/CSV export.
- Business: unlimited on all of the above.
- Every new company gets all Pro features free for 7 days, no card needed. Afterwards it moves to the free plan; no data is lost.
- Quotes, recurring invoices, the VAT report and accountant access are on every plan.
- Payments are processed by Polar; cancel any time.

NOT YET AVAILABLE (planned)
Legal e-Arşiv/e-Fatura, advanced reports, bulk export, team members (other than the accountant), priority support.

SECURITY
Passwords are never stored as text. Every record belongs to its own business only. Served over HTTPS.

LINKS
Sign up: corpcontrol.net/auth/signup
Log in: corpcontrol.net/auth/login
Pricing: corpcontrol.net/pricing
Contact: corpcontrol.net/contact
Privacy: corpcontrol.net/privacy · Terms: corpcontrol.net/terms · Refund policy: corpcontrol.net/refund
```

---

## Neden hep İngilizce konuşuyordu

1. Eski "Ek yönlendirme" metni modele açıkça "varsayılan olarak hep İngilizce cevap ver, sohbeti asla Türkçe açma" diyordu.
2. Kutunun dili (`widget_lang`) `en`: karşılama mesajı ve butonlar İngilizce.
3. Bilgi tabanı yalnız İngilizceydi.

Bölüm 1 ve 2 ile, Türkçe yazan ziyaretçi Türkçe cevap alır. **Karşılama mesajı** ise
hâlâ tek dildedir: Webtochat kutusu şu an sayfadan dil bilgisi almıyor. Türkiye'den
gelene Türkçe karşılama için Webtochat'te küçük bir kod değişikliği gerekir (bkz. rapor).
