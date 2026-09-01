/**
 * English source dictionary.
 *
 * This file is the single source of truth for the key set: every other locale
 * is type-checked against it, so a missing or misspelled key is a compile
 * error rather than a blank label in production.
 *
 * Keys are flat and dot-namespaced rather than nested objects. Flat keys give
 * exact autocomplete on `t()` without recursive mapped types, and they make the
 * parity test between locales a one-line comparison.
 *
 * What belongs here: text the application itself controls. What must never be
 * here: anything a user typed (company names, customer names, invoice
 * descriptions, notes) and anything the database stores as a value.
 */
export const en = {
  // --- Navigation -----------------------------------------------------------
  'nav.dashboard': 'Dashboard',
  'nav.invoices': 'Invoices',
  'nav.customers': 'Customers',
  'nav.payments': 'Payments',
  'nav.income': 'Income',
  'nav.expenses': 'Expenses',
  'nav.calendar': 'Calendar',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',
  'nav.signOut': 'Sign out',
  // Labels the hamburger button and the drawer it opens on small screens.
  'nav.openMenu': 'Open menu',
  'nav.menu': 'Menu',

  // --- Common actions -------------------------------------------------------
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.saving': 'Saving…',
  'common.deleting': 'Deleting…',
  'common.loading': 'Loading…',
  'common.tryAgain': 'Try again',
  'common.language': 'Language',

  // --- Authentication -------------------------------------------------------
  'auth.signIn': 'Sign in',
  'auth.signUp': 'Sign up',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.name': 'Name',
  'auth.signInTitle': 'Welcome back',
  'auth.signInSubtitle': 'Sign in to your account to continue',
  'auth.signUpTitle': 'Create your account',
  'auth.signUpSubtitle': 'Start managing your business finances',
  'auth.noAccount': "Don't have an account?",
  'auth.haveAccount': 'Already have an account?',
  'auth.signingIn': 'Signing in…',
  'auth.creatingAccount': 'Creating account…',
  'auth.invalidCredentials': 'Invalid email or password',
  'auth.tooManyAttempts': 'Too many sign-in attempts. Please wait a few minutes and try again.',
  'auth.sessionExpired': 'Your session has expired. Please sign in again.',
  'auth.noCompanyAccess': "You don't have access to this business.",

  // --- Password reset & email verification ----------------------------------
  'auth.forgotPassword': 'Forgot password?',
  'auth.forgotTitle': 'Reset your password',
  'auth.forgotSubtitle': "Enter your email and we'll send you a reset link.",
  'auth.forgotSubmit': 'Send reset link',
  'auth.forgotSent':
    'If an account exists for that email, a reset link is on its way. Check your inbox.',
  'auth.backToLogin': 'Back to sign in',
  'auth.resetTitle': 'Choose a new password',
  'auth.resetSubtitle': 'Enter a new password for your account.',
  'auth.newPassword': 'New password',
  'auth.confirmPassword': 'Confirm password',
  'auth.resetSubmit': 'Reset password',
  'auth.resetSuccess': 'Your password has been reset. You can sign in now.',
  'auth.resetInvalid': 'This reset link is invalid or has expired. Please request a new one.',
  'auth.resetMissingToken': 'This reset link is missing its token.',
  'auth.passwordTooShort': 'Password must be at least 8 characters.',
  'auth.passwordMismatch': 'The passwords do not match.',
  'auth.genericError': 'Something went wrong. Please try again.',
  'auth.continueWithGoogle': 'Continue with Google',
  'auth.orContinueWith': 'or continue with email',
  'auth.googleUnverified':
    'Google could not confirm your email is verified, so sign-in was declined. Verify your email with Google and try again.',
  'verify.title': 'Email verification',
  'verify.checking': 'Verifying your email…',
  'verify.success': 'Your email is verified. Thank you!',
  'verify.invalid': 'This verification link is invalid or has expired.',
  'verify.goToApp': 'Go to dashboard',

  // --- Onboarding -----------------------------------------------------------
  'onboarding.businessName': 'Business name',
  'onboarding.businessNameDesc': 'What is your business called?',
  'onboarding.country': 'Country',
  'onboarding.countryDesc': 'Where is your business based?',
  'onboarding.currency': 'Currency',
  'onboarding.currencyDesc': 'Your primary currency',
  'onboarding.businessType': 'Business type',
  'onboarding.businessTypeDesc': 'What kind of business?',
  'onboarding.details': 'Details',
  'onboarding.detailsDesc': 'Address and tax info (optional)',
  'onboarding.finish': 'Finish setup',
  'onboarding.failed': 'Could not finish setup. Please try again.',

  // --- Dashboard ------------------------------------------------------------
  'dashboard.welcome': 'Welcome back',
  'dashboard.subtitle': 'Your business at a glance this month',
  'dashboard.revenue': 'Revenue',
  'dashboard.expenses': 'Expenses',
  'dashboard.profit': 'Profit',
  'dashboard.receivables': 'Receivables',
  'dashboard.upcoming': 'Upcoming',
  'dashboard.upcomingActivity': 'Upcoming Activity',
  'dashboard.noRecords': 'No financial records yet',
  'dashboard.noRecordsDesc':
    'Your revenue, expenses and upcoming activity will appear here once you record your first invoice, income or expense.',
  'dashboard.loadFailed': 'Could not load your dashboard',
  'dashboard.createInvoice': 'Create Invoice',
  'dashboard.addIncome': 'Add Income',
  'dashboard.addExpense': 'Add Expense',

  /**
   * Display labels for the seeded category values.
   *
   * The database keeps the English value ("Products"); only the label shown on
   * screen is translated. This is the pairing that matters for data integrity:
   * a Turkish user picks "Ürünler" and the row still stores "Products", so
   * reports, filters and exports stay consistent across languages.
   */
  // --- Subscription & Billing ----------------------------------------------
  'nav.billing': 'Billing',
  'billing.title': 'Subscription & Billing',
  'billing.subtitle': 'Manage your subscription, payment method and billing.',
  'billing.currentPlan': 'Current plan',
  'billing.planFree': 'Free',
  'billing.planPro': 'Pro',
  'billing.planBusiness': 'Business',
  'billing.freeDescription': "You're currently using the Free plan.",
  'billing.upgradePro': 'Upgrade to Pro',
  'billing.upgradeBusiness': 'Upgrade to Business',

  'billing.subscription': 'Subscription',
  'billing.status': 'Status',
  'billing.billingCycle': 'Billing cycle',
  'billing.monthly': 'Monthly',
  'billing.yearly': 'Yearly',
  'billing.amount': 'Amount',
  'billing.periodStart': 'Current period started',
  'billing.renewalDate': 'Renewal date',
  'billing.endsOn': 'Access ends on',
  'billing.trialEnds': 'Trial ends',
  'billing.canceledOn': 'Cancelled on',
  'billing.manageSubscription': 'Manage subscription',

  'billing.statusActive': 'Active',
  'billing.statusTrialing': 'Trial',
  'billing.statusPastDue': 'Payment failed',
  'billing.statusCanceling': 'Cancelling',
  'billing.statusExpired': 'Expired',
  'billing.pastDueNote': 'Your last payment did not go through. Update your payment method to keep your access.',
  'billing.cancelingNote': 'Your subscription is cancelled and will stay active until the end of the paid period.',

  'billing.actionFailed': 'That action could not be completed. Please try again.',
  'billing.checkoutReturn': 'Thanks — your payment is being confirmed. It can take a few seconds for your plan to update here.',

  'billing.loadFailed': 'Could not load your subscription',
  'billing.loadFailedNote': 'Your plan details are temporarily unavailable. Nothing about your subscription has changed. Please try again shortly.',
  // --- Plans, limits and pricing --------------------------------------------
  'billing.planFreeTagline': 'For businesses getting started with CorpControl.',
  'billing.planProTagline': 'For small businesses',
  'billing.planBusinessTagline': 'For growing businesses',
  'billing.currentPlanBadge': 'Current plan',
  'billing.monthlyInterval': 'Monthly',
  'billing.yearlyInterval': 'Yearly',
  'billing.perMonth': '/ month',
  'billing.perYear': '/ year',
  'billing.whatsIncluded': "What's included",
  'billing.comparePlans': 'Compare plans',
  'billing.included': 'Included',
  'billing.notIncluded': 'Not included',
  'billing.unlimited': 'Unlimited',
  'billing.perMonthShort': '/mo',
  'billing.equivalentPerMonth': "That's {perMonth} / month",
  'billing.youSavePerYear': 'You save {saved} per year',
  'billing.savePercent': 'Save {percent}%',
  'billing.yearlyExplainer': 'Pay yearly and save {percent}% compared with the monthly plan.',
  'billing.twelveMonthsCost': '12 monthly payments cost {total}',

  'billing.planned': 'Planned',
  'billing.plannedNote':
    'Features marked Planned are part of the plan but are not built yet. They are not available today on any plan.',
  'billing.teamMembersNote':
    'Team members cannot be invited yet, so every company currently has a single member regardless of plan.',

  // --- Limit messages -------------------------------------------------------
  'limit.title': 'Plan limit reached',
  'limit.invoices': "You've reached {limit} invoices this month on the {plan} plan.",
  'limit.customers': "You've reached {limit} customers on the {plan} plan.",
  'limit.income': "You've reached {limit} income records this month on the {plan} plan.",
  'limit.expenses': "You've reached {limit} expense records this month on the {plan} plan.",
  'limit.invoicePdf': "You've reached {limit} invoice PDFs this month on the {plan} plan.",
  'limit.upgradeHint': 'Upgrade to continue.',
  'limit.generic': "You've reached your limit for your current plan. Upgrade to continue.",

  // --- Capability names -----------------------------------------------------
  'feature.dashboard': 'Dashboard',
  'feature.customers': 'Customers',
  'feature.invoices': 'Invoices',
  'feature.invoicePdf': 'Invoice PDF',
  'feature.income': 'Income tracking',
  'feature.expenses': 'Expense tracking',
  'feature.payments': 'Payment tracking',
  'feature.calendar': 'Calendar',
  'feature.reports': 'Basic reports',
  'feature.branding': 'Company branding',
  'feature.currencies': 'Multiple currencies',
  'feature.billing': 'Billing management',
  'feature.advancedReports': 'Advanced reports',
  'feature.dataExport': 'Data export',
  'feature.bulkExport': 'Bulk / monthly export',
  'feature.teamMembers': 'Team members',
  'feature.businessControls': 'Advanced business controls',
  'feature.prioritySupport': 'Priority support',

  // --- Trial ----------------------------------------------------------------
  'trial.proTrial': 'Pro Trial',
  'trial.freeTrial': '{days}-day free trial',
  'trial.daysRemaining': '{days} days remaining',
  'trial.lastDay': 'Last day of your trial',
  'trial.endsOn': 'Your trial ends on {date}',
  'trial.continueCta': 'Continue with Pro',
  'trial.ended': 'Your trial has ended',
  'trial.onFreeNow': "You're currently on the Free plan.",
  'trial.noAutoCharge': 'Nothing is charged automatically. Your trial simply ends unless you choose a paid plan.',

  'billing.priceOnCheckout': 'Price is shown at checkout before anything is charged.',
  // --- Bulk PDF -------------------------------------------------------------
  'bulk.downloadPdf': 'Download PDF',
  'bulk.bulkDownloadPdf': 'Bulk download PDF',
  'bulk.selectAtLeastOne': 'Please select at least one record.',
  'bulk.generating': 'Generating PDFs...',
  'bulk.downloaded': '{count} PDFs downloaded successfully.',
  'bulk.someFailed': '{count} could not be generated and were left out of the archive.',
  'bulk.noneGenerated': 'No PDFs could be generated, so there is nothing to download.',
  'bulk.limitReached': 'Your plan\'s monthly PDF allowance ran out during this batch.',
  'bulk.notConfigured': 'The PDF service is not configured, so bulk download is unavailable. You can still print each invoice.',
  'bulk.maxPerBatch': 'Only the first {max} selected records are included in one archive.',
  'bulk.selectAll': 'Select all',
  'bulk.selectedCount': '{count} selected',

  'billing.payment': 'Payment',
  'billing.paymentNote': 'Payment method is managed securely through Polar.',
  'billing.managePaymentMethod': 'Manage payment method',

  'billing.history': 'Billing history',
  'billing.historyNote': 'Invoices and receipts are available in the customer billing portal.',
  'billing.viewHistory': 'View billing history',

  /**
   * Shown while the checkout and portal endpoints do not exist yet. Saying so
   * plainly is better than a button that appears to work and does nothing.
   */
  'billing.notConfigured': 'Not available yet',
  'billing.notConfiguredNote':
    'Checkout and the billing portal are not connected yet, so these actions are unavailable. Nothing is charged and no subscription is active.',

  'category.services': 'Services',
  'category.products': 'Products',
  'category.consulting': 'Consulting',
  'category.otherIncome': 'Other Income',
  'category.officeSupplies': 'Office Supplies',
  'category.rent': 'Rent',
  'category.utilities': 'Utilities',
  'category.software': 'Software',
  'category.marketing': 'Marketing',
  'category.travel': 'Travel',
  'category.insurance': 'Insurance',
  'category.otherExpense': 'Other Expense',

  // --- Landing (marketing) --------------------------------------------------
  // This line is only true because of two constants: "3 customers" is
  // PLAN_LIMITS.free.customers (lib/billing/features.ts) and "15 days" is
  // TRIAL_DAYS (lib/billing/trial.ts). If either changes, change this copy (EN
  // and TR) to match — the claim must stay accurate.
  'landing.heroTagline': 'Start free with 3 customers — enjoy all Pro features for 15 days.',

  // Shared chrome: header, footer, skip link. Rendered on every public page,
  // including the legal ones whose body copy is deliberately not translated.
  'landing.skipToContent': 'Skip to content',
  'landing.logoHome': 'CorpControl home',
  'landing.nav.main': 'Main',
  'landing.nav.mobile': 'Mobile',
  'landing.nav.openMenu': 'Open menu',
  'landing.nav.features': 'Features',
  'landing.nav.howItWorks': 'How It Works',
  'landing.nav.pricing': 'Pricing',
  'landing.nav.faq': 'FAQ',
  'landing.cta.logIn': 'Log in',
  'landing.cta.startFree': 'Start free',
  'landing.cta.seeHowItWorks': 'See how it works',
  'landing.cta.seePlans': 'See plans',
  'landing.cta.readFaq': 'Read the FAQ',

  'landing.hero.eyebrow': 'Business finance, simplified',
  'landing.hero.title': 'Run your business finances without the complexity',
  'landing.hero.subtitle':
    'CorpControl keeps invoices, customers, income, expenses and payments in one simple workspace — so you always know where your money stands, without learning accounting software.',
  'landing.hero.trustNoBank': 'No bank connection required',
  'landing.hero.trustSetup': 'Set up in minutes',
  'landing.hero.trustCurrencies': 'Works in multiple currencies',

  // Dashboard mock in the hero. The figures themselves stay as they are —
  // they are fictional sample data, not text the product owns.
  'landing.preview.ariaLabel':
    'Preview of the CorpControl dashboard showing revenue, expenses, outstanding balance and a list of recent invoices. Sample data.',
  'landing.preview.dashboard': 'Dashboard',
  'landing.preview.sampleData': 'Sample data',
  'landing.preview.revenue': 'Revenue',
  'landing.preview.expenses': 'Expenses',
  'landing.preview.outstanding': 'Outstanding',
  'landing.preview.thisMonth': 'This month',
  'landing.preview.threeInvoices': '3 invoices',
  'landing.preview.recentInvoices': 'Recent invoices',
  'landing.preview.statusPaid': 'Paid',
  'landing.preview.statusSent': 'Sent',
  'landing.preview.statusOverdue': 'Overdue',

  'landing.trust.setupTitle': 'Simple setup',
  'landing.trust.setupBody': 'Create an account, add your business details, start invoicing.',
  'landing.trust.currenciesTitle': 'Multiple currencies',
  'landing.trust.currenciesBody': 'Invoice and record payments in USD, EUR, GBP or TRY.',
  'landing.trust.noBankTitle': 'No bank connection',
  'landing.trust.noBankBody': 'Nothing to link. You stay in control of what goes in.',
  'landing.trust.overviewTitle': 'One overview',
  'landing.trust.overviewBody': 'Invoices, expenses and payments in a single dashboard.',

  'landing.problem.eyebrow': 'The problem',
  'landing.problem.title': 'Most small businesses do not need accounting software',
  'landing.problem.description':
    'They need to know who owes them money, what they spent, and whether the month worked out. That is a much smaller problem, and it deserves a much smaller tool.',
  'landing.problem.p1': 'Numbers live in three different spreadsheets',
  'landing.problem.s1': 'One workspace holds invoices, income, expenses and payments together.',
  'landing.problem.p2': 'An unpaid invoice goes unnoticed for weeks',
  'landing.problem.s2': 'Outstanding balances and due dates sit on the dashboard and calendar.',
  'landing.problem.p3': 'Expenses get reconstructed from memory at year end',
  'landing.problem.s3': 'Record an expense when it happens, with a category and a due date.',
  'landing.problem.p4': 'Accounting software assumes you are an accountant',
  'landing.problem.s4': 'Plain screens, plain language, nothing you need a course to operate.',

  'landing.tour.eyebrow': 'A look inside',
  'landing.tour.title': 'Screens you will actually use',
  'landing.tour.description':
    'No dashboards full of charts you will never open. Just the three places most of the work happens.',
  'landing.tour.tabDashboard': 'Dashboard',
  'landing.tour.tabInvoices': 'Invoices',
  'landing.tour.tabPayments': 'Payments',
  'landing.tour.frameOverview': 'Financial overview',
  'landing.tour.revenueThisMonth': 'Revenue this month',
  'landing.tour.expensesThisMonth': 'Expenses this month',
  'landing.tour.outstanding': 'Outstanding',
  'landing.tour.captionInvoices': 'Sample list of invoices with client, due date, amount and status',
  'landing.tour.captionPayments': 'Sample list of payments recorded against invoices',
  'landing.tour.colInvoice': 'Invoice',
  'landing.tour.colClient': 'Client',
  'landing.tour.colDue': 'Due',
  'landing.tour.colAmount': 'Amount',
  'landing.tour.colStatus': 'Status',
  'landing.tour.colMethod': 'Method',
  'landing.tour.colAppliedTo': 'Applied to',
  'landing.tour.colDate': 'Date',
  'landing.tour.methodBankTransfer': 'Bank transfer',
  'landing.tour.methodCard': 'Card',

  'landing.features.eyebrow': 'What you get',
  'landing.features.title': 'Everything you need, nothing you do not',
  'landing.features.description':
    'Six areas that cover how money actually moves through a small business.',
  'landing.features.invoicesTitle': 'Invoices',
  'landing.features.invoicesBody':
    'Build invoices with line items, tax and discounts, then track them from draft through to paid.',
  'landing.features.customersTitle': 'Customers',
  'landing.features.customersBody':
    'Keep customer details in one place and see every invoice and payment tied to each of them.',
  'landing.features.moneyTitle': 'Income & expenses',
  'landing.features.moneyBody':
    'Record what comes in and what goes out, with categories, dates and due dates that stay tidy.',
  'landing.features.paymentsTitle': 'Payments',
  'landing.features.paymentsBody':
    'Log full or partial payments against an invoice and watch its status update on its own.',
  'landing.features.calendarTitle': 'Calendar',
  'landing.features.calendarBody':
    'See invoice due dates, expense due dates and payment dates laid out across the month.',
  'landing.features.reportsTitle': 'Reports',
  'landing.features.reportsBody':
    'Review income against expenses over time, broken down by category and kept per currency.',

  'landing.how.eyebrow': 'Getting started',
  'landing.how.title': 'Three steps, then you are working',
  'landing.how.description':
    'Setup is short. Once your business details are in, you can create your first invoice straight away.',
  'landing.how.step1Title': 'Create your account',
  'landing.how.step1Body':
    'Sign up with an email address and a password. Nothing to install, nothing to configure.',
  'landing.how.step2Title': 'Set up your business',
  'landing.how.step2Body':
    'Add your business name, country and default currency. Categories are created for you.',
  'landing.how.step3Title': 'Track your finances',
  'landing.how.step3Body':
    'Add customers, send invoices, record expenses and payments. Your dashboard fills itself in.',

  'landing.benefits.eyebrow': 'Why it helps',
  'landing.benefits.title': 'Less admin, clearer numbers',
  'landing.benefits.b1Title': 'Know what is happening with your money',
  'landing.benefits.b1Body':
    'Revenue, expenses and what is still owed to you, on one screen, kept separate per currency.',
  'landing.benefits.b2Title': 'Stay on top of outstanding payments',
  'landing.benefits.b2Body':
    'Every invoice carries its status and due date, so nothing quietly slips past its deadline.',
  'landing.benefits.b3Title': 'Keep business finances organised',
  'landing.benefits.b3Body':
    'Customers, invoices, expenses and payments stay connected instead of scattered across files.',
  'landing.benefits.b4Title': 'Spend less time managing spreadsheets',
  'landing.benefits.b4Body':
    'Record something once. Totals, statuses and reports follow from it without extra work.',

  'landing.pricingTeaser.eyebrow': 'Pricing',
  'landing.pricingTeaser.title': 'Start simple. Grow when you need to.',
  'landing.pricingTeaser.description':
    'CorpControl is built for freelancers, consultants, agencies and small businesses — people who need their finances in order, not an enterprise finance department.',

  'landing.security.eyebrow': 'Trust',
  'landing.security.title': 'Your business data stays yours',
  'landing.security.description':
    'We describe only what the product actually does. No certifications are claimed that have not been earned.',
  'landing.security.authTitle': 'Secure authentication',
  'landing.security.authBody': 'Passwords are hashed, never stored as text, and sessions are signed.',
  'landing.security.separationTitle': 'Company-level separation',
  'landing.security.separationBody':
    'Every record is scoped to your business. Requests can only reach your own data.',
  'landing.security.encryptionTitle': 'Encrypted in transit',
  'landing.security.encryptionBody':
    'The application is served over HTTPS and connects to its database over TLS.',
  'landing.security.accessTitle': 'Access from anywhere',
  'landing.security.accessBody':
    'Runs in the browser on any modern device. Nothing to install or keep updated.',

  'landing.faq.eyebrow': 'Questions',
  'landing.faq.title': 'Frequently asked questions',
  'landing.faq.q1': 'What is CorpControl?',
  'landing.faq.a1':
    'A workspace for managing the money side of a small business: invoices, customers, income, expenses, payments, a financial dashboard and reports. It is deliberately simpler than traditional accounting software.',
  'landing.faq.q2': 'Who is it for?',
  'landing.faq.a2':
    'Freelancers, consultants, agencies, independent professionals and small businesses who need to keep finances organised without hiring a bookkeeper or learning double-entry accounting.',
  'landing.faq.q3': 'Can I create and manage invoices?',
  'landing.faq.a3':
    'Yes. You can build invoices with multiple line items, quantities, per-line tax and discounts, then move them through draft, sent, partially paid, paid, overdue or cancelled.',
  'landing.faq.q4': 'Can I track expenses?',
  'landing.faq.a4':
    'Yes. Record expenses with a description, category, amount, currency and an optional due date, and link them to a vendor. Unpaid expenses show up as upcoming payments.',
  'landing.faq.q5': 'Can I record payments against invoices?',
  'landing.faq.a5':
    'Yes. You can record full or partial payments. The invoice balance and status update automatically from the payments recorded against it.',
  'landing.faq.q6': 'Does CorpControl support multiple currencies?',
  'landing.faq.a6':
    'Yes. Invoices, income, expenses and payments can each be recorded in USD, EUR, GBP or TRY. Totals are always reported per currency and never mixed together.',
  'landing.faq.q7': 'Do I need to connect my bank account?',
  'landing.faq.a7':
    'No. CorpControl does not connect to banks. You record income, expenses and payments yourself, which means there is no banking credential to share.',
  'landing.faq.q8': 'Can I use it from anywhere?',
  'landing.faq.a8':
    'Yes. It runs in the browser on desktop, laptop, tablet and mobile. There is nothing to install and nothing to keep updated.',

  'landing.finalCta.title': 'Take control of your business finances',
  'landing.finalCta.description':
    'Keep invoices, expenses, payments and financial insights in one simple workspace.',

  'landing.footer.tagline':
    'Business finance management for people who would rather be doing their actual work.',
  'landing.footer.product': 'Product',
  'landing.footer.company': 'Company',
  'landing.footer.legal': 'Legal',
  'landing.footer.contact': 'Contact',
  'landing.footer.privacy': 'Privacy Policy',
  'landing.footer.terms': 'Terms of Service',
  'landing.footer.cookies': 'Cookie Policy',
  'landing.footer.kvkk': 'KVKK Notice',
  'landing.footer.rights': 'All rights reserved.',

  // --- /pricing -------------------------------------------------------------
  'pricingPage.eyebrow': 'Pricing',
  'pricingPage.title': 'Start simple. Grow when you need to.',
  'pricingPage.subtitle':
    'CorpControl is built for freelancers, consultants, agencies and small businesses. Create an account and start using it today.',
  'pricingPage.cardEyebrow': 'Get started',
  'pricingPage.cardTitle': 'Everything in one workspace',
  'pricingPage.cardBody':
    'Detailed plans are still being finalised. In the meantime you can create an account and use CorpControl to run your business finances.',
  'pricingPage.f1': 'Invoices with line items, tax and discounts',
  'pricingPage.f2': 'Customer and vendor records',
  'pricingPage.f3': 'Income and expense tracking',
  'pricingPage.f4': 'Full and partial payment recording',
  'pricingPage.f5': 'Financial dashboard and reports',
  'pricingPage.f6': 'Calendar of due dates',
  'pricingPage.f7': 'Multi-currency support (USD, EUR, GBP, TRY)',
  'pricingPage.noBankNote': 'No bank connection required.',
  'pricingPage.questionLead': 'Have a question about plans? ',
  'pricingPage.questionLink': 'Get in touch',
  'pricingPage.questionTail': '.',
  'pricingPage.ctaTitle': 'Ready to get your finances in order?',
  'pricingPage.ctaBody':
    'Create an account and start recording invoices, expenses and payments today.',

  // --- /contact -------------------------------------------------------------
  'contactPage.title': 'Contact',
  'contactPage.intro':
    'CorpControl is early, and we would rather hear from you than not. Here is what each kind of enquiry covers.',
  'contactPage.generalTitle': 'General enquiries',
  'contactPage.generalBody':
    'Questions about what CorpControl does, whether it fits how you work, or pricing.',
  'contactPage.supportTitle': 'Support',
  'contactPage.supportBody':
    'Something not behaving as expected. Tell us what you were doing when it happened and what you saw instead.',
  'contactPage.privacyTitle': 'Privacy and data requests',
  'contactPage.privacyBody':
    'Access, correction, export or deletion requests under the data protection law that applies to you.',
  'contactPage.reachTitle': 'How to reach us',
  'contactPage.reachBody':
    'Our published contact channels are being finalised and will appear on this page. Until they do, this page describes the kinds of enquiry we handle rather than listing an address we cannot yet stand behind.',
  'contactPage.businessTitle': 'Business details',
  'contactPage.businessBody':
    'CorpControl is operated by the entity responsible for providing the service. Registered business information will be published here once it is confirmed, alongside the contact channels above.',
  // Split around two inline links. Turkish puts the verb after the link, so the
  // fragments are ordered lead → link → mid → link → tail rather than
  // interpolated, which keeps both languages grammatical.
  'contactPage.moreLead': 'Looking for something specific? Read the ',
  'contactPage.moreFaqLink': 'frequently asked questions',
  'contactPage.moreMid': ', or see how we handle information in the ',
  'contactPage.morePrivacyLink': 'Privacy Policy',
  'contactPage.moreTail': '.',

  // --- Legal page shell -----------------------------------------------------
  // Chrome only. The legal body copy is intentionally not translated; see the
  // note in components/marketing/legal-page.tsx.
  'legal.lastUpdated': 'Last updated:',
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
