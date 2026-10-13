import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BluffRoom — Real-Time Multiplayer Party Game",
  description: "Arkadaşlarınla gerçek zamanlı blöf yap, kandır ve puanları topla!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#090a16] text-[#f8fafc]">
        {children}
      </body>
    </html>
  );
}
