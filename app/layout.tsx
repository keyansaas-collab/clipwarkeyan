import "./globals.css";
import type { Metadata, Viewport } from "next";
import UpdateWatcher from "@/components/UpdateWatcher";

export const metadata: Metadata = {
  title: "ClipWar — War Room",
  description: "Plateforme de gestion de clippers — campagnes, challenges, suivi des vues et paiements.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body><UpdateWatcher />{children}</body>
    </html>
  );
}
