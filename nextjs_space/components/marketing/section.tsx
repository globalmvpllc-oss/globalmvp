import { cn } from '@/lib/utils';

/**
 * Shared layout primitives for the marketing site.
 * Server components — no interactivity, no client bundle cost.
 */

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function Section({
  id,
  className,
  children,
  'aria-labelledby': ariaLabelledBy,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  'aria-labelledby'?: string;
}) {
  return (
    <section id={id} aria-labelledby={ariaLabelledBy} className={cn('py-20 sm:py-28', className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * Small uppercase mono label above a section heading.
 * Set in the same face used for figures throughout the product, so the
 * marketing pages share the ledger vocabulary of the app itself.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{children}</p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className={cn(
          'font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl',
          eyebrow && 'mt-3'
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
