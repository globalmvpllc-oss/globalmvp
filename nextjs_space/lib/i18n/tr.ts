import type { Dictionary } from './en';

/**
 * Turkish dictionary.
 *
 * Typed as `Dictionary`, so it must cover exactly the keys `en` defines — a
 * missing translation fails the build rather than rendering an empty label.
 */
export const tr: Dictionary = {
  // --- Navigation -----------------------------------------------------------
  'nav.dashboard': 'Panel',
  'nav.invoices': 'Faturalar',
  'nav.customers': 'Müşteriler',
  'nav.payments': 'Ödemeler',
  'nav.banking': 'Banka',
  'nav.income': 'Gelirler',
  'nav.expenses': 'Giderler',
  'nav.calendar': 'Takvim',
  'nav.reports': 'Raporlar',
  'nav.settings': 'Ayarlar',
  'nav.signOut': 'Çıkış yap',
  'nav.openMenu': 'Menüyü aç',
  'nav.menu': 'Menü',

  // --- Common actions -------------------------------------------------------
  'common.save': 'Kaydet',
  'common.cancel': 'İptal',
  'common.delete': 'Sil',
  'common.edit': 'Düzenle',
  'common.create': 'Oluştur',
  'common.close': 'Kapat',
  'common.back': 'Geri',
  'common.next': 'İleri',
  'common.saving': 'Kaydediliyor…',
  'common.deleting': 'Siliniyor…',
  'common.loading': 'Yükleniyor…',
  'common.tryAgain': 'Tekrar dene',
  'common.language': 'Dil',

  // --- Authentication -------------------------------------------------------
  'auth.signIn': 'Giriş yap',
  'auth.signUp': 'Kayıt ol',
  'auth.email': 'E-posta',
  'auth.password': 'Parola',
  'auth.name': 'Ad',
  'auth.signInTitle': 'Tekrar hoş geldiniz',
  'auth.signInSubtitle': 'Devam etmek için hesabınıza giriş yapın',
  'auth.signUpTitle': 'Hesabınızı oluşturun',
  'auth.signUpSubtitle': 'İşletme finanslarınızı yönetmeye başlayın',
  'auth.noAccount': 'Hesabınız yok mu?',
  'auth.haveAccount': 'Zaten hesabınız var mı?',
  'auth.signingIn': 'Giriş yapılıyor…',
  'auth.creatingAccount': 'Hesap oluşturuluyor…',
  'auth.invalidCredentials': 'E-posta veya parola hatalı',
  'auth.tooManyAttempts': 'Çok fazla giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.',
  'auth.sessionExpired': 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  'auth.noCompanyAccess': 'Bu işletmeye erişiminiz yok.',

  // --- Password reset & email verification ----------------------------------
  'auth.forgotPassword': 'Parolanızı mı unuttunuz?',
  'auth.forgotTitle': 'Parolanızı sıfırlayın',
  'auth.forgotSubtitle': 'E-postanızı girin, size bir sıfırlama bağlantısı gönderelim.',
  'auth.forgotSubmit': 'Sıfırlama bağlantısı gönder',
  'auth.forgotSent':
    'Bu e-postaya ait bir hesap varsa, sıfırlama bağlantısı yolda. Gelen kutunuzu kontrol edin.',
  'auth.backToLogin': 'Girişe dön',
  'auth.resetTitle': 'Yeni bir parola belirleyin',
  'auth.resetSubtitle': 'Hesabınız için yeni bir parola girin.',
  'auth.newPassword': 'Yeni parola',
  'auth.confirmPassword': 'Parolayı doğrulayın',
  'auth.resetSubmit': 'Parolayı sıfırla',
  'auth.resetSuccess': 'Parolanız sıfırlandı. Artık giriş yapabilirsiniz.',
  'auth.resetInvalid': 'Bu sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir tane isteyin.',
  'auth.resetMissingToken': 'Bu sıfırlama bağlantısında belirteç eksik.',
  'auth.passwordTooShort': 'Parola en az 8 karakter olmalıdır.',
  'auth.passwordMismatch': 'Parolalar eşleşmiyor.',
  'auth.genericError': 'Bir şeyler ters gitti. Lütfen tekrar deneyin.',
  'auth.continueWithGoogle': 'Google ile devam et',
  'auth.orContinueWith': 'veya e-posta ile devam edin',
  'auth.googleUnverified':
    'Google, e-posta adresinizin doğrulandığını teyit edemedi, bu yüzden giriş reddedildi. E-postanızı Google ile doğrulayıp tekrar deneyin.',
  'verify.title': 'E-posta doğrulama',
  'verify.checking': 'E-postanız doğrulanıyor…',
  'verify.success': 'E-postanız doğrulandı. Teşekkürler!',
  'verify.invalid': 'Bu doğrulama bağlantısı geçersiz veya süresi dolmuş.',
  'verify.goToApp': 'Panele git',

  // --- Onboarding -----------------------------------------------------------
  'onboarding.businessName': 'İşletme adı',
  'onboarding.businessNameDesc': 'İşletmenizin adı nedir?',
  'onboarding.country': 'Ülke',
  'onboarding.countryDesc': 'İşletmeniz nerede bulunuyor?',
  'onboarding.currency': 'Para birimi',
  'onboarding.currencyDesc': 'Birincil para biriminiz',
  'onboarding.businessType': 'İşletme türü',
  'onboarding.businessTypeDesc': 'Ne tür bir işletme?',
  'onboarding.details': 'Detaylar',
  'onboarding.detailsDesc': 'Adres ve vergi bilgileri (isteğe bağlı)',
  'onboarding.finish': 'Kurulumu tamamla',
  'onboarding.failed': 'Kurulum tamamlanamadı. Lütfen tekrar deneyin.',

  // --- Dashboard ------------------------------------------------------------
  'dashboard.welcome': 'Tekrar hoş geldiniz',
  'dashboard.subtitle': 'Bu ay işletmenize genel bakış',
  'dashboard.revenue': 'Gelir',
  'dashboard.expenses': 'Gider',
  'dashboard.profit': 'Kâr',
  'dashboard.receivables': 'Alacaklar',
  'dashboard.upcoming': 'Yaklaşan',
  'dashboard.upcomingActivity': 'Yaklaşan Hareketler',
  'dashboard.noRecords': 'Henüz finansal kayıt yok',
  'dashboard.noRecordsDesc':
    'İlk faturanızı, gelirinizi veya giderinizi kaydettiğinizde gelir, gider ve yaklaşan hareketleriniz burada görünecek.',
  'dashboard.loadFailed': 'Panel yüklenemedi',
  'dashboard.createInvoice': 'Fatura Oluştur',
  'dashboard.addIncome': 'Gelir Ekle',
  'dashboard.addExpense': 'Gider Ekle',

  // --- Subscription & Billing ----------------------------------------------
  'nav.billing': 'Faturalama',
  'billing.title': 'Abonelik ve Faturalama',
  'billing.subtitle': 'Aboneliğinizi, ödeme yönteminizi ve faturalarınızı yönetin.',
  'billing.currentPlan': 'Mevcut plan',
  'billing.planFree': 'Ücretsiz',
  'billing.planPro': 'Pro',
  'billing.planBusiness': 'Business',
  'billing.freeDescription': 'Şu anda Ücretsiz planı kullanıyorsunuz.',
  'billing.upgradePro': "Pro'ya yükselt",
  'billing.upgradeBusiness': "Business'a yükselt",

  'billing.subscription': 'Abonelik',
  'billing.status': 'Durum',
  'billing.billingCycle': 'Faturalama dönemi',
  'billing.monthly': 'Aylık',
  'billing.yearly': 'Yıllık',
  'billing.amount': 'Tutar',
  'billing.periodStart': 'Dönem başlangıcı',
  'billing.renewalDate': 'Yenileme tarihi',
  'billing.endsOn': 'Erişim bitiş tarihi',
  'billing.trialEnds': 'Deneme bitişi',
  'billing.canceledOn': 'İptal tarihi',
  'billing.manageSubscription': 'Aboneliği yönet',

  'billing.statusActive': 'Aktif',
  'billing.statusTrialing': 'Deneme',
  'billing.statusPastDue': 'Ödeme başarısız',
  'billing.statusCanceling': 'İptal ediliyor',
  'billing.statusExpired': 'Süresi doldu',
  'billing.pastDueNote': 'Son ödemeniz alınamadı. Erişiminizin sürmesi için ödeme yönteminizi güncelleyin.',
  'billing.cancelingNote': 'Aboneliğiniz iptal edildi ve ödenmiş dönemin sonuna kadar aktif kalacak.',

  'billing.actionFailed': 'Bu işlem tamamlanamadı. Lütfen tekrar deneyin.',
  'billing.checkoutReturn': 'Teşekkürler — ödemeniz onaylanıyor. Planınızın burada güncellenmesi birkaç saniye sürebilir.',

  'billing.loadFailed': 'Aboneliğiniz yüklenemedi',
  'billing.loadFailedNote': 'Plan bilgileriniz geçici olarak görüntülenemiyor. Aboneliğinizde hiçbir değişiklik olmadı. Lütfen kısa süre sonra tekrar deneyin.',
  // --- Planlar, limitler ve fiyatlandırma ------------------------------------
  'billing.planFreeTagline': "CorpControl'e yeni başlayan işletmeler için.",
  'billing.planProTagline': 'Küçük işletmeler için',
  'billing.planBusinessTagline': 'Büyüyen işletmeler için',
  'billing.currentPlanBadge': 'Mevcut plan',
  'billing.monthlyInterval': 'Aylık',
  'billing.yearlyInterval': 'Yıllık',
  'billing.perMonth': '/ ay',
  'billing.perYear': '/ yıl',
  'billing.whatsIncluded': 'Neler dahil?',
  'billing.comparePlans': 'Planları karşılaştır',
  'billing.included': 'Dahil',
  'billing.notIncluded': 'Dahil değil',
  'billing.unlimited': 'Sınırsız',
  'billing.perMonthShort': '/ay',
  'billing.equivalentPerMonth': 'Ayda {perMonth} eder',
  'billing.youSavePerYear': 'Yılda {saved} tasarruf edersiniz',
  'billing.savePercent': '%{percent} tasarruf',
  'billing.yearlyExplainer': 'Yıllık ödeyin, aylık plana kıyasla %{percent} tasarruf edin.',
  'billing.twelveMonthsCost': '12 aylık ödeme {total} tutar',

  'billing.planned': 'Planlanan',
  'billing.plannedNote':
    'Planlanan özellikler henüz kullanılabilir değildir ve bugün ödediğiniz kapsama dahil değildir. Yayına alındıklarında burada kullanılabilir olarak listelenecektir.',
  'billing.teamMembersNote':
    'Ekip üyesi daveti henüz mümkün değil; bu nedenle plandan bağımsız olarak her şirketin tek üyesi vardır.',

  // --- Limit mesajları ------------------------------------------------------
  'limit.title': 'Plan limitine ulaşıldı',
  'limit.invoices': '{plan} planında bu ay {limit} fatura sınırına ulaştınız.',
  'limit.customers': '{plan} planında {limit} müşteri sınırına ulaştınız.',
  'limit.income': '{plan} planında bu ay {limit} gelir kaydı sınırına ulaştınız.',
  'limit.expenses': '{plan} planında bu ay {limit} gider kaydı sınırına ulaştınız.',
  'limit.invoicePdf': '{plan} planında bu ay {limit} fatura PDF sınırına ulaştınız.',
  'limit.upgradeHint': 'Devam etmek için planınızı yükseltin.',
  'limit.generic': 'Mevcut planınızın sınırına ulaştınız. Devam etmek için yükseltin.',

  // --- Özellik adları -------------------------------------------------------
  'feature.dashboard': 'Panel',
  'feature.customers': 'Müşteriler',
  'feature.invoices': 'Faturalar',
  'feature.invoicePdf': 'Fatura PDF',
  'feature.income': 'Gelir takibi',
  'feature.expenses': 'Gider takibi',
  'feature.payments': 'Ödeme takibi',
  'feature.calendar': 'Takvim',
  'feature.reports': 'Temel raporlar',
  'feature.branding': 'Şirket markası',
  'feature.currencies': 'Çoklu para birimi',
  'feature.billing': 'Abonelik yönetimi',
  'feature.advancedReports': 'Gelişmiş raporlar',
  'feature.dataExport': 'Veri dışa aktarma',
  'feature.bulkExport': 'Toplu / aylık dışa aktarma',
  'feature.teamMembers': 'Ekip üyeleri',
  'feature.businessControls': 'Gelişmiş işletme kontrolleri',
  'feature.prioritySupport': 'Öncelikli destek',

  // --- Deneme süresi --------------------------------------------------------
  'trial.proTrial': 'Pro Deneme',
  'trial.freeTrial': '{days} günlük ücretsiz deneme',
  'trial.daysRemaining': '{days} gün kaldı',
  'trial.lastDay': 'Denemenizin son günü',
  'trial.endsOn': 'Denemeniz {date} tarihinde sona eriyor',
  'trial.continueCta': "Pro ile devam et",
  'trial.ended': 'Deneme süreniz sona erdi',
  'trial.onFreeNow': 'Şu anda Ücretsiz plandasınız.',
  'trial.noAutoCharge': 'Otomatik olarak hiçbir ücret alınmaz. Ücretli bir plan seçmezseniz denemeniz sadece sona erer.',

  'billing.priceOnCheckout': 'Fiyat, herhangi bir ücret alınmadan önce ödeme adımında gösterilir.',
  // --- Toplu PDF ------------------------------------------------------------
  'bulk.downloadPdf': 'PDF İndir',
  'bulk.bulkDownloadPdf': 'Toplu PDF İndir',
  'bulk.selectAtLeastOne': 'En az bir kayıt seçin.',
  'bulk.generating': "PDF'ler oluşturuluyor...",
  'bulk.downloaded': '{count} PDF başarıyla indirildi.',
  'bulk.someFailed': '{count} kayıt oluşturulamadı ve arşive eklenmedi.',
  'bulk.noneGenerated': 'Hiçbir PDF oluşturulamadı, indirilecek bir şey yok.',
  'bulk.limitReached': 'Bu işlem sırasında planınızın aylık PDF hakkı doldu.',
  'bulk.notConfigured': 'PDF servisi yapılandırılmadığı için toplu indirme kullanılamıyor. Faturaları yine de yazdırabilirsiniz.',
  'bulk.maxPerBatch': 'Tek arşivde yalnızca seçtiğiniz ilk {max} kayıt yer alır.',
  'bulk.selectAll': 'Tümünü seç',
  'bulk.selectedCount': '{count} seçildi',

  'billing.payment': 'Ödeme',
  'billing.paymentNote': 'Ödeme yöntemi Polar üzerinden güvenli şekilde yönetilir.',
  'billing.managePaymentMethod': 'Ödeme yöntemini yönet',

  'billing.history': 'Fatura geçmişi',
  'billing.historyNote': 'Faturalar ve makbuzlar müşteri faturalama portalında bulunur.',
  'billing.viewHistory': 'Fatura geçmişini görüntüle',

  'billing.notConfigured': 'Henüz kullanılamıyor',
  'billing.notConfiguredNote':
    'Ödeme ve faturalama portalı henüz bağlanmadı, bu nedenle bu işlemler kullanılamıyor. Hiçbir ücret alınmıyor ve aktif abonelik yok.',

  // --- Category display labels ---------------------------------------------
  // Display only. The database keeps the English value.
  'category.services': 'Hizmetler',
  'category.products': 'Ürünler',
  'category.consulting': 'Danışmanlık',
  'category.otherIncome': 'Diğer Gelir',
  'category.officeSupplies': 'Ofis Malzemeleri',
  'category.rent': 'Kira',
  'category.utilities': 'Faturalar',
  'category.software': 'Yazılım',
  'category.marketing': 'Pazarlama',
  'category.travel': 'Seyahat',
  'category.insurance': 'Sigorta',
  'category.otherExpense': 'Diğer Gider',

  // See en.ts: kept true by PLAN_LIMITS.free.customers (3) and TRIAL_DAYS (15).
  'landing.heroTagline': '3 müşteriyle ücretsiz başlayın.',
  'landing.heroTaglineTrial': '15 Gün Boyunca Tüm Pro Özellikleri Kullanın.',

  'landing.skipToContent': 'İçeriğe geç',
  'landing.logoHome': 'CorpControl ana sayfa',
  'landing.nav.main': 'Ana menü',
  'landing.nav.mobile': 'Mobil menü',
  'landing.nav.openMenu': 'Menüyü aç',
  'landing.nav.features': 'Özellikler',
  'landing.nav.howItWorks': 'Nasıl Çalışır',
  'landing.nav.pricing': 'Fiyatlandırma',
  'landing.nav.faq': 'SSS',
  'landing.cta.logIn': 'Giriş yap',
  'landing.cta.startFree': 'Ücretsiz başla',
  'landing.cta.seeHowItWorks': 'Nasıl çalıştığını gör',
  'landing.cta.seePlans': 'Planları gör',
  'landing.cta.readFaq': 'SSS bölümünü oku',

  'landing.hero.eyebrow': 'İşletme finansı, sadeleştirildi',
  'landing.hero.title': 'İşletme finansınızı karmaşaya boğulmadan yönetin',
  'landing.hero.subtitle':
    'CorpControl faturaları, müşterileri, gelirleri, giderleri ve ödemeleri tek bir sade çalışma alanında tutar — böylece muhasebe yazılımı öğrenmeden paranızın nerede olduğunu her zaman bilirsiniz.',
  'landing.hero.trustNoBank': 'Banka bağlantısı gerekmez',
  'landing.hero.trustSetup': 'Dakikalar içinde kurulum',
  'landing.hero.trustCurrencies': 'Birden fazla para birimiyle çalışır',

  'landing.preview.ariaLabel':
    'CorpControl panelinin önizlemesi: gelir, gider, tahsil edilmemiş bakiye ve son faturaların listesi. Örnek veri.',
  'landing.preview.dashboard': 'Panel',
  'landing.preview.sampleData': 'Örnek veri',
  'landing.preview.revenue': 'Gelir',
  'landing.preview.expenses': 'Gider',
  'landing.preview.outstanding': 'Tahsil edilmemiş',
  'landing.preview.thisMonth': 'Bu ay',
  'landing.preview.threeInvoices': '3 fatura',
  'landing.preview.recentInvoices': 'Son faturalar',
  'landing.preview.statusPaid': 'Ödendi',
  'landing.preview.statusSent': 'Gönderildi',
  'landing.preview.statusOverdue': 'Gecikmiş',

  'landing.trust.setupTitle': 'Kolay kurulum',
  'landing.trust.setupBody': 'Hesap oluşturun, işletme bilgilerinizi ekleyin, fatura kesmeye başlayın.',
  'landing.trust.currenciesTitle': 'Birden fazla para birimi',
  'landing.trust.currenciesBody': 'USD, EUR, GBP veya TRY ile fatura kesin ve ödeme kaydedin.',
  'landing.trust.noBankTitle': 'Banka bağlantısı yok',
  'landing.trust.noBankBody': 'Bağlanacak bir şey yok. Neyin girdiğini siz kontrol edersiniz.',
  'landing.trust.overviewTitle': 'Tek bir genel bakış',
  'landing.trust.overviewBody': 'Faturalar, giderler ve ödemeler tek bir panelde.',

  'landing.problem.eyebrow': 'Sorun',
  'landing.problem.title': 'Çoğu küçük işletmenin muhasebe yazılımına ihtiyacı yoktur',
  'landing.problem.description':
    'Kimin borcu olduğunu, ne harcadıklarını ve ayın nasıl kapandığını bilmeleri yeterlidir. Bu çok daha küçük bir sorundur ve çok daha küçük bir araç hak eder.',
  'landing.problem.p1': 'Rakamlar üç ayrı tabloda duruyor',
  'landing.problem.s1': 'Tek bir çalışma alanı faturaları, gelirleri, giderleri ve ödemeleri bir arada tutar.',
  'landing.problem.p2': 'Ödenmemiş bir fatura haftalarca fark edilmiyor',
  'landing.problem.s2': 'Tahsil edilmemiş bakiyeler ve vade tarihleri panelde ve takvimde durur.',
  'landing.problem.p3': 'Giderler yıl sonunda hatırlanarak yeniden oluşturuluyor',
  'landing.problem.s3': 'Gideri olduğu anda, kategorisi ve vade tarihiyle birlikte kaydedin.',
  'landing.problem.p4': 'Muhasebe yazılımı sizi muhasebeci sayıyor',
  'landing.problem.s4': 'Sade ekranlar, sade bir dil, kullanmak için kurs gerektirmeyen bir araç.',

  'landing.tour.eyebrow': 'İçeriden bir bakış',
  'landing.tour.title': 'Gerçekten kullanacağınız ekranlar',
  'landing.tour.description':
    'Hiç açmayacağınız grafiklerle dolu paneller yok. Sadece işin çoğunun döndüğü üç yer.',
  'landing.tour.tabDashboard': 'Panel',
  'landing.tour.tabInvoices': 'Faturalar',
  'landing.tour.tabPayments': 'Ödemeler',
  'landing.tour.frameOverview': 'Finansal genel bakış',
  'landing.tour.revenueThisMonth': 'Bu ayki gelir',
  'landing.tour.expensesThisMonth': 'Bu ayki gider',
  'landing.tour.outstanding': 'Tahsil edilmemiş',
  'landing.tour.captionInvoices': 'Müşteri, vade tarihi, tutar ve durum içeren örnek fatura listesi',
  'landing.tour.captionPayments': 'Faturalara karşılık kaydedilmiş örnek ödeme listesi',
  'landing.tour.colInvoice': 'Fatura',
  'landing.tour.colClient': 'Müşteri',
  'landing.tour.colDue': 'Vade',
  'landing.tour.colAmount': 'Tutar',
  'landing.tour.colStatus': 'Durum',
  'landing.tour.colMethod': 'Yöntem',
  'landing.tour.colAppliedTo': 'Uygulandığı fatura',
  'landing.tour.colDate': 'Tarih',
  'landing.tour.methodBankTransfer': 'Havale',
  'landing.tour.methodCard': 'Kart',

  'landing.features.eyebrow': 'Neler sunuyoruz',
  'landing.features.title': 'İhtiyacınız olan her şey, olmayan hiçbir şey',
  'landing.features.description':
    'Küçük bir işletmede paranın gerçekte nasıl hareket ettiğini kapsayan altı alan.',
  'landing.features.invoicesTitle': 'Faturalar',
  'landing.features.invoicesBody':
    'Kalem, vergi ve indirimlerle fatura oluşturun, ardından taslaktan tahsilata kadar takip edin.',
  'landing.features.customersTitle': 'Müşteriler',
  'landing.features.customersBody':
    'Müşteri bilgilerini tek yerde tutun ve her birine bağlı tüm fatura ve ödemeleri görün.',
  'landing.features.moneyTitle': 'Gelir ve gider',
  'landing.features.moneyBody':
    'Gireni ve çıkanı kategoriler, tarihler ve düzenli kalan vade tarihleriyle kaydedin.',
  'landing.features.paymentsTitle': 'Ödemeler',
  'landing.features.paymentsBody':
    'Bir faturaya tam veya kısmi ödeme işleyin ve durumunun kendiliğinden güncellenmesini izleyin.',
  'landing.features.calendarTitle': 'Takvim',
  'landing.features.calendarBody':
    'Fatura vadelerini, gider vadelerini ve ödeme tarihlerini ay boyunca yayılmış görün.',
  'landing.features.reportsTitle': 'Raporlar',
  'landing.features.reportsBody':
    'Geliri gidere karşı zaman içinde, kategori kırılımıyla ve para birimi ayrı tutularak inceleyin.',

  'landing.how.eyebrow': 'Başlarken',
  'landing.how.title': 'Üç adım, sonrası çalışmak',
  'landing.how.description':
    'Kurulum kısa. İşletme bilgileriniz girildiği anda ilk faturanızı hemen oluşturabilirsiniz.',
  'landing.how.step1Title': 'Hesabınızı oluşturun',
  'landing.how.step1Body':
    'Bir e-posta adresi ve parolayla kaydolun. Kurulacak bir şey yok, yapılandırılacak bir şey yok.',
  'landing.how.step2Title': 'İşletmenizi tanımlayın',
  'landing.how.step2Body':
    'İşletme adınızı, ülkenizi ve varsayılan para biriminizi ekleyin. Kategoriler sizin için oluşturulur.',
  'landing.how.step3Title': 'Finansınızı takip edin',
  'landing.how.step3Body':
    'Müşteri ekleyin, fatura oluşturun, gider ve ödeme kaydedin. Paneliniz kendi kendini doldurur.',

  'landing.benefits.eyebrow': 'Neden işe yarar',
  'landing.benefits.title': 'Daha az idari iş, daha net rakamlar',
  'landing.benefits.b1Title': 'Paranızda ne olup bittiğini bilin',
  'landing.benefits.b1Body':
    'Gelir, gider ve size hâlâ borçlu olunan tutar tek ekranda, para birimi bazında ayrı tutulur.',
  'landing.benefits.b2Title': 'Tahsil edilmemiş ödemelerin üstünde kalın',
  'landing.benefits.b2Body':
    'Her fatura durumunu ve vadesini taşır, böylece hiçbir şey sessizce vadesini geçirmez.',
  'landing.benefits.b3Title': 'İşletme finansını düzenli tutun',
  'landing.benefits.b3Body':
    'Müşteriler, faturalar, giderler ve ödemeler dosyalara dağılmak yerine bağlantılı kalır.',
  'landing.benefits.b4Title': 'Tablolarla daha az zaman harcayın',
  'landing.benefits.b4Body':
    'Bir kez kaydedin. Toplamlar, durumlar ve raporlar ek iş gerektirmeden bunu takip eder.',

  'landing.pricingTeaser.eyebrow': 'Fiyatlandırma',
  'landing.pricingTeaser.title': 'Sade başlayın. İhtiyaç duydukça büyüyün.',
  'landing.pricingTeaser.description':
    'CorpControl serbest çalışanlar, danışmanlar, ajanslar ve küçük işletmeler için tasarlandı — kurumsal bir finans departmanına değil, finansının düzenli olmasına ihtiyaç duyan insanlar için.',

  'landing.security.eyebrow': 'Güven',
  'landing.security.title': 'İşletme verileriniz sizin kalır',
  'landing.security.description':
    'Yalnızca ürünün gerçekten yaptığını anlatıyoruz. Alınmamış hiçbir sertifika iddia edilmiyor.',
  'landing.security.authTitle': 'Güvenli kimlik doğrulama',
  'landing.security.authBody':
    'Parolalar özetlenir, hiçbir zaman düz metin olarak saklanmaz ve oturumlar imzalanır.',
  'landing.security.separationTitle': 'Şirket düzeyinde ayrım',
  'landing.security.separationBody':
    'Her kayıt işletmenize bağlıdır. İstekler yalnızca kendi verinize ulaşabilir.',
  'landing.security.encryptionTitle': 'Aktarımda şifreli',
  'landing.security.encryptionBody':
    'Uygulama HTTPS üzerinden sunulur ve veritabanına TLS üzerinden bağlanır.',
  'landing.security.accessTitle': 'Her yerden erişim',
  'landing.security.accessBody':
    'Modern her cihazda tarayıcıda çalışır. Kurulacak veya güncel tutulacak bir şey yok.',

  'landing.faq.eyebrow': 'Sorular',
  'landing.faq.title': 'Sıkça sorulan sorular',
  'landing.faq.q1': 'CorpControl nedir?',
  'landing.faq.a1':
    'Küçük bir işletmenin para tarafını yönetmek için bir çalışma alanı: faturalar, müşteriler, gelirler, giderler, ödemeler, finansal panel ve raporlar. Geleneksel muhasebe yazılımlarından bilinçli olarak daha sadedir.',
  'landing.faq.q2': 'Kimler için?',
  'landing.faq.a2':
    'Muhasebeci tutmadan veya çift taraflı kayıt öğrenmeden finansını düzenli tutmak isteyen serbest çalışanlar, danışmanlar, ajanslar, bağımsız profesyoneller ve küçük işletmeler için.',
  'landing.faq.q3': 'Fatura oluşturup yönetebilir miyim?',
  'landing.faq.a3':
    'Evet. Birden fazla kalem, miktar, kalem bazında vergi ve indirimle fatura oluşturabilir, ardından taslak, gönderildi, kısmen ödendi, ödendi, gecikmiş veya iptal edildi durumları arasında ilerletebilirsiniz.',
  'landing.faq.q4': 'Giderleri takip edebilir miyim?',
  'landing.faq.a4':
    'Evet. Giderleri açıklama, kategori, tutar, para birimi ve isteğe bağlı vade tarihiyle kaydedin ve bir tedarikçiye bağlayın. Ödenmemiş giderler yaklaşan ödemeler olarak görünür.',
  'landing.faq.q5': 'Faturalara karşılık ödeme kaydedebilir miyim?',
  'landing.faq.a5':
    'Evet. Tam veya kısmi ödeme kaydedebilirsiniz. Fatura bakiyesi ve durumu, karşılığında kaydedilen ödemelere göre otomatik güncellenir.',
  'landing.faq.q6': 'CorpControl birden fazla para birimini destekliyor mu?',
  'landing.faq.a6':
    'Evet. Faturalar, gelirler, giderler ve ödemelerin her biri USD, EUR, GBP veya TRY olarak kaydedilebilir. Toplamlar her zaman para birimi bazında raporlanır ve asla birbirine karıştırılmaz.',
  'landing.faq.q7': 'Banka hesabımı bağlamam gerekiyor mu?',
  'landing.faq.a7':
    'Hayır. CorpControl bankalara bağlanmaz. Gelirleri, giderleri ve ödemeleri siz kaydedersiniz; bu da paylaşılacak hiçbir bankacılık bilgisi olmaması demektir.',
  'landing.faq.q8': 'Her yerden kullanabilir miyim?',
  'landing.faq.a8':
    'Evet. Masaüstü, dizüstü, tablet ve mobilde tarayıcıda çalışır. Kurulacak ve güncel tutulacak hiçbir şey yok.',

  'landing.finalCta.title': 'İşletme finansınızın kontrolünü elinize alın',
  'landing.finalCta.description':
    'Faturaları, giderleri, ödemeleri ve finansal içgörüleri tek bir sade çalışma alanında tutun.',

  'landing.footer.tagline':
    'Asıl işini yapmayı tercih eden insanlar için işletme finansı yönetimi.',
  'landing.footer.product': 'Ürün',
  'landing.footer.company': 'Şirket',
  'landing.footer.legal': 'Yasal',
  'landing.footer.contact': 'İletişim',
  'landing.footer.privacy': 'Gizlilik Politikası',
  'landing.footer.terms': 'Kullanım Koşulları',
  'landing.footer.cookies': 'Çerez Politikası',
  'landing.footer.kvkk': 'KVKK Aydınlatma Metni',
  'landing.footer.rights': 'Tüm hakları saklıdır.',

  // --- /pricing -------------------------------------------------------------
  'pricingPage.eyebrow': 'Fiyatlandırma',
  'pricingPage.title': 'Sade başlayın. İhtiyaç duydukça büyüyün.',
  'pricingPage.subtitle':
    'CorpControl serbest çalışanlar, danışmanlar, ajanslar ve küçük işletmeler için tasarlandı. Bir hesap oluşturun ve bugün kullanmaya başlayın.',
  'pricingPage.cardEyebrow': 'Başlayın',
  'pricingPage.cardTitle': 'Tek çalışma alanında her şey',
  'pricingPage.cardBody':
    'Ayrıntılı planlar hâlâ son haline getiriliyor. Bu arada bir hesap oluşturup işletme finansınızı yönetmek için CorpControl kullanabilirsiniz.',
  'pricingPage.f1': 'Kalem, vergi ve indirimli faturalar',
  'pricingPage.f2': 'Müşteri ve tedarikçi kayıtları',
  'pricingPage.f3': 'Gelir ve gider takibi',
  'pricingPage.f4': 'Tam ve kısmi ödeme kaydı',
  'pricingPage.f5': 'Finansal panel ve raporlar',
  'pricingPage.f6': 'Vade tarihleri takvimi',
  'pricingPage.f7': 'Çoklu para birimi desteği (USD, EUR, GBP, TRY)',
  'pricingPage.noBankNote': 'Banka bağlantısı gerekmez.',
  'pricingPage.questionLead': 'Planlar hakkında sorunuz mu var? ',
  'pricingPage.questionLink': 'Bize ulaşın',
  'pricingPage.questionTail': '.',
  'pricingPage.ctaTitle': 'Finansınızı düzene sokmaya hazır mısınız?',
  'pricingPage.ctaBody':
    'Bir hesap oluşturun ve bugün fatura, gider ve ödeme kaydetmeye başlayın.',

  // --- /contact -------------------------------------------------------------
  'contactPage.title': 'İletişim',
  'contactPage.intro':
    'CorpControl henüz yolun başında ve sizden haber almamayı değil, almayı tercih ederiz. Her tür başvurunun neyi kapsadığı aşağıda.',
  'contactPage.generalTitle': 'Genel sorular',
  'contactPage.generalBody':
    'CorpControl’ün ne yaptığı, çalışma biçiminize uyup uymadığı veya fiyatlandırma hakkındaki sorular.',
  'contactPage.supportTitle': 'Destek',
  'contactPage.supportBody':
    'Beklendiği gibi çalışmayan bir şey. Olduğu sırada ne yaptığınızı ve bunun yerine ne gördüğünüzü bize yazın.',
  'contactPage.privacyTitle': 'Gizlilik ve veri talepleri',
  'contactPage.privacyBody':
    'Size uygulanan veri koruma mevzuatı kapsamındaki erişim, düzeltme, dışa aktarma veya silme talepleri.',
  'contactPage.reachTitle': 'Bize nasıl ulaşırsınız',
  'contactPage.reachBody':
    'Yayımlanacak iletişim kanallarımız son haline getiriliyor ve bu sayfada yer alacak. O zamana kadar bu sayfa, henüz arkasında duramayacağımız bir adres yazmak yerine ele aldığımız başvuru türlerini anlatıyor.',
  'contactPage.businessTitle': 'İşletme bilgileri',
  'contactPage.businessBody':
    'CorpControl, hizmeti sunmaktan sorumlu olan tüzel kişi tarafından işletilmektedir. Tescilli işletme bilgileri, doğrulandığında yukarıdaki iletişim kanallarıyla birlikte burada yayımlanacaktır.',
  'contactPage.moreLead': 'Belirli bir şey mi arıyorsunuz? ',
  'contactPage.moreFaqLink': 'sıkça sorulan soruları',
  'contactPage.moreMid': ' okuyun veya bilgileri nasıl işlediğimizi ',
  'contactPage.morePrivacyLink': 'Gizlilik Politikası',
  'contactPage.moreTail': '’nda görün.',

  // --- Legal page shell -----------------------------------------------------
  'legal.lastUpdated': 'Son güncelleme:',

  // --- Public pricing ---------------------------------------------------------
  'landing.pricing.trustLine': 'Ödemeler Polar üzerinden güvenli şekilde alınır. İstediğiniz zaman iptal edebilirsiniz.',
  'landing.pricing.questionsCta': 'Soru sorun',

  // --- Acquisition landing pages ----------------------------------------------
  // Sayfalar İngilizce yayınlanıyor; bu çeviriler sözlük bütünlüğü için var.
  'landing.shared.stepsEyebrow': 'Başlangıç',
  'landing.shared.stepsTitle': 'Üç adım, sonrası iş',
  'landing.shared.step1Title': 'Hesabınızı oluşturun',
  'landing.shared.step1Body': 'Bir e-posta adresiyle kaydolun. Kurulum yok, yapılandırma yok.',
  'landing.shared.step2Title': 'İşletmenizi ekleyin',
  'landing.shared.step2Body': 'İşletme adı, ülke ve para birimi. Kategoriler sizin için oluşturulur.',
  'landing.shared.seePricing': 'Fiyatları görün',
  'landing.shared.seeHowItWorks': 'Nasıl çalıştığını görün',

  // /finance
  'landing.finance.metaTitle': 'Küçük İşletmeler için Finans Yönetimi Yazılımı',
  'landing.finance.metaDescription':
    'Gelir, gider, fatura ve ödemeleri tek yerde takip edin. CorpControl, muhasebe yazılımı karmaşası olmadan net bir finansal tablo sunar.',
  'landing.finance.eyebrow': 'İşletme finans yönetimi',
  'landing.finance.title': 'İşletme finanslarınızı karmaşa olmadan yönetin',
  'landing.finance.subtitle':
    'Faturalar, müşteriler, gelir, gider ve ödemeler tek çalışma alanında. Ne kazandığınızı, ne harcadığınızı ve size ne kaldığını her an bilin.',
  'landing.finance.point1': 'Banka bağlantısı gerekmez',
  'landing.finance.point2': 'Dakikalar içinde kurulum',
  'landing.finance.point3': 'Ücretsiz planla başlayın',
  'landing.finance.benefitsEyebrow': 'Ne işe yarar',
  'landing.finance.benefitsTitle': 'Paranızın net bir görüntüsü',
  'landing.finance.benefit1Title': 'Nerede olduğunuzu bilin',
  'landing.finance.benefit1Body':
    'Ciro, gider ve tahsil edilmemiş tutarlar tek panoda; para birimleri ayrı tutulur, toplamlar asla karışmaz.',
  'landing.finance.benefit2Title': 'Tablo kovalamayı bırakın',
  'landing.finance.benefit2Body':
    'Bir kez kaydedin. Toplamlar, durumlar ve raporlar elle tutulmak yerine kendiliğinden oluşur.',
  'landing.finance.benefit3Title': 'Çalışma şeklinize göre',
  'landing.finance.benefit3Body':
    'Sade ekranlar, sade dil. Öğrenilecek hesap planı ya da çift taraflı kayıt yok.',
  'landing.finance.step3Title': 'Finanslarınızı takip edin',
  'landing.finance.step3Body':
    'Müşteri ekleyin, fatura oluşturun, gider ve ödeme kaydedin. Pano kendini doldurur.',
  'landing.finance.featuresTitle': 'Neler var',
  'landing.finance.feature1': 'Ciro, gider ve alacakları gösteren finansal pano',
  'landing.finance.feature2': 'Satır kalemleri, vergi ve iskontolu faturalar',
  'landing.finance.feature3': 'Kategori ve vade tarihli gelir ve gider kayıtları',
  'landing.finance.feature4': 'Tam ve kısmi ödeme takibi',
  'landing.finance.feature5': 'Zaman içinde geliri gidere karşı gösteren raporlar',
  'landing.finance.feature6': 'Ayrı raporlanan, birbirine karışmayan çoklu para birimi',
  'landing.finance.closingTitle': 'İşletme finanslarınızın kontrolünü alın',
  'landing.finance.closingBody':
    'Ücretsiz planla başlayın ve rakamlarınızı bugün tek yerde görün.',

  // /invoicing
  'landing.invoicing.metaTitle': 'Küçük İşletmeler için Basit Faturalama Yazılımı',
  'landing.invoicing.metaDescription':
    'Fatura oluşturun, neyin ödendiğini ve neyin geciktiğini takip edin, tam veya kısmi ödeme kaydedin. Serbest çalışanlar ve küçük işletmeler için basit fatura yönetimi.',
  'landing.invoicing.eyebrow': 'Faturalama ve ödeme takibi',
  'landing.invoicing.title': 'Alacağınızı takip eden basit faturalama',
  'landing.invoicing.subtitle':
    'Birkaç dakikada fatura hazırlayın, PDF olarak indirin ve hangilerinin ödendiğini, kısmen ödendiğini veya geciktiğini tek bakışta görün.',
  'landing.invoicing.point1': 'Satır kalemi, vergi ve iskonto',
  'landing.invoicing.point2': 'Kısmi ödeme desteği',
  'landing.invoicing.point3': 'PDF fatura dahil',
  'landing.invoicing.benefitsEyebrow': 'Ne işe yarar',
  'landing.invoicing.benefitsTitle': 'Durumunu kendi takip eden faturalar',
  'landing.invoicing.benefit1Title': 'Hiçbir vade gözden kaçmaz',
  'landing.invoicing.benefit1Body':
    'Her fatura kendi durumunu ve vadesini taşır; gecikenler panoda ve takvimde öne çıkar.',
  'landing.invoicing.benefit2Title': 'Ödeme faturayı günceller',
  'landing.invoicing.benefit2Body':
    'Tam veya kısmi ödeme kaydedin; bakiye ve durum kendiliğinden güncellenir. Mutabakat için tablo tutmanıza gerek yok.',
  'landing.invoicing.benefit3Title': 'Sizin faturanız, sizin markanız',
  'landing.invoicing.benefit3Body':
    'Logonuz, işletme bilgileriniz ve vergi bilgileriniz müşterinizin aldığı PDF üzerinde görünür.',
  'landing.invoicing.step3Title': 'İlk faturanızı oluşturun',
  'landing.invoicing.step3Body':
    'Müşteri ekleyin, kalemleri girin ve PDF indirin. Numaralandırma sizin için yapılır.',
  'landing.invoicing.featuresTitle': 'Faturalama neler yapar',
  'landing.invoicing.feature1': 'Miktar, vergi ve satır bazlı iskontolu çok satırlı faturalar',
  'landing.invoicing.feature2': 'Taslak, gönderildi, kısmen ödendi, ödendi, gecikti ve iptal durumları',
  'landing.invoicing.feature3': 'Tam ve kısmi ödeme kaydı',
  'landing.invoicing.feature4': 'Kendi önekinizle sıralı fatura numaralandırma',
  'landing.invoicing.feature5': 'Logonuzu ve işletme bilgilerinizi taşıyan PDF faturalar',
  'landing.invoicing.feature6': 'Her fatura ve ödemeye bağlı müşteri kayıtları',
  'landing.invoicing.closingTitle': 'İlk faturanızı bugün oluşturun',
  'landing.invoicing.closingBody':
    'Ücretsiz planla başlayın ve kimin ne borcu olduğunu tam olarak görün.',

  // /expenses
  'landing.expenses.metaTitle': 'Basit İşletme Gider Takibi Yazılımı',
  'landing.expenses.metaDescription':
    'Excel tablosu olmadan işletme giderlerinizi takip edin. Harcamalarınızı kategori, tedarikçi ve vade tarihiyle kaydedin, gelirinize karşı görün.',
  'landing.expenses.eyebrow': 'Gider takibi',
  'landing.expenses.title': 'İşletme giderlerini tablolar olmadan takip edin',
  'landing.expenses.subtitle':
    'Harcamayı olduğu anda kategorisi, tedarikçisi ve vadesiyle kaydedin; kazandığınıza karşı görün.',
  'landing.expenses.point1': 'Kategoriler hazır gelir',
  'landing.expenses.point2': 'Ödenen ve ödenmeyen ayrı takip',
  'landing.expenses.point3': 'Banka bağlantısı gerekmez',
  'landing.expenses.benefitsEyebrow': 'Ne işe yarar',
  'landing.expenses.benefitsTitle': 'Sonradan derlenen değil, anında kaydedilen giderler',
  'landing.expenses.benefit1Title': 'Yıl sonu telaşı yok',
  'landing.expenses.benefit1Body':
    'Gideri olduğu anda kaydedin; yılı hafızanızdan ve fiş klasöründen yeniden kurmak zorunda kalmayın.',
  'landing.expenses.benefit2Title': 'Ödenmemişleri görün',
  'landing.expenses.benefit2Body':
    'Ödenmemiş giderler vade taşır ve yaklaşan ödemeler arasında görünür; bir fatura gözden kaçmaz.',
  'landing.expenses.benefit3Title': 'Harcama ve kazanç birlikte',
  'landing.expenses.benefit3Body':
    'Raporlar gideri zaman içinde gelirin yanına koyar ve harcamayı kategoriye göre ayırır.',
  'landing.expenses.step3Title': 'Harcamanızı kaydedin',
  'landing.expenses.step3Body':
    'Kategorisi, tutarı ve vadesiyle bir gider ekleyin. İsterseniz bir tedarikçiye bağlayın.',
  'landing.expenses.featuresTitle': 'Gider takibi neler yapar',
  'landing.expenses.feature1': 'Açıklama, kategori, tutar ve para birimiyle giderler',
  'landing.expenses.feature2': 'Vade tarihli ödendi ve ödenmedi durumu',
  'landing.expenses.feature3': 'Harcamanıza bağlı tedarikçi kayıtları',
  'landing.expenses.feature4': 'Bir gidere karşı kaydedilen ödemeler',
  'landing.expenses.feature5': 'Raporlarda kategoriye göre harcama',
  'landing.expenses.feature6': 'Takvimde faturalarla birlikte vade tarihleri',
  'landing.expenses.closingTitle': 'Giderlerinizi düzgün bir yere koyun',
  'landing.expenses.closingBody':
    'Ücretsiz planla başlayın ve fişleri bir tabloda tutmayı bırakın.',
};
