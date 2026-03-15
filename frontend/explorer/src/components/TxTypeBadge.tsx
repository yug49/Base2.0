'use client';

import { type TxType } from '@/lib/fetcher';

const BADGE_CONFIG: Record<TxType, { label: string; color: string; icon: string }> = {
  public:    { label: 'Public',       color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',            icon: '' },
  shielded:  { label: 'Shielded',     color: 'bg-private-500/15 text-private-400 border-private-500/20',   icon: '' },
  shield:    { label: 'Shield',       color: 'bg-private-500/15 text-private-400 border-private-500/20',   icon: '' },
  unshield:  { label: 'Unshield',     color: 'bg-amber-500/15 text-amber-400 border-amber-500/20',        icon: '' },
  transact:  { label: 'Private Tx',   color: 'bg-private-500/15 text-private-300 border-private-500/25',   icon: '' },
  claim:     { label: 'Claim',        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',  icon: '' },
  bridge:    { label: 'Bridge',       color: 'bg-cyan-400/15 text-cyan-400 border-cyan-400/20',           icon: '' },
  contract:  { label: 'Deploy',       color: 'bg-gray-500/15 text-gray-400 border-gray-500/20',           icon: '' },
  system:    { label: 'System',       color: 'bg-gray-500/15 text-gray-500 border-gray-500/20',           icon: '' },
};

export function TxTypeBadge({ type }: { type: TxType }) {
  const cfg = BADGE_CONFIG[type] || BADGE_CONFIG.public;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.color}`}
    >
      <span className="text-xs">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
