import "./globals.css";

export const metadata = {
  title: "Hyperliquid Signal Terminal",
  description:
    "Realtime Hyperliquid scanner with multi-indicator trade signals, TP/SL planning and adaptive tuning"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
