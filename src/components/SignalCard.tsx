import React from 'react';
import type { TradeSignal } from '../lib/scoring';

interface Props {
  signal: TradeSignal;
  onPaperTrade: (signal: TradeSignal) => void;
}

function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

export function SignalCard({ signal, onPaperTrade }: Props) {
  const isBlocked = signal.rank > 2;
  const dirColor = signal.direction === 'LONG' ? '#22c55e' : '#ef4444';
  const typeLabel = signal.dominantType === 'corey'
    ? `COREY ${signal.corey.tier}`
    : signal.dominantType === 'emily'
    ? 'EMILY EXHAUSTION'
    : 'SIGNAL';

  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${isBlocked ? '#30363d' : '#2ea04326'}`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      opacity: isBlocked ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3' }}>{signal.symbol}</span>
          <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>{signal.timeframe}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: dirColor, color: '#0d1117', fontWeight: 700, fontSize: 12,
            padding: '3px 10px', borderRadius: 4,
          }}>{signal.direction}</span>
          <span style={{ fontSize: 13, color: '#8b949e' }}>#{signal.rank}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{typeLabel}</span>
        <span style={{ fontSize: 13, color: '#f0b429', fontWeight: 700 }}>Conviction {signal.conviction}/15</span>
      </div>

      {signal.dominantType === 'corey' && (
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
          {signal.corey.historicalMatches} matches · {signal.corey.historicalWinRate}% realistic WR ·
          expected {signal.corey.expectedReturnPct > 0 ? '+' : ''}{signal.corey.expectedReturnPct}%/trade
        </div>
      )}
      {signal.dominantType === 'emily' && (
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
          Score {signal.emily.score}/10 · liquidity exhaustion + volume collapse detected
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <PriceBox label="Current" value={fmtPrice(signal.current)} />
        <PriceBox label="Entry" value={fmtPrice(signal.entry)} />
        <PriceBox label="Stop" value={fmtPrice(signal.stop)} sub={`${signal.riskPct}% risk`} negative />
        <PriceBox label="TP1" value={fmtPrice(signal.tp1)} sub={`${signal.rewardRatios.tp1.toFixed(1)}R`} positive />
      </div>

      {isBlocked && (
        <div style={{
          background: '#3d1c1c', border: '1px solid #ef444440', borderRadius: 6,
          padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#fca5a5',
        }}>
          Rank #{signal.rank} — execute higher-ranked signals first.
        </div>
      )}

      <button
        onClick={() => onPaperTrade(signal)}
        disabled={isBlocked}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 6, border: 'none',
          fontWeight: 700, fontSize: 13, cursor: isBlocked ? 'not-allowed' : 'pointer',
          background: isBlocked ? '#30363d' : '#238636',
          color: isBlocked ? '#8b949e' : '#fff',
        }}
      >
        {isBlocked ? 'Blocked' : 'Log Paper Trade'}
      </button>
    </div>
  );
}

function PriceBox({ label, value, sub, positive, negative }: { label: string; value: string; sub?: string; positive?: boolean; negative?: boolean }) {
  return (
    <div style={{ background: '#0d1117', borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ fontSize: 10, color: '#8b949e' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: positive ? '#22c55e' : negative ? '#ef4444' : '#e6edf3' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#8b949e' }}>{sub}</div>}
    </div>
  );
}
