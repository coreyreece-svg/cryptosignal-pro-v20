/**
 * useSignalEngine.ts — Scan Orchestration
 *
 * Fetches top symbols by real volume, pulls candles, generates
 * signals, ranks them. No AI calls, no TradFi, no blocking scanners.
 */

import { useState, useCallback } from 'react';
import { fetchTopSymbolsByVolume, fetchCandles, validateCandles } from '../lib/binance';
import { generateSignal, rankSignals, TradeSignal } from '../lib/scoring';

const TIMEFRAME = '1h';
const SYMBOL_LIMIT = 40;
const BATCH_SIZE = 6;

export function useSignalEngine() {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setSignals([]);
    setProgress('Loading top symbols by volume...');

    try {
      const symbols = await fetchTopSymbolsByVolume(SYMBOL_LIMIT);
      if (symbols.length === 0) {
        setError('Could not load symbols from Binance. Check network/API status.');
        setIsScanning(false);
        return;
      }

      const found: TradeSignal[] = [];

      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        setProgress(`Scanning ${Math.min(i + BATCH_SIZE, symbols.length)}/${symbols.length} • ${found.length} signals found...`);

        const batchResults = await Promise.all(
          batch.map(async (symbol) => {
            try {
              const [currentCandles, historicalCandles] = await Promise.all([
                fetchCandles(symbol, TIMEFRAME, 500),
                fetchCandles(symbol, TIMEFRAME, 1000),
              ]);

              const validation = validateCandles(currentCandles, TIMEFRAME);
              if (!validation.valid) return null;

              if (!currentCandles || !historicalCandles) return null;

              return generateSignal(symbol, TIMEFRAME, currentCandles, historicalCandles);
            } catch (err) {
              console.error(`[scan] Error on ${symbol}:`, err);
              return null;
            }
          })
        );

        for (const sig of batchResults) {
          if (sig) found.push(sig);
        }

        // Progressive render — update UI as batches complete
        setSignals(rankSignals([...found]));
      }

      setProgress(`Done. ${found.length} quality signals found.`);
    } catch (err) {
      console.error('[scan] Fatal error:', err);
      setError(err instanceof Error ? err.message : 'Unknown scan error');
    } finally {
      setIsScanning(false);
    }
  }, []);

  return { signals, isScanning, progress, error, scan };
}
