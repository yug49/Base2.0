import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Base2.0 Explorer — Privacy-Native Block Explorer',
  description:
    'Block explorer for Base2.0 L2 — see how auto-shielding hides recipients on-chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
