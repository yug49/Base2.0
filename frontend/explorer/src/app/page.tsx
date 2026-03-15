import { Header } from '@/components/Header';
import { SearchBar } from '@/components/SearchBar';
import { SepoliaLinks } from '@/components/SepoliaLinks';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Search bar */}
        <SearchBar />

        {/* Sepolia L1 contracts */}
        <div className="max-w-xl mx-auto">
          <SepoliaLinks />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-gray-600">
          <span>
            Base2.0 Explorer &middot; Privacy-Native Base L2 &middot; ETHMumbai 2026
          </span>
          <span className="font-mono">Chain 845311 &middot; OP Stack</span>
        </div>
      </footer>
    </div>
  );
}
