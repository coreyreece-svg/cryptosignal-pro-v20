/**
 * corey.ts — Corey Pattern Replay Engine
 *
 * DTW-based pattern matching against historical data.
 *
 * BUILT-IN FROM THE START (not patched later):
 * - 20-candle forward lookahead (realistic trade duration, not 4)
 * - Simulated realistic trade execution (stop/target sequencing,
 *   not "best price in the window")
 * - Slippage + fees deducted from every simulated trade
 * - Conservative quality tiers requiring real sample size
 */

import type { Candle } from './binance';

export interface CoreyOptions {
  patternLength?: number;
  lookbackCandles?: number;
  distanceThreshold?: number;
  minMatches?: number;
  minWinRate?: number;
  direction: 'LONG' | 'SHORT';
}

export interface CoreySignal {
  isCorey: boolean;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'NONE';
  confidence: number;        // 0-100, = win rate
  historicalMatches: number;
  historicalWinRate: number; // 0-100
  expectedReturnPct: number; // after slippage/fees
  positionSizeMultiplier: number;
  reasons: string[];
}

// Realistic trade-cost assumptions — applied to every simulated match
const SLIPPAGE_ENTRY = 0.0005;   // 0.05%
const SLIPPAGE_EXIT = 0.0005;    // 0.05%
const FEES_PER_TRADE = 0.0015;   // 0.15% (round trip taker fees, conservative)
const STOP_LOSS_PCT = 0.01;      // 1% stop
const TARGET_PCT = 0.02;         // 2% target (2:1 R/R baseline)
const LOOKAHEAD_CANDLES = 20;    // realistic hold duration, not a 4-candle snapshot

export function detectCoreyPattern(
  currentCandles: Candle[],
  historicalCandles: Candle[],
  options: CoreyOptions
): CoreySignal {
  const opts = {
    patternLength: options.patternLength ?? 30,
    lookbackCandles: options.lookbackCandles ?? 1000,
    distanceThreshold: options.distanceThreshold ?? 0.18,
    minMatches: options.minMatches ?? 12,
    minWinRate: options.minWinRate ?? 0.70,
    direction: options.direction,
  };

  if (currentCandles.length < opts.patternLength) {
    return failedSignal('Not enough current candles');
  }
  if (historicalCandles.length < opts.lookbackCandles) {
    return failedSignal(`Insufficient history (have ${historicalCandles.length}, need ${opts.lookbackCandles})`);
  }

  const currentPattern = extractPattern(currentCandles.slice(-opts.patternLength));
  const search = historicalCandles.slice(-opts.lookbackCandles);
  const searchLimit = search.length - opts.patternLength - LOOKAHEAD_CANDLES - 1;

  let matches = 0;
  let wins = 0;
  let totalReturnPct = 0;

  for (let i = 0; i <= searchLimit; i++) {
    const histPattern = extractPattern(search.slice(i, i + opts.patternLength));
    const distance = dtwDistance(currentPattern, histPattern);

    if (distance < opts.distanceThreshold) {
      matches++;

      const entryCandle = search[i + opts.patternLength - 1];
      const entryPrice = entryCandle.close;
      const forwardCandles = search.slice(
        i + opts.patternLength,
        i + opts.patternLength + LOOKAHEAD_CANDLES
      );

      if (forwardCandles.length > 0 && entryPrice > 0) {
        const result = simulateRealisticTrade(entryPrice, forwardCandles, opts.direction);
        if (result.isWin) wins++;
        totalReturnPct += result.returnPct;
      }
    }
  }

  const winRate = matches > 0 ? wins / matches : 0;
  const isCorey = matches >= opts.minMatches && winRate >= opts.minWinRate;
  const avgReturnPct = matches > 0 ? totalReturnPct / matches : 0;

  if (!isCorey) {
    return {
      isCorey: false,
      tier: 'NONE',
      confidence: Math.round(winRate * 100),
      historicalMatches: matches,
      historicalWinRate: Math.round(winRate * 100),
      expectedReturnPct: 0,
      positionSizeMultiplier: 0,
      reasons: [
        `Only ${matches} matches (need ${opts.minMatches})`,
        `${(winRate * 100).toFixed(1)}% WR (need ${(opts.minWinRate * 100).toFixed(0)}%)`,
      ],
    };
  }

  const tier = getQualityTier(matches, winRate);

  return {
    isCorey: true,
    tier: tier.name,
    confidence: Math.round(winRate * 100),
    historicalMatches: matches,
    historicalWinRate: Math.round(winRate * 100),
    expectedReturnPct: Number((avgReturnPct * 100).toFixed(2)),
    positionSizeMultiplier: tier.multiplier,
    reasons: [
      `${matches} historical matches (${tier.name} tier)`,
      `${Math.round(winRate * 100)}% realistic win rate (after slippage/fees)`,
      `Expected return: ${(avgReturnPct * 100).toFixed(2)}% per trade`,
    ],
  };
}

/**
 * Simulates a realistic trade: enters with slippage, then walks forward
 * candle by candle checking whether stop or target is hit FIRST.
 * This replaces "pick the best price in the window" logic.
 */
function simulateRealisticTrade(
  entryPrice: number,
  futureCandles: Candle[],
  direction: 'LONG' | 'SHORT'
): { isWin: boolean; returnPct: number } {
  const isLong = direction === 'LONG';
  const realEntry = entryPrice * (1 + (isLong ? SLIPPAGE_ENTRY : -SLIPPAGE_ENTRY));

  const stopPrice = isLong ? realEntry * (1 - STOP_LOSS_PCT) : realEntry * (1 + STOP_LOSS_PCT);
  const targetPrice = isLong ? realEntry * (1 + TARGET_PCT) : realEntry * (1 - TARGET_PCT);

  let exitPrice: number | null = null;
  let isWin = false;

  for (const candle of futureCandles) {
    if (isLong) {
      // Stop takes priority if both would trigger in the same candle (conservative)
      if (candle.low <= stopPrice) {
        exitPrice = stopPrice * (1 - SLIPPAGE_EXIT);
        isWin = false;
        break;
      }
      if (candle.high >= targetPrice) {
        exitPrice = targetPrice * (1 - SLIPPAGE_EXIT);
        isWin = true;
        break;
      }
    } else {
      if (candle.high >= stopPrice) {
        exitPrice = stopPrice * (1 + SLIPPAGE_EXIT);
        isWin = false;
        break;
      }
      if (candle.low <= targetPrice) {
        exitPrice = targetPrice * (1 + SLIPPAGE_EXIT);
        isWin = true;
        break;
      }
    }
  }

  // Neither hit within lookahead window — close at last candle (realistic time-stop)
  if (exitPrice === null) {
    const lastClose = futureCandles[futureCandles.length - 1].close;
    exitPrice = lastClose;
    isWin = isLong ? lastClose > realEntry : lastClose < realEntry;
  }

  const grossReturn = isLong
    ? (exitPrice - realEntry) / realEntry
    : (realEntry - exitPrice) / realEntry;

  const netReturn = grossReturn - FEES_PER_TRADE;

  return { isWin, returnPct: netReturn };
}

function extractPattern(candles: Candle[]): number[] {
  const closes = candles.map(c => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return closes.map(c => (c - min) / range);
}

function dtwDistance(a: number[], b: number[]): number {
  const n = a.length, m = b.length;
  const dtw: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }
  return Math.min(dtw[n][m] / (n + m), 1.0);
}

function getQualityTier(matches: number, winRate: number): { name: 'PLATINUM' | 'GOLD' | 'SILVER'; multiplier: number } {
  if (matches >= 50 && winRate >= 0.87) return { name: 'PLATINUM', multiplier: 2.0 };
  if (matches >= 20 && winRate >= 0.80) return { name: 'GOLD', multiplier: 1.5 };
  return { name: 'SILVER', multiplier: 1.0 };
}

function failedSignal(reason: string): CoreySignal {
  return {
    isCorey: false,
    tier: 'NONE',
    confidence: 0,
    historicalMatches: 0,
    historicalWinRate: 0,
    expectedReturnPct: 0,
    positionSizeMultiplier: 0,
    reasons: [reason],
  };
}
