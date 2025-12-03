import "./globals.css";

export const metadata = {
  title: "Derivatives Volume Scanner",
  description: "Scanner for high-volume futures pairs with long/short signals"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
