/**
 * emily.ts — Emily Microstructure Engine
 *
 * Detects order-flow exhaustion patterns from OHLCV data:
 * liquidity exhaustion, volume collapse, and CVD extremity.
 * No external order-book feed required — derives proxies from candles.
 */

import type { Candle } from './binance';
import { calculateCVD } from './indicators';

export interface EmilySignal {
  score: number;       // 0-10
  fires: boolean;       // score >= 6
  direction: 'LONG' | 'SHORT' | 'NONE';
  components: {
    liquidityExhaustion: number; // 0-3
    volumeCollapse: number;      // 0-2
    cvdExtremity: number;        // 0-2
    priceConsolidation: number;  // 0-2
    momentumFade: number;        // 0-1
  };
  reasons: string[];
}

export function calculateEmilySignal(candles: Candle[]): EmilySignal {
  const empty: EmilySignal = {
    score: 0,
    fires: false,
    direction: 'NONE',
    components: { liquidityExhaustion: 0, volumeCollapse: 0, cvdExtremity: 0, priceConsolidation: 0, momentumFade: 0 },
    reasons: ['Insufficient data'],
  };

  if (candles.length < 30) return empty;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const opens = candles.map(c => c.open);

  const reasons: string[] = [];

  // 1. Volume collapse: recent volume vs 10-candle average
  const recentVol = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const avgVol = volumes.slice(-13, -3).reduce((a, b) => a + b, 0) / 10;
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;
  let volumeCollapse = 0;
  if (volRatio < 0.15) { volumeCollapse = 2; reasons.push(`Extreme volume collapse: ${(volRatio * 100).toFixed(0)}% of avg`); }
  else if (volRatio < 0.35) { volumeCollapse = 1; reasons.push(`Volume drying up: ${(volRatio * 100).toFixed(0)}% of avg`); }

  // 2. Liquidity exhaustion: shrinking candle ranges (book getting thin)
  const recentRanges = candles.slice(-5).map(c => c.high - c.low);
  const priorRanges = candles.slice(-15, -5).map(c => c.high - c.low);
  const avgRecentRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
  const avgPriorRange = priorRanges.reduce((a, b) => a + b, 0) / priorRanges.length;
  const rangeRatio = avgPriorRange > 0 ? avgRecentRange / avgPriorRange : 1;
  let liquidityExhaustion = 0;
  if (rangeRatio < 0.3) { liquidityExhaustion = 3; reasons.push(`Liquidity exhaustion: ${(rangeRatio * 100).toFixed(0)}% of average range (dry book)`); }
  else if (rangeRatio < 0.5) { liquidityExhaustion = 2; reasons.push(`Range compression: ${(rangeRatio * 100).toFixed(0)}% of average`); }
  else if (rangeRatio < 0.7) { liquidityExhaustion = 1; }

  // 3. CVD extremity (proxy from OHLCV)
  const cvd = calculateCVD(opens, highs, lows, closes, volumes);
  const cvdRecent = cvd.slice(-20);
  const cvdMean = cvdRecent.reduce((a, b) => a + b, 0) / cvdRecent.length;
  const cvdStd = Math.sqrt(cvdRecent.reduce((s, v) => s + Math.pow(v - cvdMean, 2), 0) / cvdRecent.length) || 1;
  const cvdZ = (cvd[cvd.length - 1] - cvdMean) / cvdStd;
  let cvdExtremity = 0;
  let cvdDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  if (Math.abs(cvdZ) > 2) {
    cvdExtremity = 2;
    cvdDirection = cvdZ > 0 ? 'SHORT' : 'LONG'; // extreme buying exhaustion → reversal short, and vice versa
    reasons.push(`CVD extremity: ${cvdZ.toFixed(2)}σ from mean`);
  } else if (Math.abs(cvdZ) > 1.3) {
    cvdExtremity = 1;
    cvdDirection = cvdZ > 0 ? 'SHORT' : 'LONG';
  }

  // 4. Price consolidation (tight range = coiling before move)
  const last10Closes = closes.slice(-10);
  const closeRange = (Math.max(...last10Closes) - Math.min(...last10Closes)) / last10Closes[last10Closes.length - 1];
  let priceConsolidation = 0;
  if (closeRange < 0.008) { priceConsolidation = 2; reasons.push('Tight consolidation detected'); }
  else if (closeRange < 0.015) { priceConsolidation = 1; }

  // 5. Momentum fade (last 3 candles shrinking bodies in same direction)
  const bodies = candles.slice(-4).map(c => Math.abs(c.close - c.open));
  const fading = bodies[0] > bodies[1] && bodies[1] > bodies[2] && bodies[2] > bodies[3];
  const momentumFade = fading ? 1 : 0;
  if (fading) reasons.push('Momentum fading into exhaustion');

  const score = liquidityExhaustion + volumeCollapse + cvdExtremity + priceConsolidation + momentumFade;

  // Direction: prefer CVD-implied direction; fall back to last candle color reversal bias
  let direction: 'LONG' | 'SHORT' | 'NONE' = cvdDirection;
  if (direction === 'NONE' && score >= 6) {
    const lastCandle = candles[candles.length - 1];
    direction = lastCandle.close > lastCandle.open ? 'SHORT' : 'LONG'; // fade the exhaustion move
  }

  return {
    score,
    fires: score >= 6,
    direction: score >= 6 ? direction : 'NONE',
    components: { liquidityExhaustion, volumeCollapse, cvdExtremity, priceConsolidation, momentumFade },
    reasons,
  };
}
