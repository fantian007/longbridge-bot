/**
 * 技术指标引擎 —— 20+ 指标实时计算
 *
 * 输入：K 线数组 (close/high/low/open/volume)
 * 输出：所有指标值 Map
 */

export interface OHLCV { close: number; high: number; low: number; open: number; volume: number; }

// ---- 工具函数 ----
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => a.length ? sum(a) / a.length : 0;
const std = (a: number[]) => {
  const m = avg(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

// ---- 1-5: 移动平均线 ----
export function sma(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) out[i] = avg(closes.slice(i - period + 1, i + 1));
  return out;
}
export function ema(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  out[period - 1] = avg(closes.slice(0, period));
  for (let i = period; i < closes.length; i++) out[i] = closes[i] * k + out[i - 1]! * (1 - k);
  return out;
}

// ---- 6-8: MACD ----
export function macd(closes: number[]): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
  const macdLine: (number | null)[] = new Array(closes.length).fill(null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const hist: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 25; i < closes.length; i++) {
    if (ema12[i] == null || ema26[i] == null) continue;
    macdLine[i] = ema12[i]! - ema26[i]!;
  }
  // Signal: 9-period EMA of MACD
  const macdVals = macdLine.filter(v => v != null) as number[];
  const signalEma = ema(macdVals, 9);
  let si = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] == null) continue;
    signalLine[i] = signalEma[si++];
  }
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) hist[i] = macdLine[i]! - signalLine[i]!;
  }
  return { macd: macdLine, signal: signalLine, histogram: hist };
}

// ---- 9: RSI ----
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ---- 10: Bollinger Bands ----
export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const s = std(closes.slice(i - period + 1, i + 1));
    upper[i] = mid[i]! + mult * s;
    lower[i] = mid[i]! - mult * s;
  }
  return { upper, middle: mid, lower };
}

// ---- 11: ATR ----
export function atr(klines: OHLCV[], period = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    tr.push(Math.max(klines[i].high - klines[i].low, Math.abs(klines[i].high - klines[i - 1].close), Math.abs(klines[i].low - klines[i - 1].close)));
  }
  const out: (number | null)[] = new Array(klines.length).fill(null);
  let atrVal = avg(tr.slice(0, period));
  out[period] = atrVal;
  for (let i = period + 1; i < klines.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i - 1]) / period;
    out[i] = atrVal;
  }
  return out;
}

// ---- 12: OBV ----
export function obv(klines: OHLCV[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < klines.length; i++) {
    const prev = out[i - 1];
    if (klines[i].close > klines[i - 1].close) out.push(prev + klines[i].volume);
    else if (klines[i].close < klines[i - 1].close) out.push(prev - klines[i].volume);
    else out.push(prev);
  }
  return out;
}

// ---- 13-14: Stochastic ----
export function stochastic(klines: OHLCV[], kPeriod = 14, dPeriod = 3) {
  const kVals: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = kPeriod - 1; i < klines.length; i++) {
    const slice = klines.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...slice.map(k => k.high));
    const ll = Math.min(...slice.map(k => k.low));
    kVals[i] = hh === ll ? 50 : ((klines[i].close - ll) / (hh - ll)) * 100;
  }
  const dVals: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = kPeriod + dPeriod - 2; i < klines.length; i++) {
    const ks = kVals.slice(i - dPeriod + 1, i + 1).filter(v => v != null) as number[];
    if (ks.length === dPeriod) dVals[i] = avg(ks);
  }
  return { k: kVals, d: dVals };
}

// ---- 15: Williams %R ----
export function williamsR(klines: OHLCV[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = period - 1; i < klines.length; i++) {
    const slice = klines.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice.map(k => k.high));
    const ll = Math.min(...slice.map(k => k.low));
    out[i] = hh === ll ? 0 : ((hh - klines[i].close) / (hh - ll)) * -100;
  }
  return out;
}

// ---- 16: CCI ----
export function cci(klines: OHLCV[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = period - 1; i < klines.length; i++) {
    const slice = klines.slice(i - period + 1, i + 1);
    const tps = slice.map(k => (k.high + k.low + k.close) / 3);
    const m = avg(tps);
    const md = avg(tps.map(tp => Math.abs(tp - m)));
    out[i] = md === 0 ? 0 : ((tps[tps.length - 1] - m) / (0.015 * md));
  }
  return out;
}

// ---- 17: ADX ----
export function adx(klines: OHLCV[], period = 14): { adx: (number | null)[]; pdi: (number | null)[]; ndi: (number | null)[] } {
  const trVals: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    trVals.push(Math.max(klines[i].high - klines[i].low, Math.abs(klines[i].high - klines[i - 1].close), Math.abs(klines[i].low - klines[i - 1].close)));
    const up = klines[i].high - klines[i - 1].high;
    const down = klines[i - 1].low - klines[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const n = klines.length;
  const adxOut: (number | null)[] = new Array(n).fill(null);
  const pdiOut: (number | null)[] = new Array(n).fill(null);
  const ndiOut: (number | null)[] = new Array(n).fill(null);
  let atrV = avg(trVals.slice(0, period)), pdiV = avg(plusDM.slice(0, period)), ndiV = avg(minusDM.slice(0, period));
  for (let i = period; i < n - 1; i++) {
    atrV = (atrV * (period - 1) + trVals[i]) / period;
    pdiV = (pdiV * (period - 1) + plusDM[i]) / period;
    ndiV = (ndiV * (period - 1) + minusDM[i]) / period;
    const pdi = atrV === 0 ? 0 : (pdiV / atrV) * 100;
    const ndi = atrV === 0 ? 0 : (ndiV / atrV) * 100;
    pdiOut[i + 1] = pdi; ndiOut[i + 1] = ndi;
    const dx = pdi + ndi === 0 ? 0 : (Math.abs(pdi - ndi) / (pdi + ndi)) * 100;
    adxOut[i + 1] = dx;
  }
  // Smooth ADX
  for (let i = period * 2 - 1; i < n; i++) {
    const slice = adxOut.slice(i - period + 1, i + 1).filter(v => v != null) as number[];
    if (slice.length) adxOut[i] = avg(slice);
  }
  return { adx: adxOut, pdi: pdiOut, ndi: ndiOut };
}

// ---- 18: MFI ----
export function mfi(klines: OHLCV[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = period; i < klines.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (klines[j].high + klines[j].low + klines[j].close) / 3;
      const prevTp = (klines[j - 1].high + klines[j - 1].low + klines[j - 1].close) / 3;
      const mf = tp * klines[j].volume;
      if (tp >= prevTp) posFlow += mf; else negFlow += mf;
    }
    out[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  }
  return out;
}

// ---- 19: VWAP ----
export function vwap(klines: OHLCV[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumVol = 0, cumPV = 0;
  for (const k of klines) {
    const tp = (k.high + k.low + k.close) / 3;
    cumVol += k.volume; cumPV += tp * k.volume;
    out.push(cumVol === 0 ? null : cumPV / cumVol);
  }
  return out;
}

// ---- 20: ROC ----
export function roc(closes: number[], period = 10): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    out[i] = ((closes[i] - closes[i - period]) / closes[i - period]) * 100;
  }
  return out;
}

// ---- 21: 量价关系 ----
export function volumeRatio(klines: OHLCV[], period = 5): (number | null)[] {
  const out: (number | null)[] = new Array(klines.length).fill(null);
  for (let i = period; i < klines.length; i++) {
    const slice = klines.slice(i - period + 1, i + 1);
    const avgVol = avg(slice.map(k => k.volume));
    out[i] = avgVol === 0 ? 1 : klines[i].volume / avgVol;
  }
  return out;
}

// ---- 22: Beta (相对 SPY) ----
export function beta(stockReturns: number[], marketReturns: number[]): number | null {
  if (stockReturns.length < 2) return null;
  const mAvg = avg(marketReturns), sAvg = avg(stockReturns);
  let cov = 0, mVar = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    cov += (stockReturns[i] - sAvg) * (marketReturns[i] - mAvg);
    mVar += (marketReturns[i] - mAvg) ** 2;
  }
  return mVar === 0 ? null : cov / mVar;
}

// ---- 综合指标输出 ----
export interface IndicatorReport {
  symbol: string;
  price: number;
  sma20: number | null; sma60: number | null; ema12: number | null; ema26: number | null;
  macd: number | null; macdSignal: number | null; macdHist: number | null;
  rsi14: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null; bbWidth: number | null;
  atr14: number | null; atrPct: number | null;
  stochK: number | null; stochD: number | null;
  williamsR: number | null; cci20: number | null;
  adx: number | null; pdi: number | null; ndi: number | null;
  mfi14: number | null; vwap: number | null;
  roc10: number | null; volRatio: number | null;
  trend: "up" | "down" | "sideways";
  strength: "strong" | "moderate" | "weak";
}

export function analyze(klines: OHLCV[]): IndicatorReport {
  if (klines.length < 60) throw new Error(`Need >=60 candles, got ${klines.length}`);
  const closes = klines.map(k => k.close);
  const last = closes.length - 1;
  const price = closes[last];

  const s20 = sma(closes, 20); const s60 = sma(closes, 60);
  const e12 = ema(closes, 12); const e26 = ema(closes, 26);
  const m = macd(closes);
  const r = rsi(closes);
  const bb = bollinger(closes);
  const a = atr(klines);
  const st = stochastic(klines);
  const wr = williamsR(klines);
  const c = cci(klines);
  const ax = adx(klines);
  const mf = mfi(klines);
  const vw = vwap(klines);
  const rc = roc(closes);
  const vr = volumeRatio(klines);

  const trend = price > (s20[last] ?? 0) && (s20[last] ?? 0) > (s60[last] ?? 0) ? "up"
    : price < (s20[last] ?? Infinity) && (s20[last] ?? Infinity) < (s60[last] ?? Infinity) ? "down" : "sideways";
  const strength = (ax.adx[last] ?? 0) > 25 ? "strong" : (ax.adx[last] ?? 0) > 15 ? "moderate" : "weak";

  return {
    symbol: "", price,
    sma20: s20[last], sma60: s60[last], ema12: e12[last], ema26: e26[last],
    macd: m.macd[last], macdSignal: m.signal[last], macdHist: m.histogram[last],
    rsi14: r[last],
    bbUpper: bb.upper[last], bbMiddle: bb.middle[last], bbLower: bb.lower[last],
    bbWidth: bb.upper[last] != null && bb.lower[last] != null ? ((bb.upper[last]! - bb.lower[last]!) / bb.middle[last]!) * 100 : null,
    atr14: a[last], atrPct: a[last] != null ? (a[last]! / price) * 100 : null,
    stochK: st.k[last], stochD: st.d[last],
    williamsR: wr[last], cci20: c[last],
    adx: ax.adx[last], pdi: ax.pdi[last], ndi: ax.ndi[last],
    mfi14: mf[last], vwap: vw[last],
    roc10: rc[last], volRatio: vr[last],
    trend, strength,
  };
}
