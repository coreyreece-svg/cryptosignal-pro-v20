/**
 * indicators.ts — Core Technical Indicators
 *
 * Ported from the proven v19 engine. Pure math, no data fetching,
 * no AI calls, no side effects. Every function takes arrays in,
 * returns arrays/values out.
 */

export function sma(data: number[], period: number): number[] {
  const out: number[] = new Array(data.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes: number[], period: number = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = Math.max(0, diff);
    const loss = Math.max(0, -diff);

    if (i === period) {
      let sumGain = 0;
      let sumLoss = 0;
      for (let j = 1; j <= period; j++) {
        sumGain += Math.max(0, closes[j] - closes[j - 1]);
        sumLoss += Math.max(0, -(closes[j] - closes[j - 1]));
      }
      avgGain = sumGain / period;
      avgLoss = sumLoss / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    } else if (i > period) {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function bollingerBands(closes: number[], period: number = 20, multiplier: number = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(closes[i - j] - mid[i], 2);
    }
    const stdDev = Math.sqrt(variance / period);
    upper[i] = mid[i] + multiplier * stdDev;
    lower[i] = mid[i] - multiplier * stdDev;
  }
  return { sma: mid, upper, lower };
}

export function emaArray(data: number[], period: number): number[] {
  const ema = new Array(data.length).fill(NaN);
  if (data.length < period) return ema;

  const k = 2 / (period + 1);
  let initialSum = 0;
  for (let i = 0; i < period; i++) initialSum += data[i];
  ema[period - 1] = initialSum / period;

  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * k + ema[i - 1];
  }
  return ema;
}

export function atrArray(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const tr = new Array(highs.length).fill(NaN);
  if (highs.length < period) return tr;

  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  const out = new Array(highs.length).fill(NaN);
  let initialSum = 0;
  for (let i = 0; i < period; i++) initialSum += tr[i];
  out[period - 1] = initialSum / period;

  for (let i = period; i < highs.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

export function atr(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  const arr = atrArray(highs, lows, closes, period);
  return arr[arr.length - 1];
}

export function macd(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = emaArray(closes, fastPeriod);
  const slowEma = emaArray(closes, slowPeriod);

  const macdLine = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEma[i]) && !isNaN(slowEma[i])) {
      macdLine[i] = fastEma[i] - slowEma[i];
    }
  }

  const macdValid = macdLine.filter(v => !isNaN(v));
  const signalEma = emaArray(macdValid, signalPeriod);

  const signalLine = new Array(closes.length).fill(NaN);
  const offset = closes.length - signalEma.length;
  for (let i = 0; i < signalEma.length; i++) signalLine[offset + i] = signalEma[i];

  const histogram = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macdLine, signalLine, histogram };
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const n = highs.length;
  const adx = new Array(n).fill(NaN);
  if (n < period * 2) return adx;

  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  const smoothTR = new Array(n).fill(NaN);
  const smoothPlusDM = new Array(n).fill(NaN);
  const smoothMinusDM = new Array(n).fill(NaN);

  let trSum = 0, plusSum = 0, minusSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += tr[i];
    plusSum += plusDM[i];
    minusSum += minusDM[i];
  }
  smoothTR[period] = trSum;
  smoothPlusDM[period] = plusSum;
  smoothMinusDM[period] = minusSum;

  for (let i = period + 1; i < n; i++) {
    smoothTR[i] = smoothTR[i - 1] - smoothTR[i - 1] / period + tr[i];
    smoothPlusDM[i] = smoothPlusDM[i - 1] - smoothPlusDM[i - 1] / period + plusDM[i];
    smoothMinusDM[i] = smoothMinusDM[i - 1] - smoothMinusDM[i - 1] / period + minusDM[i];
  }

  const dx = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI + minusDI;
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
  }

  let adxSum = 0;
  let count = 0;
  for (let i = period; i < period * 2 && i < n; i++) {
    if (!isNaN(dx[i])) { adxSum += dx[i]; count++; }
  }
  if (count > 0) adx[period * 2 - 1] = adxSum / count;

  for (let i = period * 2; i < n; i++) {
    if (!isNaN(adx[i - 1]) && !isNaN(dx[i])) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }

  return adx;
}

/** Cumulative Volume Delta approximation from OHLCV (no tick data needed) */
export function calculateCVD(opens: number[], highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
  const cvd = new Array(closes.length).fill(0);
  let running = 0;
  for (let i = 0; i < closes.length; i++) {
    const range = highs[i] - lows[i];
    const buyPressure = range > 0 ? (closes[i] - lows[i]) / range : 0.5;
    const delta = volumes[i] * (buyPressure * 2 - 1); // -1..1 scaled by volume
    running += delta;
    cvd[i] = running;
  }
  return cvd;
}
