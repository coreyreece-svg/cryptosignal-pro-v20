/**
 * scoring.ts — Signal Generation & Scoring
 *
 * Combines Corey (pattern replay) and Emily (microstructure) into
 * a single signal object. Conviction is the MAX of individual
 * component convictions, never a sum (that's what caused every
 * signal to cap at 15/15 in the old app). Weak signals are filtered
 * out before they ever reach the UI.
 */

import type { Candle } from './binance';
import { detectCoreyPattern, CoreySignal } from './corey';
import { calculateEmilySignal, EmilySignal } from './emily';
import { rsi, macd, calculateADX, atr } from './indicators';

export interface TradeSignal {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  dominantType: 'corey' | 'emily' | 'none';
  conviction: number; // 0-15
  score: number;       // 0-10 raw confluence score

  corey: CoreySignal;
  emily: EmilySignal;

  current: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPct: number;
  rewardRatios: { tp1: number; tp2: number; tp3: number };

  rank: number;
  reasons: string[];
  timestamp: string;
}

const MIN_CONVICTION_THRESHOLD = 10;

/**
 * Generate a signal for one symbol/timeframe. Returns null if data
 * is insufficient or no meaningful setup exists — callers should
 * skip nulls rather than display an empty card.
 */
export function generateSignal(
  symbol: string,
  timeframe: string,
  currentCandles: Candle[],
  historicalCandles: Candle[]
): TradeSignal | null {
  if (currentCandles.length < 50) return null;

  const closes = currentCandles.map(c => c.close);
  const highs = currentCandles.map(c => c.high);
  const lows = currentCandles.map(c => c.low);
  const current = closes[closes.length - 1];

  // --- Directional bias from base technicals ---
  const rsiArr = rsi(closes, 14);
  const lastRsi = rsiArr[rsiArr.length - 1];
  const { histogram } = macd(closes);
  const lastMacdHist = histogram[histogram.length - 1];
  const adxArr = calculateADX(highs, lows, closes, 14);
  const lastAdx = adxArr[adxArr.length - 1] || 0;

  // Skip choppy markets (ADX filter) — avoids trading noise
  if (lastAdx > 0 && lastAdx < 15) return null;

  let baseDirection: 'LONG' | 'SHORT' = 'LONG';
  if (!isNaN(lastRsi)) {
    baseDirection = lastRsi > 55 ? 'SHORT' : lastRsi < 45 ? 'LONG' : (lastMacdHist < 0 ? 'SHORT' : 'LONG');
  }

  // --- Corey pattern replay ---
  const corey = detectCoreyPattern(currentCandles, historicalCandles, {
    direction: baseDirection,
    lookbackCandles: Math.min(1000, historicalCandles.length),
  });

  // --- Emily microstructure ---
  const emily = calculateEmilySignal(currentCandles);

  // --- Conviction: MAX of components, never summed ---
  const coreyConviction = corey.isCorey ? Math.min(Math.round((corey.historicalWinRate / 100) * 15), 15) : 0;
  const emilyConviction = emily.fires ? Math.min(Math.round((emily.score / 10) * 15), 15) : 0;

  const conviction = Math.max(coreyConviction, emilyConviction);
  const dominantType: TradeSignal['dominantType'] =
    coreyConviction >= emilyConviction && coreyConviction > 0 ? 'corey' :
    emilyConviction > 0 ? 'emily' : 'none';

  if (conviction < MIN_CONVICTION_THRESHOLD) return null; // filtered out — no noise signals

  // --- Direction: prefer the dominant signal's implied direction ---
  const direction: 'LONG' | 'SHORT' =
    dominantType === 'emily' && emily.direction !== 'NONE' ? emily.direction : baseDirection;

  // --- Pricing ---
  const volatility = atr(highs, lows, closes, 14) / current; // as fraction of price
  const stopDistance = Math.max(volatility * 1.5, 0.008); // at least 0.8%
  const entry = current;
  const stop = direction === 'LONG' ? entry * (1 - stopDistance) : entry * (1 + stopDistance);
  const tp1 = direction === 'LONG' ? entry * (1 + stopDistance * 1.5) : entry * (1 - stopDistance * 1.5);
  const tp2 = direction === 'LONG' ? entry * (1 + stopDistance * 3.0) : entry * (1 - stopDistance * 3.0);
  const tp3 = direction === 'LONG' ? entry * (1 + stopDistance * 5.0) : entry * (1 - stopDistance * 5.0);

  const riskAmount = Math.abs(entry - stop);
  const rewardRatios = {
    tp1: riskAmount > 0 ? Math.abs(tp1 - entry) / riskAmount : 0,
    tp2: riskAmount > 0 ? Math.abs(tp2 - entry) / riskAmount : 0,
    tp3: riskAmount > 0 ? Math.abs(tp3 - entry) / riskAmount : 0,
  };

  const reasons: string[] = [];
  if (corey.isCorey) reasons.push(...corey.reasons);
  if (emily.fires) reasons.push(...emily.reasons);

  const score = Math.min((coreyConviction + emilyConviction) / 3, 10);

  return {
    symbol,
    timeframe,
    direction,
    dominantType,
    conviction,
    score: Number(score.toFixed(1)),
    corey,
    emily,
    current,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    riskPct: Number((stopDistance * 100).toFixed(2)),
    rewardRatios,
    rank: 0, // assigned by rankSignals()
    reasons,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Rank signals by conviction, assign rank field, return sorted list.
 * This is what the 3-strike UI rule (rank <= 2) checks against.
 */
export function rankSignals(signals: TradeSignal[]): TradeSignal[] {
  const sorted = [...signals].sort((a, b) => b.conviction - a.conviction || b.score - a.score);
  sorted.forEach((s, i) => { s.rank = i + 1; });
  return sorted;
}
