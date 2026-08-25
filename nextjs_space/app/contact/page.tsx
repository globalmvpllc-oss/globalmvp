import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, LifeBuoy, ShieldQuestion } from 'lucide-react';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the FinanceFlow team.',
  alternates: { canonical: '/contact' },
};

const CHANNELS = [
  {
    icon: Mail,
    title: 'General enquiries',
    body: 'Questions about the product, pricing or your account.',
    value: '[CONTACT EMAIL]',
  },
  {
    icon: LifeBuoy,
    title: 'Support',
    body: 'Something not working as expected? Tell us what you were doing when it happened.',
    value: '[SUPPORT EMAIL]',
  },
  {
    icon: ShieldQuestion,
    title: 'Privacy and data requests',
    body: 'Access, correction, export or deletion requests under applicable data protection law.',
    value: '[PRIVACY EMAIL]',
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
              Pick whichever route fits your question and we will get back to you.
            </p>

            <ul className="mt-12 space-y-4">
              {CHANNELS.map((channel) => (
                <li key={channel.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
                  <channel.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold text-foreground">{channel.title}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{channel.body}</p>
                    <p className="mt-3 font-mono text-sm text-foreground">{channel.value}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-12 rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-semibold text-foreground">Registered business details</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                [LEGAL ENTITY NAME]<br />
                [REGISTERED ADDRESS]<br />
                Registration number: [REGISTRATION NUMBER]
              </p>
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              Looking for something specific? Read the{' '}
              <Link href="/#faq" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                frequently asked questions
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
