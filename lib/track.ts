// ─────────────────────────────────────────────────────────────────────────
//  Single-track manifest.
//
//  This is the ONLY file you need to edit to change what the player shows.
//  Drop your real audio file in /public/audio/ and cover art in /public/,
//  then point `src` and `cover` at them.
// ─────────────────────────────────────────────────────────────────────────

export type StreamingLink = {
  label: string;
  href: string;
};

export type Track = {
  /** Big wordmark shown at the top of the page. */
  siteName: string;
  /** Song title. */
  title: string;
  /** Artist / credit line. */
  artist: string;
  /** Path (from /public) to the audio file. */
  src: string;
  /** Path (from /public) to the square cover art. */
  cover: string;
  /** Optional streaming links. Leave empty to hide the row. */
  links: StreamingLink[];
};

export const track: Track = {
  siteName: "BANDBAJA",
  title: "Untitled Demo",
  artist: "Your Name Here",
  src: "/audio/track.wav",
  cover: "/cover.svg",
  links: [
    // Fill these in (or delete them) — the row hides itself when empty.
    // { label: "Spotify", href: "https://open.spotify.com/..." },
    // { label: "YT Music", href: "https://music.youtube.com/..." },
  ],
};
