'use client';

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { shadowBase } from '@/lib/chainConfig';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== shadowBase.id;

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isPending}
        className="px-5 py-2.5 rounded-xl bg-shadow-600 hover:bg-shadow-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
      >
        {isPending ? 'Connecting…' : 'Connect MetaMask'}
      </button>
    );
  }

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: shadowBase.id })}
        className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-all"
      >
        Switch to Base2.0
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl glass">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm text-gray-300 font-mono">
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </span>
      </div>
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all"
      >
        Disconnect
      </button>
    </div>
  );
}
