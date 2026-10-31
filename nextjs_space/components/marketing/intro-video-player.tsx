'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

// Round, translucent dark buttons drawn over the clip. Every visual property is
// set explicitly so no browser default (grey fill, border) shows through.
const CONTROL =
  'absolute z-10 flex h-12 w-12 appearance-none items-center justify-center rounded-full border-0 bg-black/60 p-0 text-white shadow-md backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40';

export interface IntroVideoLabels {
  video: string;
  play: string;
  pause: string;
  unmute: string;
  mute: string;
}

/**
 * The vertical intro clip on the landing page.
 *
 * Plays muted while it is on screen and stops when it scrolls away. Nothing is
 * downloaded until it is first played (preload="none"), and the poster only
 * once the player is close to the screen, so the first load pays for neither.
 *
 * Visitors who ask for reduced motion get no autoplay: the clip waits behind a
 * play button until they choose to start it. A visitor who pauses it is
 * respected the same way — scrolling back does not restart it.
 */
export function IntroVideoPlayer({
  src,
  poster,
  labels,
}: {
  src: string;
  poster: string;
  labels: IntroVideoLabels;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  // Set once the visitor pauses by hand; autoplay stays off after that.
  const userPausedRef = useRef(false);
  // The poster is attached only when the player nears the screen. A poster
  // given up front is fetched at page load and competes with the fonts and
  // hero text, which measurably slowed the mobile Lighthouse score.
  const [posterSrc, setPosterSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof IntersectionObserver === 'undefined') {
      setPosterSrc(poster);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPosterSrc(poster);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [poster]);

  // Read the motion preference on the client only. Starting from `true` means
  // nothing autoplays before we know the answer.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    if (!wrapper || !video || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!reducedMotion && !userPausedRef.current) {
            video.play().catch(() => {
              // Autoplay refused (e.g. data saver). The play button stays visible.
            });
          }
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    // Turning the sound on is a clear sign the visitor wants to watch.
    if (!next && video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-lg md:max-w-[360px]"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={src}
        poster={posterSrc}
        width={720}
        height={1280}
        muted
        loop
        playsInline
        preload="none"
        aria-label={labels.video}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {!playing ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={labels.play}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Play aria-hidden="true" className="ml-1 h-9 w-9" />
          </span>
        </button>
      ) : null}

      {playing ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={labels.pause}
          className={`${CONTROL} bottom-3 left-3`}
        >
          <Pause aria-hidden="true" className="h-6 w-6" />
        </button>
      ) : null}

      {/* Sound toggle, built into the bottom-right corner of the clip. */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? labels.unmute : labels.mute}
        title={muted ? labels.unmute : labels.mute}
        className={`${CONTROL} bottom-3 right-3`}
      >
        {muted ? (
          <VolumeX aria-hidden="true" className="h-6 w-6" />
        ) : (
          <Volume2 aria-hidden="true" className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
