import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mystery Box System",
  description: "Multi-tenant mystery box giveaway panel & member site"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
