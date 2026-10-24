import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SpacetimeProvider } from '@/components/SpacetimeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Org Topology Dashboard',
  description: 'Hybrid AI-Human Org Hackathon App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SpacetimeProvider>
          {children}
        </SpacetimeProvider>
      </body>
    </html>
  );
}