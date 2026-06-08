import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raid Simulator MVP",
  description: "8-player 2.5D raid practice simulator MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
