import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Base2.0 Wallet — Privacy-Native Base Chain',
  description: 'Wallet for Base2.0 — every address has a built-in private sub-account powered by RAILGUN ZK cryptography.',
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
