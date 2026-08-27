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
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
