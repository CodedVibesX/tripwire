import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tripwire: auto-fix verdict",
  description:
    "A safe-to-ship gate for autonomous code fixes: it manufactures the test the suite never had, runs it, and decides ship / hold / reject.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
