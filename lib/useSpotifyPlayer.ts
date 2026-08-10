"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accessToken, isConfigured, isLoggedIn } from "./spotifyAuth";

// ── Minimal typings for the Web Playback SDK global ────────────────────
type SdkArtist = { name: string };
type SdkTrack = {
  id: string | null;
  name: string;
  duration_ms: number;
  artists: SdkArtist[];
  album: { images: { url: string; width: number }[] };
};
type SdkState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SdkTrack };
};
type SdkPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (payload: never) => void): void;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(ms: number): Promise<void>;
  getCurrentState(): Promise<SdkState | null>;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

/** Load the SDK script once and resolve when it announces itself ready. */
function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_SRC}"]`,
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Could not load the Spotify SDK."));
    document.body.appendChild(script);
  });
}

async function api(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export type SpotifyPlayback = {
  /** Client ID present and user authorised — full playback is possible. */
  active: boolean;
  ready: boolean;
  /** Set when Spotify refuses us, most often a non-Premium account. */
  error: string | null;
  isPlaying: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  title: string;
  artist: string;
  cover: string;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
};

/**
 * Full-length playback through Spotify's Web Playback SDK.
 *
 * Inert unless a client ID is configured AND the visitor has logged in;
 * callers fall back to 30-second previews in that case. Playback itself
 * additionally requires the logged-in account to be Premium — Spotify
 * reports that as an `account_error`, surfaced here as `error`.
 */
export function useSpotifyPlayer(playlistId: string): SpotifyPlayback {
  const active = isConfigured() && isLoggedIn();

  const playerRef = useRef<SdkPlayer | null>(null);
  const deviceRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [track, setTrack] = useState<SdkTrack | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        await loadSdk();
        if (cancelled || !window.Spotify) return;

        const player = new window.Spotify.Player({
          name: "BANDBAJA",
          getOAuthToken: (cb) => {
            void accessToken().then((t) => t && cb(t));
          },
          volume: 0.8,
        });
        playerRef.current = player;

        player.addListener("ready", (({ device_id }: { device_id: string }) => {
          deviceRef.current = device_id;
          setReady(true);
        }) as never);

        player.addListener("not_ready", (() => setReady(false)) as never);

        player.addListener("player_state_changed", ((state: SdkState | null) => {
          if (!state) return;
          setIsPlaying(!state.paused);
          setPosition(state.position / 1000);
          setDuration(state.duration / 1000);
          setTrack(state.track_window.current_track);
        }) as never);

        const fail = (msg: string) =>
          (({ message }: { message: string }) =>
            setError(message || msg)) as never;

        player.addListener(
          "account_error",
          fail("Spotify Premium is required for in-page playback."),
        );
        player.addListener("authentication_error", fail("Spotify login expired."));
        player.addListener("initialization_error", fail("This browser cannot play Spotify audio."));
        player.addListener("playback_error", fail("Spotify could not play this track."));

        await player.connect();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [active]);

  // The SDK only pushes state on change, so tick the clock between events.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setPosition((p) => (duration > 0 ? Math.min(p + 0.25, duration) : p));
    }, 250);
    return () => window.clearInterval(id);
  }, [isPlaying, duration]);

  /** First play has to hand Spotify the playlist and this device. */
  const startPlaylist = useCallback(async () => {
    const token = await accessToken();
    const device = deviceRef.current;
    if (!token || !device) return;

    // Make our browser the active device, then start the playlist context.
    await api("/me/player", token, {
      method: "PUT",
      body: JSON.stringify({ device_ids: [device], play: false }),
    });
    const res = await api(`/me/player/play?device_id=${device}`, token, {
      method: "PUT",
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlistId}`,
      }),
    });
    if (res.ok) startedRef.current = true;
    else if (res.status === 403)
      setError("Spotify Premium is required for in-page playback.");
  }, [playlistId]);

  const toggle = useCallback(() => {
    if (!startedRef.current) {
      void startPlaylist();
      return;
    }
    void playerRef.current?.togglePlay();
  }, [startPlaylist]);

  const next = useCallback(() => void playerRef.current?.nextTrack(), []);
  const prev = useCallback(() => void playerRef.current?.previousTrack(), []);

  const seek = useCallback((seconds: number) => {
    setPosition(seconds); // optimistic, so the thumb never snaps back
    void playerRef.current?.seek(Math.round(seconds * 1000));
  }, []);

  const cover =
    track?.album.images.slice().sort((a, b) => b.width - a.width)[0]?.url ?? "";

  return {
    active,
    ready,
    error,
    isPlaying,
    position,
    duration,
    title: track?.name ?? "",
    artist: track?.artists.map((a) => a.name).join(", ") ?? "",
    cover,
    toggle,
    next,
    prev,
    seek,
  };
}
