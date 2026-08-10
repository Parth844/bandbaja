import Player from "@/components/Player";
import { track } from "@/lib/track";

export default function Home() {
  return (
    <main className="page">
      <Player track={track} />
    </main>
  );
}
