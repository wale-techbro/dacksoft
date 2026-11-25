import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dacksoft — Customer support, with context",
  description: "Bring customer conversations, business knowledge, and AI-assisted support workflows into one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
