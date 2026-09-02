import React, { useState } from 'react';
import { useSignalEngine } from './hooks/useSignalEngine';
import { usePaperTrades } from './hooks/usePaperTrades';
import { SignalCard } from './components/SignalCard';
import { JournalPanel } from './components/JournalPanel';
import type { TradeSignal } from './lib/scoring';

export default function App() {
  const { signals, isScanning, progress, error, scan } = useSignalEngine();
  const { trades, logTrade, closeTrade, deleteTrade, stats } = usePaperTrades();
  const [tab, setTab] = useState<'signals' | 'journal'>('signals');

  const handlePaperTrade = (signal: TradeSignal) => {
    logTrade(signal);
    setTab('journal');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>CryptoSignal Pro — v20</h1>
          <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
            Real Binance data only. No TradFi. Realistic backtest simulation.
          </p>
        </header>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TabButton active={tab === 'signals'} onClick={() => setTab('signals')}>
            Signals {signals.length > 0 && `(${signals.length})`}
          </TabButton>
          <TabButton active={tab === 'journal'} onClick={() => setTab('journal')}>
            Journal {stats.closedTrades > 0 && `(${stats.closedTrades})`}
          </TabButton>
        </div>

        {tab === 'signals' && (
          <>
            <button
              onClick={scan}
              disabled={isScanning}
              style={{
                width: '100%', padding: '12px 0', marginBottom: 16, borderRadius: 8, border: 'none',
                background: isScanning ? '#30363d' : '#238636', color: '#fff', fontWeight: 700, fontSize: 14,
                cursor: isScanning ? 'default' : 'pointer',
              }}
            >
              {isScanning ? progress || 'Scanning...' : 'Scan Signals'}
            </button>

            {error && (
              <div style={{ background: '#3d1c1c', border: '1px solid #ef444440', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
                {error}
              </div>
            )}

            {!isScanning && signals.length === 0 && !error && (
              <div style={{ fontSize: 13, color: '#8b949e', textAlign: 'center', padding: '40px 0' }}>
                No signals yet. Click "Scan Signals" to begin.
              </div>
            )}

            {signals.map(sig => (
              <SignalCard key={`${sig.symbol}_${sig.timeframe}`} signal={sig} onPaperTrade={handlePaperTrade} />
            ))}
          </>
        )}

        {tab === 'journal' && (
          <JournalPanel trades={trades} stats={stats} onClose={closeTrade} onDelete={deleteTrade} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
        background: active ? '#1f6feb' : '#161b22', color: active ? '#fff' : '#8b949e',
        fontWeight: 600, fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}