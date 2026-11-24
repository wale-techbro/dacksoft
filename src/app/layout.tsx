import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dacksoft — Connected customer support",
  description: "AI customer support connected to the systems behind your business.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
