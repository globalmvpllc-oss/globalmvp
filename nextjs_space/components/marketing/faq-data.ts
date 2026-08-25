/**
 * Single source of truth for the FAQ.
 *
 * Rendered by faq.tsx and serialised into FAQPage structured data on the
 * homepage, so the markup and the schema always match exactly.
 *
 * Answers describe the product as it exists today. Nothing here promises
 * functionality that has not been built.
 */
export const FAQS = [
  {
    q: 'What is FinanceFlow?',
    a: 'A workspace for managing the money side of a small business: invoices, customers, income, expenses, payments, a financial dashboard and reports. It is deliberately simpler than traditional accounting software.',
  },
  {
    q: 'Who is it for?',
    a: 'Freelancers, consultants, agencies, independent professionals and small businesses who need to keep finances organised without hiring a bookkeeper or learning double-entry accounting.',
  },
  {
    q: 'Can I create and manage invoices?',
    a: 'Yes. You can build invoices with multiple line items, quantities, per-line tax and discounts, then move them through draft, sent, partially paid, paid, overdue or cancelled.',
  },
  {
    q: 'Can I track expenses?',
    a: 'Yes. Record expenses with a description, category, amount, currency and an optional due date, and link them to a vendor. Unpaid expenses show up as upcoming payments.',
  },
  {
    q: 'Can I record payments against invoices?',
    a: 'Yes. You can record full or partial payments. The invoice balance and status update automatically from the payments recorded against it.',
  },
  {
    q: 'Does FinanceFlow support multiple currencies?',
    a: 'Yes. Invoices, income, expenses and payments can each be recorded in USD, EUR, GBP or TRY. Totals are always reported per currency and never mixed together.',
  },
  {
    q: 'Do I need to connect my bank account?',
    a: 'No. FinanceFlow does not connect to banks. You record income, expenses and payments yourself, which means there is no banking credential to share.',
  },
  {
    q: 'Can I use it from anywhere?',
    a: 'Yes. It runs in the browser on desktop, laptop, tablet and mobile. There is nothing to install and nothing to keep updated.',
  },
];
