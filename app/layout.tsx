import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Toaster } from 'react-hot-toast';
import SafeGraphPage from '@/components/SafeGraphPage';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Daily Knowledge Graph Visualizer',
  description: 'A multiplayer visualizer for GRC-20 knowledge graphs',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <SafeGraphPage>
            {children}
          </SafeGraphPage>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
