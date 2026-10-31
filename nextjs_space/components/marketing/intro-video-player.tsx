'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

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
 * downloaded until it is first played (preload="none"), so the page's first
 * load pays only for the poster image.
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
        poster={poster}
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

      <div className="absolute right-3 top-3 flex gap-2">
        {playing ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={labels.pause}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Pause aria-hidden="true" className="h-6 w-6" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? labels.unmute : labels.mute}
          aria-pressed={!muted}
          className="flex h-12 items-center gap-2 rounded-full bg-black/60 px-4 text-base font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {muted ? (
            <VolumeX aria-hidden="true" className="h-6 w-6" />
          ) : (
            <Volume2 aria-hidden="true" className="h-6 w-6" />
          )}
          <span>{muted ? labels.unmute : labels.mute}</span>
        </button>
      </div>
    </div>
  );
}
