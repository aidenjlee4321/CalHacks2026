import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SpacetimeClient from '../components/SpacetimeClient';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Org Topology Dashboard',
  description: 'Hybrid AI-Human Org Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SpacetimeClient>{children}</SpacetimeClient>
      </body>
    </html>
  );
}