// ─────────────────────────────────────────────────────────────────────────
//  Spotify OAuth — Authorization Code with PKCE.
//
//  PKCE means no client secret, so this runs entirely in the browser and
//  nothing sensitive ships to the client. Full-length playback needs it:
//  Spotify only streams complete tracks to an authenticated Premium user.
//
//  Setup (one time):
//    1. Create an app at https://developer.spotify.com/dashboard
//    2. Add a Redirect URI of  http://127.0.0.1:3000/callback  for local dev
//       (Spotify rejects "localhost" over http — it must be 127.0.0.1), plus
//       https://your-domain/callback for production.
//    3. Put the client ID in .env.local as NEXT_PUBLIC_SPOTIFY_CLIENT_ID.
// ─────────────────────────────────────────────────────────────────────────

export const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

/** `streaming` is the scope that authorises playback in our own player. */
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

const TOKEN_KEY = "bandbaja.spotify.token";
const VERIFIER_KEY = "bandbaja.spotify.verifier";

type StoredToken = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
};

function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

function read(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function write(t: StoredToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function isConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

/** True once the user has authorised — playback may still need Premium. */
export function isLoggedIn(): boolean {
  return read() !== null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Kick off the redirect to Spotify's consent screen. */
export async function login(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function tokenRequest(body: URLSearchParams): Promise<StoredToken> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}`);
  const json = await res.json();
  const token: StoredToken = {
    accessToken: json.access_token,
    // A refresh response may omit refresh_token; keep the one we have.
    refreshToken: json.refresh_token ?? read()?.refreshToken ?? "",
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  write(token);
  return token;
}

/** Exchange the ?code= from the callback for tokens. */
export async function completeLogin(code: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — restart the login.");
  sessionStorage.removeItem(VERIFIER_KEY);

  await tokenRequest(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  );
}

/**
 * A usable access token, refreshed when it is within 60s of expiring.
 * Returns null when the user has not logged in (or the refresh failed).
 */
export async function accessToken(): Promise<string | null> {
  const stored = read();
  if (!stored) return null;
  if (Date.now() < stored.expiresAt - 60_000) return stored.accessToken;
  if (!stored.refreshToken) return null;

  try {
    const next = await tokenRequest(
      new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
      }),
    );
    return next.accessToken;
  } catch {
    logout();
    return null;
  }
}
