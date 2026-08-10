// Regenerate lib/tracks.json from a public Spotify playlist's embed data.
//
//   node scripts/refresh-playlist.mjs [playlistId]
//
// Defaults to the id in lib/playlist.ts. Pulls each track's title, artist,
// duration, Spotify URL, and 30-second preview MP3 from the embed page's
// __NEXT_DATA__ payload. Tracks without a playable preview are skipped.
//
// The playlist payload carries no per-track artwork, so each track is then
// enriched from two more public endpoints (no API keys, no auth):
//   • /oembed        → album art thumbnail (300px) + canonical title
//   • /embed/track/  → release date, explicit flag, full artist list
// Enrichment is best-effort: a track whose lookups fail keeps its base fields
// and falls back to the playlist cover in the UI.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function playlistIdFromConfig() {
  const src = readFileSync(join(root, "lib", "playlist.ts"), "utf8");
  const m = src.match(/spotifyId:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

const id = process.argv[2] || playlistIdFromConfig();
if (!id) {
  console.error("No playlist id given and none found in lib/playlist.ts");
  process.exit(1);
}

const embedUrl = `https://open.spotify.com/embed/playlist/${id}?utm_source=generator`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/** Pull the embed page's __NEXT_DATA__ entity, or null if anything is off. */
async function fetchEntity(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const m = NEXT_DATA_RE.exec(await res.text());
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity ?? null;
  } catch {
    return null;
  }
}

/**
 * Spotify image ids encode their size in the first 16 chars, so the 300px art
 * oEmbed hands back can be rewritten to the 640px variant for free.
 */
function upscaleCover(url) {
  return url?.replace(
    /\/image\/ab67616d00001e02([0-9a-f]+)$/,
    "/image/ab67616d0000b273$1",
  );
}

/** Run `work` over `items` with at most `limit` requests in flight. */
async function mapLimit(items, limit, work) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await work(items[i], i);
      }
    }),
  );
  return out;
}

const res = await fetch(embedUrl, { headers: { "User-Agent": UA } });
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const html = await res.text();

const m = html.match(NEXT_DATA_RE);
if (!m) {
  console.error("Could not find __NEXT_DATA__ in embed page");
  process.exit(1);
}

const data = JSON.parse(m[1]);
const entity = data?.props?.pageProps?.state?.data?.entity;
const list = entity?.trackList ?? [];

const tracks = list
  .filter((t) => t.isPlayable !== false && t.audioPreview?.url)
  .map((t) => {
    const trackId = String(t.uri || "").split(":").pop();
    return {
      id: trackId,
      title: t.title ?? "Untitled",
      artist: t.subtitle ?? "",
      durationMs: t.duration ?? 0,
      url: trackId ? `https://open.spotify.com/track/${trackId}` : entity?.url,
      preview: t.audioPreview.url,
    };
  });

// ── Per-track enrichment ───────────────────────────────────────────────
// Two lookups per track, six at a time to stay polite to Spotify.
console.log(`Enriching ${tracks.length} tracks with artwork and details…`);

let enriched = 0;
const detailed = await mapLimit(tracks, 6, async (t) => {
  const [art, meta] = await Promise.all([
    fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(t.url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetchEntity(
      `https://open.spotify.com/embed/track/${t.id}?utm_source=generator`,
    ).catch(() => null),
  ]);

  const cover = upscaleCover(art?.thumbnail_url) ?? "";
  const artists = meta?.artists?.map((a) => a.name).filter(Boolean) ?? [];
  const released = meta?.releaseDate?.isoString ?? "";

  if (cover) enriched++;

  return {
    ...t,
    // Artist list is richer than the playlist's single subtitle line.
    artist: artists.length ? artists.join(", ") : t.artist,
    cover,
    // Year is all the UI needs; keep the full ISO string for anything later.
    released,
    year: released ? released.slice(0, 4) : "",
    isExplicit: meta?.isExplicit ?? false,
  };
});

const out = {
  playlist: {
    name: entity?.name ?? "",
    id,
    url: `https://open.spotify.com/playlist/${id}`,
  },
  generatedFrom: embedUrl,
  count: detailed.length,
  tracks: detailed,
};

writeFileSync(join(root, "lib", "tracks.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote lib/tracks.json — ${detailed.length} playable tracks from "${entity?.name}", ` +
    `${enriched} with album art.`,
);
if (enriched < detailed.length) {
  console.warn(
    `${detailed.length - enriched} track(s) had no artwork; they fall back to the playlist cover.`,
  );
}
