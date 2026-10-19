import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustBridge AI — Clear agreements. Secure payments.",
  description: "Turn informal requests into clear agreements, secure PayPal payments, and a shared transaction record.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
