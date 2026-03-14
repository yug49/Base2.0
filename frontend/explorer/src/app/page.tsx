import { Header } from '@/components/Header';
import { SearchBar } from '@/components/SearchBar';
import { PoolStats } from '@/components/PoolStats';
import { BlockList } from '@/components/BlockList';
import { TransactionTable } from '@/components/TransactionTable';
import { SepoliaLinks } from '@/components/SepoliaLinks';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Search bar */}
        <SearchBar />

        {/* Privacy stats banner */}
        <PoolStats />

        {/* Two-column: blocks + Sepolia links */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BlockList />
          </div>
          <div className="lg:col-span-1">
            <SepoliaLinks />
          </div>
        </div>

        {/* Full-width transaction table */}
        <TransactionTable />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-gray-600">
          <span>
            ShadowBase Explorer &middot; Privacy-Native Base L2 &middot; ETHMumbai 2026
          </span>
          <span className="font-mono">Chain 845311 &middot; OP Stack</span>
        </div>
      </footer>
    </div>
  );
}
