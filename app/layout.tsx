import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import LiveSpacetimeProvider from '@/components/LiveSpacetimeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Org Topology Dashboard',
  description: 'Hybrid AI-Human Org Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveSpacetimeProvider>
          {children}
        </LiveSpacetimeProvider>
      </body>
    </html>
  );
}