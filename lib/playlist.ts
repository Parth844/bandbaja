// ─────────────────────────────────────────────────────────────────────────
//  Playlist config — the ONLY file you edit to change what the site plays.
//
//  To use a different Spotify playlist: open the playlist in Spotify, hit
//  Share → Copy link, and paste the URL below as `url`. The ID is the part
//  after /playlist/ and before the "?". Update the title/owner to match.
// ─────────────────────────────────────────────────────────────────────────

export type StreamingLink = {
  label: string;
  href: string;
};

export type Playlist = {
  /** Big wordmark shown at the top of the page. */
  siteName: string;
  /** Playlist name. */
  title: string;
  /** Playlist owner / curator. */
  owner: string;
  /** Optional one-line description. Leave "" to hide it. */
  description: string;
  /** Spotify playlist ID (the bit after /playlist/ in the share URL). */
  spotifyId: string;
  /** Full public Spotify URL — powers the "Open in Spotify" link. */
  url: string;
  /** Remote cover art URL (Spotify CDN). Falls back to /cover.svg on error. */
  coverUrl: string;
  /** Extra streaming links. Leave empty to show only "Open in Spotify". */
  links: StreamingLink[];
};

export const playlist: Playlist = {
  siteName: "BANDBAJA",
  title: "pahado mein chale?",
  owner: "hreelina",
  description: "I NEEDA BE IN THE PAHAD DAWG!",
  spotifyId: "0sPtH0QaSeu2Hcxahtry8K",
  url: "https://open.spotify.com/playlist/0sPtH0QaSeu2Hcxahtry8K",
  coverUrl:
    "https://i.scdn.co/image/ab67706c0000d72c987ae2ad712168eb5b987ac3",
  links: [],
};

/** Spotify's official embed URL — `theme=0` keeps it dark to match the page. */
export function spotifyEmbedUrl(id: string): string {
  return `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`;
}
