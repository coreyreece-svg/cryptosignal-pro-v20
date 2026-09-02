import React, { useState } from 'react';
import type { PaperTrade } from '../hooks/usePaperTrades';

interface Props {
  trades: PaperTrade[];
  stats: {
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlPct: number;
    avgWinPct: number;
    avgLossPct: number;
  };
  onClose: (id: string, exitPrice: number) => void;
  onDelete: (id: string) => void;
}

export function JournalPanel({ trades, stats, onClose, onDelete }: Props) {
  const [exitInputs, setExitInputs] = useState<Record<string, string>>({});

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
      <h2 style={{ fontSize: 16, color: '#e6edf3', marginTop: 0, marginBottom: 12 }}>Paper Trading Journal</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat label="Total" value={stats.totalTrades} />
        <Stat label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate >= 55 ? '#22c55e' : stats.closedTrades < 10 ? '#8b949e' : '#ef4444'} />
        <Stat label="Total P&L" value={`${stats.totalPnlPct > 0 ? '+' : ''}${stats.totalPnlPct}%`} color={stats.totalPnlPct >= 0 ? '#22c55e' : '#ef4444'} />
        <Stat label="Open" value={stats.openTrades} />
      </div>

      {stats.closedTrades < 50 && (
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
          {stats.closedTrades}/50 trades closed — need 50+ for a statistically meaningful win rate.
        </div>
      )}

      {trades.length === 0 && (
        <div style={{ fontSize: 13, color: '#8b949e' }}>No trades logged yet. Generate signals and log your first trade.</div>
      )}

      {trades.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', borderBottom: '1px solid #21262d', fontSize: 13,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: '#e6edf3' }}>{t.symbol}</span>
            <span style={{ color: '#8b949e', marginLeft: 6 }}>{t.direction} · {t.type} · conv {t.conviction}</span>
          </div>

          {t.status === 'open' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="exit price"
                value={exitInputs[t.id] || ''}
                onChange={e => setExitInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                style={{
                  width: 100, background: '#0d1117', border: '1px solid #30363d',
                  borderRadius: 4, color: '#e6edf3', padding: '4px 6px', fontSize: 12,
                }}
              />
              <button
                onClick={() => {
                  const val = parseFloat(exitInputs[t.id]);
                  if (Number.isFinite(val) && val > 0) onClose(t.id, val);
                }}
                style={{
                  background: '#238636', color: '#fff', border: 'none', borderRadius: 4,
                  padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          ) : (
            <span style={{ color: t.status === 'win' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              {t.status === 'win' ? 'WIN' : 'LOSS'} {t.pnlPct! > 0 ? '+' : ''}{t.pnlPct}%
            </span>
          )}

          <button
            onClick={() => onDelete(t.id)}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', marginLeft: 10, fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#0d1117', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#8b949e' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || '#e6edf3' }}>{value}</div>
    </div>
  );
}
