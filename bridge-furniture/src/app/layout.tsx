import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { FeedbackProvider } from "@/components/ui/Feedback";
import { t, dir } from "@/i18n";

export const metadata: Metadata = {
  title: { default: `${t.appName} — ${t.appTagline}`, template: `%s · ${t.appName}` },
  description: t.appTagline,
  applicationName: t.appName,
  appleWebApp: { capable: true, title: t.appName, statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#7a4e28",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir={dir}>
      <body className="min-h-dvh antialiased">
        <FeedbackProvider>{children}</FeedbackProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
