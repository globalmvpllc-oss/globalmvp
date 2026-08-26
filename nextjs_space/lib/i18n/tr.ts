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
  'nav.income': 'Gelirler',
  'nav.expenses': 'Giderler',
  'nav.calendar': 'Takvim',
  'nav.reports': 'Raporlar',
  'nav.settings': 'Ayarlar',
  'nav.signOut': 'Çıkış yap',

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
};
