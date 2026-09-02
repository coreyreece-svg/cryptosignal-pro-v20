/**
 * binance.ts — Real Market Data Only
 *
 * Single source of truth for price data. No TradFi, no simulated
 * candles, no fallback to fake numbers. If the API fails, callers
 * get null/empty and must handle it — we never invent a price.
 */

const BASE_URL = 'https://fapi.binance.com'; // Binance USDT-M Futures

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Fetch candles for a symbol. Returns null on any failure —
 * never returns synthetic data.
 */
export async function fetchCandles(
  symbol: string,
  interval: string = '1h',
  limit: number = 500
): Promise<Candle[] | null> {
  try {
    const url = `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[binance] ${symbol} ${interval} fetch failed: ${res.status}`);
      return null;
    }
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    return raw.map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  } catch (err) {
    console.error(`[binance] Error fetching ${symbol}:`, err);
    return null;
  }
}

/**
 * Get current mark price for a symbol.
 */
export async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseFloat(data.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Get top N symbols by 24h quote volume (USDT pairs only).
 * This is REAL exchange data — no hardcoded lists.
 */
export async function fetchTopSymbolsByVolume(limit: number = 50): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((t: any) => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
      .filter((t: any) => !t.symbol.includes('_')) // exclude quarterly/delivery contracts
      .map((t: any) => ({ symbol: t.symbol, volume: parseFloat(t.quoteVolume) || 0 }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit)
      .map(t => t.symbol);
  } catch (err) {
    console.error('[binance] Error fetching top symbols:', err);
    return [];
  }
}

/**
 * Validate that candle data is fresh and usable.
 * Rejects stale, halted, or malformed data instead of silently scoring it.
 */
export function validateCandles(candles: Candle[] | null, tf: string): { valid: boolean; reason?: string } {
  if (!candles || candles.length < 100) {
    return { valid: false, reason: 'insufficient_history' };
  }

  const closes = candles.slice(-10).map(c => c.close);
  const uniqueCloses = new Set(closes);
  if (uniqueCloses.size === 1) {
    return { valid: false, reason: 'halted_or_stale' };
  }

  const last = candles[candles.length - 1];
  const now = Date.now();
  const tfMs = timeframeToMs(tf);
  const maxStaleMs = tfMs * 3; // allow up to 3 candle-periods of lag
  if (now - last.closeTime > maxStaleMs) {
    return { valid: false, reason: 'stale_data' };
  }

  return { valid: true };
}

export function timeframeToMs(tf: string): number {
  const map: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return map[tf] || 60 * 60 * 1000;
}
