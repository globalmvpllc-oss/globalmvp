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
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
