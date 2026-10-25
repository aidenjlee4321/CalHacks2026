import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import LiveSpacetimeProvider from '@/components/LiveSpacetimeProvider';
import { SessionProvider } from '@/components/SessionProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Org Topology Dashboard',
  description: 'Hybrid AI-Human Org Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <LiveSpacetimeProvider>
            {children}
          </LiveSpacetimeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
