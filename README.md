# bandbaja

A music player with a full-bleed background and an Apple-Music-style **liquid-glass
now-playing bar**, pinned bottom-center — inspired by
[saloon.wtf](https://saloon.wtf/). Built with **Next.js (App Router) + React +
TypeScript**, zero UI dependencies.

Currently playing **“pahado mein chale?”** by *hreelina* — 90 tracks, 30-second
previews, with working **play/pause, next, previous**, scrubbing, and
auto-advance.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Add your background image

Drop your artwork at **`public/background.jpg`** — it fills the screen behind
the glass bar. Until you add it (or if it fails to load), a cave-lagoon gradient
that matches the vibe shows instead, so nothing ever looks broken. (Any
web-friendly name works if you also update `.bg` in
[`components/GlassPlayer.module.css`](components/GlassPlayer.module.css).)

## Change the playlist

1. Edit the Spotify details in [`lib/playlist.ts`](lib/playlist.ts)
   (`spotifyId`, `url`, `title`, `owner`, `coverUrl`).
2. Regenerate the track list + previews:

   ```bash
   node scripts/refresh-playlist.mjs        # uses the id in lib/playlist.ts
   # or: node scripts/refresh-playlist.mjs <playlistId>
   ```

   This rewrites [`lib/tracks.json`](lib/tracks.json) from the playlist's public
   Spotify embed data (title, artist, duration, 30-second preview MP3 per track).

> Note: playback uses Spotify's 30-second **preview** clips (the same ones the
> web embed uses). Full-length playback would require Spotify OAuth + Premium,
> which is out of scope for a static site.

## Controls

- **Play / Pause** — center button, or the spacebar
- **Next / Previous** — side buttons, or ← / → arrows (previous restarts the
  track first if you're more than 3s in, like Apple Music)
- **Scrub** — the slim bar along the bottom of the glass pill
- Tracks **auto-advance** and the list loops

## Look & feel

Palette and fonts: [`app/globals.css`](app/globals.css). The glass bar, layout,
and background live in
[`components/GlassPlayer.module.css`](components/GlassPlayer.module.css).

## Deploy to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new) — Next.js is
auto-detected (`vercel.json` included). Click **Deploy**.

## Scripts

| Command                              | What it does                        |
| ------------------------------------ | ----------------------------------- |
| `npm run dev`                        | Start the dev server                |
| `npm run build`                      | Production build                    |
| `npm run start`                      | Serve the production build          |
| `node scripts/refresh-playlist.mjs`  | Rebuild `lib/tracks.json` from Spotify |
