/**
 * usePaperTrades.ts — Paper Trading Journal
 *
 * Local persistence for paper trades. This is the ONLY source of
 * truth for whether the system works — not the backtest numbers.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TradeSignal } from '../lib/scoring';

export interface PaperTrade {
  id: string;
  date: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  type: string; // 'corey' | 'emily'
  conviction: number;
  entry: number;
  stop: number;
  tp1: number;
  status: 'open' | 'win' | 'loss';
  exitPrice?: number;
  exitDate?: string;
  pnlPct?: number;
  notes?: string;
}

const STORAGE_KEY = 'csp_v20_paper_trades';

function load(): PaperTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(trades: PaperTrade[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (err) {
    console.error('[paperTrades] Failed to save:', err);
  }
}

export function usePaperTrades() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);

  useEffect(() => {
    setTrades(load());
  }, []);

  const logTrade = useCallback((signal: TradeSignal, notes?: string) => {
    const trade: PaperTrade = {
      id: `${signal.symbol}_${Date.now()}`,
      date: new Date().toISOString(),
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      direction: signal.direction,
      type: signal.dominantType,
      conviction: signal.conviction,
      entry: signal.entry,
      stop: signal.stop,
      tp1: signal.tp1,
      status: 'open',
      notes,
    };
    setTrades(prev => {
      const next = [trade, ...prev];
      save(next);
      return next;
    });
    return trade.id;
  }, []);

  const closeTrade = useCallback((id: string, exitPrice: number, notes?: string) => {
    setTrades(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const isLong = t.direction === 'LONG';
        const pnlPct = isLong
          ? ((exitPrice - t.entry) / t.entry) * 100
          : ((t.entry - exitPrice) / t.entry) * 100;
        return {
          ...t,
          status: (pnlPct > 0 ? 'win' : 'loss') as 'win' | 'loss',
          exitPrice,
          exitDate: new Date().toISOString(),
          pnlPct: Number(pnlPct.toFixed(2)),
          notes: notes ?? t.notes,
        };
      });
      save(next);
      return next;
    });
  }, []);

  const deleteTrade = useCallback((id: string) => {
    setTrades(prev => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    });
  }, []);

  const stats = (() => {
    const closed = trades.filter(t => t.status !== 'open');
    const wins = closed.filter(t => t.status === 'win');
    const losses = closed.filter(t => t.status === 'loss');
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnlPct || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnlPct || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnlPct || 0), 0) / losses.length : 0;

    return {
      totalTrades: trades.length,
      openTrades: trades.filter(t => t.status === 'open').length,
      closedTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Number(winRate.toFixed(1)),
      totalPnlPct: Number(totalPnl.toFixed(2)),
      avgWinPct: Number(avgWin.toFixed(2)),
      avgLossPct: Number(avgLoss.toFixed(2)),
    };
  })();

  return { trades, logTrade, closeTrade, deleteTrade, stats };
}
