# bandbaja

A minimalist, brutalist **single-track music player** — inspired by
[saloon.wtf](https://saloon.wtf/). Dark stage, mono type, a big cover, one
song, one scrub bar. Built with **Next.js (App Router) + React + TypeScript**
and zero UI dependencies.

<!-- Preview: dark centered player with cover art, play/pause and a thin progress bar. -->

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

It works out of the box using placeholder assets (a generated audio tone and a
generated SVG cover), so you can see the player before adding your own song.

## Make it yours

Everything lives in **one file**: [`lib/track.ts`](lib/track.ts).

1. Drop your song into `public/audio/` (e.g. `public/audio/my-song.mp3`).
2. Drop your cover art into `public/` (e.g. `public/cover.jpg`, ideally square).
3. Edit `lib/track.ts`:

   ```ts
   export const track: Track = {
     siteName: "BANDBAJA",           // top wordmark
     title: "My Song",
     artist: "My Name",
     src: "/audio/my-song.mp3",      // path under /public
     cover: "/cover.jpg",            // path under /public
     links: [
       { label: "Spotify",  href: "https://open.spotify.com/..." },
       { label: "YT Music", href: "https://music.youtube.com/..." },
     ],
   };
   ```

   Leave `links` empty (`[]`) to hide the streaming row entirely.

The placeholder tone (`public/audio/track.wav`) and `public/cover.svg` are safe
to delete once you've swapped in your own.

## Look & feel

Tweak the palette and type in [`app/globals.css`](app/globals.css)
(`--bg`, `--fg`, `--muted`, `--line`, fonts). Player layout lives in
[`components/Player.module.css`](components/Player.module.css).

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com/new](https://vercel.com/new), import the `bandbaja` repo.
3. Framework preset auto-detects **Next.js** — no config needed
   (`vercel.json` is included). Click **Deploy**.

## Scripts

| Command         | What it does                    |
| --------------- | ------------------------------- |
| `npm run dev`   | Start the dev server            |
| `npm run build` | Production build                |
| `npm run start` | Serve the production build      |
| `npm run lint`  | Lint                            |
