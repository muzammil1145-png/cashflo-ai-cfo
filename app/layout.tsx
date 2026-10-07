import type { Metadata } from "next";
import "./globals.css";
import "./cashflo.css";

export const metadata: Metadata = {
  title: "CashFlo — AI Financial Clarity for Small Businesses",
  description: "Turn three financial statements into KPIs, operating concerns, recommendations, AI CFO answers, and management reports.",
  openGraph: {
    title: "CashFlo — Turn financial statements into decisions",
    description: "A private AI CFO workspace for small-business owners.",
    images: [{ url: "/cashflo-social-preview.png", width: 1733, height: 909, alt: "CashFlo financial intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/cashflo-social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
