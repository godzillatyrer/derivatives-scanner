import "./globals.css";

export const metadata = {
  title: "Hyperliquid Signal HQ",
  description:
    "All-coin Hyperliquid scanner with real-time updates, adaptive win-rate strategy, and paper trading portfolio"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
