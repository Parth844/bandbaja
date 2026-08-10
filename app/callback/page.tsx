"use client";

import { useEffect, useState } from "react";
import { completeLogin } from "@/lib/spotifyAuth";

/** Landing spot for Spotify's OAuth redirect. Swaps ?code= for a token. */
export default function Callback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const denied = params.get("error");
    const code = params.get("code");

    if (denied) {
      setError(`Spotify returned "${denied}".`);
      return;
    }
    if (!code) {
      setError("No authorisation code in the callback URL.");
      return;
    }

    completeLogin(code)
      .then(() => window.location.replace("/"))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="callback">
      <p>{error ?? "Connecting to Spotify…"}</p>
      {error && <a href="/">Back to the player</a>}
    </main>
  );
}
