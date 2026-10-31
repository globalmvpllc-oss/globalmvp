import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/section';
import { IntroVideoPlayer } from '@/components/marketing/intro-video-player';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Short vertical product clip, right under the hero.
 * Text is rendered here on the server; only the player itself is a client
 * component.
 */
export function IntroVideo() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section id="intro-video" className="border-b border-border" aria-labelledby="intro-video-heading">
      <SectionHeading id="intro-video-heading" title={t('landing.video.title')} />

      <div className="mt-10 flex flex-col items-center gap-8 md:mt-12 md:flex-row md:justify-center md:gap-12">
        <div className="w-full md:w-[360px] md:shrink-0">
          <IntroVideoPlayer
            src="/videos/corpcontrol-intro.mp4"
            poster="/videos/corpcontrol-intro-poster.jpg"
            labels={{
              video: t('landing.video.ariaLabel'),
              play: t('landing.video.play'),
              pause: t('landing.video.pause'),
              unmute: t('landing.video.unmute'),
              mute: t('landing.video.mute'),
            }}
          />
        </div>

        <div className="max-w-md text-center md:text-left">
          <p className="text-lg leading-relaxed text-muted-foreground">{t('landing.video.description')}</p>
          <div className="mt-6 flex justify-center md:justify-start">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/auth/signup">
                {t('landing.cta.startFree')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
