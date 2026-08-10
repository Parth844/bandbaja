// Regenerate lib/tracks.json from a public Spotify playlist's embed data.
//
//   node scripts/refresh-playlist.mjs [playlistId]
//
// Defaults to the id in lib/playlist.ts. Pulls each track's title, artist,
// duration, Spotify URL, and 30-second preview MP3 from the embed page's
// __NEXT_DATA__ payload. Tracks without a playable preview are skipped.

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

const res = await fetch(embedUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  },
});
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const html = await res.text();

const m = html.match(
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
);
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

const out = {
  playlist: {
    name: entity?.name ?? "",
    id,
    url: `https://open.spotify.com/playlist/${id}`,
  },
  generatedFrom: embedUrl,
  count: tracks.length,
  tracks,
};

writeFileSync(join(root, "lib", "tracks.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote lib/tracks.json — ${tracks.length} playable tracks from "${entity?.name}".`);
