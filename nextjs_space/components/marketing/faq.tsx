'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FAQ_KEYS } from '@/components/marketing/faq-data';
import { useI18n } from '@/components/i18n-provider';

export function Faq() {
  const { t } = useI18n();

  return (
    <Section id="faq" className="border-b border-border" aria-labelledby="faq-heading">
      <SectionHeading
        id="faq-heading"
        eyebrow={t('landing.faq.eyebrow')}
        title={t('landing.faq.title')}
      />

      <div className="mx-auto mt-12 max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((faq, index) => (
            <AccordionItem key={faq.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium">{t(faq.q)}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                {t(faq.a)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
