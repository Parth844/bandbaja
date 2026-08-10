import type { Metadata } from "next";
import { playlist } from "@/lib/playlist";
import "./globals.css";

export const metadata: Metadata = {
  title: `BANDBAJA — ${playlist.title}`,
  description: playlist.description || `A playlist by ${playlist.owner}.`,
  openGraph: {
    title: `BANDBAJA — ${playlist.title}`,
    description: playlist.description || `A playlist by ${playlist.owner}.`,
    type: "music.playlist",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
