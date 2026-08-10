"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playlist } from "@/lib/playlist";
import data from "@/lib/tracks.json";
import styles from "./GlassPlayer.module.css";

type Track = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  url: string;
  preview: string;
};

const tracks = data.tracks as Track[];

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GlassPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wantPlay = useRef(false);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const track = tracks[index];

  // Load the current track's preview whenever the index changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.src = track.preview;
    audio.load();
    setCurrentTime(0);
    if (wantPlay.current) void audio.play().catch(() => {});
  }, [index, track]);

  // Wire audio element events once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      wantPlay.current = true;
      setIndex((i) => (i + 1) % tracks.length);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      wantPlay.current = true;
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const go = useCallback((dir: 1 | -1) => {
    const audio = audioRef.current;
    wantPlay.current = audio ? !audio.paused : false;
    setIndex((i) => (i + dir + tracks.length) % tracks.length);
  }, []);

  const next = useCallback(() => go(1), [go]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // Match Apple Music: restart the track if we're past the intro.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    go(-1);
  }, [go]);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

  // Keyboard: space = play/pause, arrows = prev/next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "A" || tag === "BUTTON") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") {
        next();
      } else if (e.code === "ArrowLeft") {
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, prev]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          aria-label={`Now playing: ${track.title} by ${track.artist}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.art}
            src={playlist.coverUrl}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/cover.svg";
            }}
          />

          <div className={styles.info}>
            <span className={styles.title} title={track.title}>
              {track.title}
            </span>
            <span className={styles.artist} title={track.artist}>
              {track.artist}
            </span>
          </div>

          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.btn}
              onClick={prev}
              aria-label="Previous"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M7 6v12M20 6l-9 6 9 6z" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.btn} ${styles.play}`}
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
              aria-pressed={isPlaying}
            >
              {isPlaying ? (
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
              onClick={next}
              aria-label="Next"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 6l9 6-9 6zM17 6v12" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Slim seek bar hugging the bottom of the pill. */}
          <input
            className={styles.seek}
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            aria-label="Seek"
            style={{ ["--progress" as string]: `${progress}%` }}
          />
        </section>

        <p className={styles.hint}>
          <span className={styles.count}>
            {index + 1} / {tracks.length}
          </span>
          <span className={styles.preview}>30-second previews</span>
        </p>
      </div>

      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}
