import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ShadowBase Wallet — Privacy-Native Base Chain',
  description: 'Wallet for ShadowBase — every address has a built-in private sub-account powered by RAILGUN ZK cryptography.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
