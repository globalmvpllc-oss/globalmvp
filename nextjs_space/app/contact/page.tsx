import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, LifeBuoy, ShieldQuestion } from 'lucide-react';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach the FinanceFlow team and what each type of enquiry covers.',
  alternates: { canonical: '/contact' },
};

/**
 * Contact channels are described by topic only. No email address, postal
 * address or registration number appears here, because none is recorded
 * anywhere in this repository and inventing one would be worse than
 * publishing nothing.
 */
const CHANNELS = [
  {
    icon: Mail,
    title: 'General enquiries',
    body: 'Questions about what FinanceFlow does, whether it fits how you work, or pricing.',
  },
  {
    icon: LifeBuoy,
    title: 'Support',
    body: 'Something not behaving as expected. Tell us what you were doing when it happened and what you saw instead.',
  },
  {
    icon: ShieldQuestion,
    title: 'Privacy and data requests',
    body: 'Access, correction, export or deletion requests under the data protection law that applies to you.',
  },
];

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Contact
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              FinanceFlow is early, and we would rather hear from you than not. Here is what each
              kind of enquiry covers.
            </p>

            <ul className="mt-12 space-y-4">
              {CHANNELS.map((channel) => (
                <li key={channel.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
                  <channel.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold text-foreground">{channel.title}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{channel.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-12 rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-semibold text-foreground">How to reach us</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Our published contact channels are being finalised and will appear on this page. Until
                they do, this page describes the kinds of enquiry we handle rather than listing an
                address we cannot yet stand behind.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-semibold text-foreground">Business details</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                FinanceFlow is operated by the entity responsible for providing the service.
                Registered business information will be published here once it is confirmed, alongside
                the contact channels above.
              </p>
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              Looking for something specific? Read the{' '}
              <Link href="/#faq" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                frequently asked questions
              </Link>
              , or see how we handle information in the{' '}
              <Link href="/privacy" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
