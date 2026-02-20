import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';

export const metadata = {
  title: 'HyperSignals - Hyperliquid Trading Intelligence',
  description: 'Real-time trading signals for Hyperliquid perpetuals with AI-powered technical analysis',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#09090b]">
        <Sidebar />
        <main className="ml-56 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
