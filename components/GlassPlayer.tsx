"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playlist } from "@/lib/playlist";
import { isConfigured, isLoggedIn, login } from "@/lib/spotifyAuth";
import { useSpotifyPlayer } from "@/lib/useSpotifyPlayer";
import data from "@/lib/tracks.json";
import styles from "./GlassPlayer.module.css";

type Track = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  url: string;
  preview: string;
  /** 640px album art from Spotify's CDN. "" when the lookup failed. */
  cover: string;
  released: string;
  year: string;
  isExplicit: boolean;
};

const tracks = data.tracks as Track[];

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Crossfade length. Both decks ramp over the same window so the outgoing
 * and incoming tracks genuinely overlap — no silent gap in between.
 */
const CROSSFADE = 900;

/**
 * Ramp an element's volume to `target`, resolving when it lands there.
 * Returns a cancel function so a new fade can pre-empt one in flight.
 */
function fade(
  audio: HTMLAudioElement,
  target: number,
  ms: number,
): { done: Promise<void>; cancel: () => void } {
  const from = audio.volume;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;

  const done = new Promise<void>((resolve) => {
    const step = (now: number) => {
      if (cancelled) return resolve();
      const t = Math.min((now - start) / ms, 1);
      // Equal-power curve, so the dissolve sounds even rather than dipping.
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t < 1) raf = requestAnimationFrame(step);
      else resolve();
    };
    raf = requestAnimationFrame(step);
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}

export default function GlassPlayer() {
  // Two decks. One plays while the other pre-buffers the next track, then
  // they trade places mid-fade — the overlap is what makes it a crossfade
  // rather than a dip through silence.
  const deckA = useRef<HTMLAudioElement>(null);
  const deckB = useRef<HTMLAudioElement>(null);
  const fades = useRef<{ cancel: () => void }[]>([]);
  const handingOff = useRef(false);

  const [live, setLive] = useState<0 | 1>(0);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const track = tracks[index];

  const decks = useCallback(
    () => [deckA.current, deckB.current] as (HTMLAudioElement | null)[],
    [],
  );
  const liveDeck = useCallback(() => decks()[live], [decks, live]);
  const idleDeck = useCallback(() => decks()[live === 0 ? 1 : 0], [decks, live]);

  // Seed the first deck, and keep the idle deck loaded with whatever comes
  // next so a hand-off can start instantly.
  useEffect(() => {
    const cur = liveDeck();
    if (cur && !cur.src) {
      cur.src = tracks[index].preview;
      cur.load();
    }
    const idle = idleDeck();
    const upcoming = tracks[(index + 1) % tracks.length].preview;
    if (idle && idle.src !== upcoming && !handingOff.current) {
      idle.src = upcoming;
      idle.load();
    }
  }, [index, live, liveDeck, idleDeck]);

  /**
   * Bring `to` up while the live deck goes down, then promote it.
   * `restart` replays from the top when the same track is re-selected.
   */
  const crossfadeTo = useCallback(
    (to: number, { silent = false } = {}) => {
      const from = liveDeck();
      const next = idleDeck();
      if (!next) return;
      if (handingOff.current) return;

      const wasPlaying = from ? !from.paused : false;
      const src = tracks[to].preview;
      if (next.src !== src) {
        next.src = src;
        next.load();
      }
      next.currentTime = 0;

      // Paused, or first play: just swap with no fade to fight.
      if (!wasPlaying || silent) {
        fades.current.forEach((f) => f.cancel());
        from?.pause();
        next.volume = 1;
        setLive((s) => (s === 0 ? 1 : 0));
        setIndex(to);
        setCurrentTime(0);
        return;
      }

      handingOff.current = true;
      next.volume = 0;
      void next
        .play()
        .then(() => {
          fades.current.forEach((f) => f.cancel());
          const rampIn = fade(next, 1, CROSSFADE);
          const rampOut = from ? fade(from, 0, CROSSFADE) : null;
          fades.current = rampOut ? [rampIn, rampOut] : [rampIn];

          // Promote immediately so the UI tracks the incoming song while
          // the tail of the old one is still audible.
          setLive((s) => (s === 0 ? 1 : 0));
          setIndex(to);

          return rampIn.done.then(() => {
            from?.pause();
            if (from) from.volume = 1;
            handingOff.current = false;
          });
        })
        .catch(() => {
          // Autoplay refused the new deck — fall back to a hard swap.
          next.volume = 1;
          setLive((s) => (s === 0 ? 1 : 0));
          setIndex(to);
          handingOff.current = false;
        });
    },
    [liveDeck, idleDeck],
  );

  // Wire events on whichever deck is live.
  useEffect(() => {
    const audio = liveDeck();
    if (!audio) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // Begin the hand-off early enough that the two tracks overlap for
      // the whole fade instead of the new one starting after the end.
      const left = audio.duration - audio.currentTime;
      if (
        !audio.paused &&
        Number.isFinite(left) &&
        left <= CROSSFADE / 1000 &&
        !handingOff.current
      ) {
        crossfadeTo((index + 1) % tracks.length);
      }
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      // A deck pausing at the end of its fade is not the user stopping.
      if (!handingOff.current) setIsPlaying(false);
    };
    const onEnded = () => {
      if (!handingOff.current) crossfadeTo((index + 1) % tracks.length);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    // Sync duration for a deck that was already buffered.
    if (audio.readyState >= 1) setDuration(audio.duration || 0);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [live, index, liveDeck, crossfadeTo]);

  const toggle = useCallback(() => {
    const audio = liveDeck();
    if (!audio) return;
    if (audio.paused) {
      audio.volume = 1;
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [liveDeck]);

  const next = useCallback(
    () => crossfadeTo((index + 1) % tracks.length),
    [crossfadeTo, index],
  );

  const prev = useCallback(() => {
    const audio = liveDeck();
    // Match Apple Music: restart the track if we're past the intro.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    crossfadeTo((index - 1 + tracks.length) % tracks.length);
  }, [crossfadeTo, index, liveDeck]);

  // ── Full-song playback via the Web Playback SDK ──────────────────────
  // Inert (and preview mode stays in charge) until a client ID is set and
  // the visitor logs in with a Premium account.
  const sdk = useSpotifyPlayer(playlist.spotifyId);
  const useSdk = sdk.active && !sdk.error;

  // One set of values for the UI, whichever engine is driving.
  const view = useSdk
    ? {
        title: sdk.title || track.title,
        artist: sdk.artist || track.artist,
        cover: sdk.cover || track.cover || playlist.coverUrl,
        year: "",
        isExplicit: false,
        isPlaying: sdk.isPlaying,
        position: sdk.position,
        duration: sdk.duration,
        toggle: sdk.toggle,
        next: sdk.next,
        prev: sdk.prev,
        seek: sdk.seek,
      }
    : {
        title: track.title,
        artist: track.artist,
        cover: track.cover || playlist.coverUrl,
        year: track.year,
        isExplicit: track.isExplicit,
        isPlaying,
        position: currentTime,
        duration,
        toggle,
        next,
        prev,
        seek: (seconds: number) => {
          const audio = liveDeck();
          if (!audio) return;
          audio.currentTime = seconds;
          setCurrentTime(seconds);
        },
      };

  // ── Scrubbing ────────────────────────────────────────────────────────
  // While the user drags, the thumb follows the pointer and playback is
  // left alone; the seek is committed once on release. Without this the
  // 250ms position ticks fight the drag and the thumb jumps back.
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef(0);

  const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    scrubRef.current = value;
    setScrub(value);
  }, []);

  const commitScrub = useCallback(() => {
    if (scrub === null) return;
    view.seek(scrubRef.current);
    setScrub(null);
  }, [scrub, view]);

  const shownTime = scrub ?? view.position;

  // Keep the latest controls reachable from the one-time key listener.
  const viewRef = useRef(view);
  viewRef.current = view;

  // Keyboard: space = play/pause, arrows = prev/next, ±5s with shift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "A" || tag === "BUTTON") return;
      const v = viewRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        v.toggle();
      } else if (e.code === "ArrowRight") {
        if (e.shiftKey) v.seek(Math.min(v.position + 5, v.duration));
        else v.next();
      } else if (e.code === "ArrowLeft") {
        if (e.shiftKey) v.seek(Math.max(v.position - 5, 0));
        else v.prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress =
    view.duration > 0 ? (shownTime / view.duration) * 100 : 0;

  return (
    <div className={styles.stage}>
      {/* Background image layer. If public/background.jpg is missing, this is
          simply transparent and the stage's gradient shows through. */}
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />

      <header className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>{playlist.siteName}</span>
          <span className={styles.sub}>
            {playlist.title} · {playlist.owner}
          </span>
        </div>
        <a
          className={styles.spotify}
          href={playlist.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Spotify
        </a>
      </header>

      {/* Bottom-center now-playing pill. */}
      <div className={styles.dock}>
        <section
          className={styles.pill}
          aria-label={`Now playing: ${view.title} by ${view.artist}`}
        >
          <div className={styles.row}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={view.cover}
              className={styles.art}
              src={view.cover}
              alt={`${view.title} album art`}
              width={46}
              height={46}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/cover.svg";
              }}
            />

            <div className={styles.info} key={view.title}>
              <span className={styles.title} title={view.title}>
                {view.title}
                {view.isExplicit && (
                  <span className={styles.explicit} title="Explicit">
                    E
                  </span>
                )}
              </span>
              <span className={styles.artist} title={view.artist}>
                {view.artist}
                {view.year && <span className={styles.year}>{view.year}</span>}
              </span>
            </div>

            <div className={styles.buttons}>
            <button
              type="button"
              className={styles.btn}
              onClick={view.prev}
              aria-label="Previous"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M7 6v12M20 6l-9 6 9 6z" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.btn} ${styles.play}`}
              onClick={view.toggle}
              aria-label={view.isPlaying ? "Pause" : "Play"}
              aria-pressed={view.isPlaying}
            >
              {view.isPlaying ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M8 5l12 7-12 7z" fill="currentColor" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className={styles.btn}
              onClick={view.next}
              aria-label="Next"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 6l9 6-9 6zM17 6v12" fill="currentColor" />
              </svg>
            </button>
            </div>
          </div>

          {/* Elapsed · draggable seek bar · total. */}
          <div className={styles.bar}>
            <span className={styles.clock}>{fmt(shownTime)}</span>
            <input
              className={styles.seek}
              type="range"
              min={0}
              max={view.duration || 0}
              step={0.01}
              value={Math.min(shownTime, view.duration || 0)}
              onChange={onScrub}
              onPointerUp={commitScrub}
              onPointerCancel={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
              disabled={view.duration === 0}
              aria-label="Seek"
              aria-valuetext={`${fmt(shownTime)} of ${fmt(view.duration)}`}
              style={{ ["--progress" as string]: `${progress}%` }}
            />
            <span className={styles.clock}>{fmt(view.duration)}</span>
          </div>
        </section>

        {/* Offer the upgrade path only when it can actually work. */}
        {isConfigured() && !isLoggedIn() && (
          <button
            type="button"
            className={styles.connect}
            onClick={() => void login()}
          >
            Connect Spotify for full songs
          </button>
        )}
        {sdk.error && <p className={styles.hint}>{sdk.error}</p>}
      </div>

      {/* Two decks so tracks can overlap during the crossfade. */}
      <audio ref={deckA} preload="auto" />
      <audio ref={deckB} preload="auto" />
    </div>
  );
}
