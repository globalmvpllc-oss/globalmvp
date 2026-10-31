import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/marketing/section';
import { IntroVideoPlayer } from '@/components/marketing/intro-video-player';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

// Same three points the hero lists, so the wording stays in one place.
const POINTS: TranslationKey[] = [
  'landing.hero.trustNoBank',
  'landing.hero.trustSetup',
  'landing.hero.trustCurrencies',
];

/**
 * Short vertical product clip, right under the hero.
 *
 * Desktop (lg+): two columns — the clip on the left, the text vertically
 * centred on the right. Below lg: heading, clip, sentence, full-width button.
 * One heading in the DOM for both: the text wrapper is `display: contents` on
 * small screens so its children can be ordered around the clip.
 *
 * Text is rendered here on the server; only the player is a client component.
 */
export function IntroVideo() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section id="intro-video" className="border-b border-border" aria-labelledby="intro-video-heading">
      <div className="flex flex-col items-center gap-8 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center lg:gap-16 xl:gap-20">
        <div className="order-2 w-full max-w-[420px] lg:order-none lg:max-w-[360px]">
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

        <div className="contents lg:flex lg:max-w-xl lg:flex-col lg:items-start">
          <h2
            id="intro-video-heading"
            className="order-1 text-center font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:order-none lg:text-left"
          >
            {t('landing.video.title')}
          </h2>

          <p className="order-3 max-w-xl text-center text-lg leading-relaxed text-muted-foreground lg:order-none lg:mt-4 lg:text-left">
            {t('landing.video.description')}
          </p>

          <ul className="hidden lg:mt-6 lg:flex lg:flex-col lg:gap-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2 text-base text-muted-foreground">
                <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                {t(point)}
              </li>
            ))}
          </ul>

          <div className="order-4 w-full max-w-[420px] lg:order-none lg:mt-8 lg:w-auto lg:max-w-none">
            <Button asChild size="lg" className="w-full lg:w-auto">
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
