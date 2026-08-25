'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FAQS } from '@/components/marketing/faq-data';

export function Faq() {
  return (
    <Section id="faq" className="border-b border-border" aria-labelledby="faq-heading">
      <SectionHeading id="faq-heading" eyebrow="Questions" title="Frequently asked questions" />

      <div className="mx-auto mt-12 max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq, index) => (
            <AccordionItem key={faq.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
