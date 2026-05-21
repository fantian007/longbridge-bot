#!/usr/bin/env node
/**
 * 长桥超短线分时趋势交易系统
 * 策略：5 分钟 K 线趋势跟随，快进快出，只赚趋势的钱
 * 用法: node scalper.mjs           # 仅监控
 *       node scalper.mjs --trade    # 自动交易
 */
import { execSync } from "child_process";

const LB = "/usr/local/bin/longbridge";
const AUTO_TRADE = process.argv.includes("--trade");
const ENV = { HOME: "/home/zys", PATH: process.env.PATH };

function cli(cmd) {
  try { return JSON.parse(execSync(`${LB} ${cmd} --format json`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" })); }
  catch { return null; }
}

// ============================================================
// 超短线趋势策略
// ============================================================
const SCALP_CONFIG = {
  period: "5m",          // 5 分钟 K 线
  lookback: 60,           // 看 60 根 (5 小时)
  trendMaFast: 5,         // 快线
  trendMaSlow: 20,        // 慢线
  rsiPeriod: 7,           // 超短 RSI
  macdFast: 5, macdSlow: 13, macdSig: 6,  // 快速 MACD
  atrPeriod: 7,           // 超短 ATR
  profitTarget: 0.015,    // 止盈 1.5%
  stopLoss: 0.008,        // 止损 0.8%
  maxHoldBars: 12,        // 最多持有 12 根 K 线 (1 小时)
  minVolRatio: 1.5,       // 放量倍数
  entryScore: 3,          // 入场最低分
};

// ---- 超短线信号 ----
function scalpSignal(klines, holding, sentiment) {
  const n = klines.length, last = n - 1;
  if (n < SCALP_CONFIG.lookback) return null;

  const c = klines.map(k => parseFloat(k.close));
  const h = klines.map(k => parseFloat(k.high));
  const l = klines.map(k => parseFloat(k.low));
  const v = klines.map(k => parseFloat(k.volume));
  const price = c[last];

  // 快慢均线
  const ma5 = sma(c, SCALP_CONFIG.trendMaFast);
  const ma20 = sma(c, SCALP_CONFIG.trendMaSlow);
  const trend = ma5[last] > ma20[last] ? 1 : -1;  // 1=上升, -1=下降
  const trendStrength = (ma5[last] - ma20[last]) / ma20[last];  // 趋势强度%

  // 最近 3 根 K 线动量
  const mom3 = (c[last] - c[last-3]) / c[last-3];
  const mom1 = (c[last] - c[last-1]) / c[last-1];

  // MACD 超短
  const ema5 = ema(c, 5), ema13 = ema(c, 13);
  const macdLine = ema5[last] - ema13[last];
  const prevMacd = (ema5[last-1] - ema13[last-1]);
  const macdTurning = macdLine > prevMacd;  // MACD 是否在拐头向上

  // RSI 超短
  const r = rsi(c, 7);
  const rsiVal = r[last];

  // ATR 波动率
  const atrVal = atr(klines, 7)[last];
  const atrPct = atrVal / price;

  // 量能确认
  const avgVol5 = v.slice(last-5, last).reduce((a,b)=>a+b)/5;
  const volRatio = v[last] / avgVol5;

  // 分时强度: 收盘 vs 最高/最低
  const barStrength = (c[last] - l[last]) / (h[last] - l[last] || 1);  // 0~1

  // ---- 综合评分 ----
  let score = 0; const reasons = [];

  // 趋势 (权重 2)
  if (trend > 0 && trendStrength > 0.001) { score += 2; reasons.push("均线多头"); }
  else if (trend < 0 && trendStrength < -0.001) { score -= 2; reasons.push("均线空头"); }

  // 动量 (权重 2)
  if (mom3 > 0.005 && mom1 > 0) { score += 2; reasons.push("强势拉升"); }
  else if (mom3 < -0.005 && mom1 < 0) { score -= 2; reasons.push("加速下跌"); }

  // MACD 拐头
  if (macdTurning && macdLine > 0) { score += 1; reasons.push("MACD多头加速"); }
  if (!macdTurning && macdLine < 0) { score -= 1; reasons.push("MACD空头加速"); }

  // RSI
  if (rsiVal > 30 && rsiVal < 70) { score += rsiVal > 50 ? 0.5 : -0.5; } // 中间地带看方向
  if (rsiVal < 25) { score += 1; reasons.push("RSI超卖反弹"); }
  if (rsiVal > 75) { score -= 1; reasons.push("RSI超买回调"); }

  // 量能确认
  if (volRatio > SCALP_CONFIG.minVolRatio && trend > 0) { score += 1; reasons.push("放量突破"); }
  if (volRatio > SCALP_CONFIG.minVolRatio && trend < 0) { score -= 1; reasons.push("放量下跌"); }

  // 分时强度
  if (barStrength > 0.7 && trend > 0) score += 0.5;
  if (barStrength < 0.3 && trend < 0) score -= 0.5;

  // 市场情绪修正
  score += sentiment * 0.5;

  // 决策
  const action = holding
    ? (score <= -1 ? "SELL" : "HOLD")
    : (score >= SCALP_CONFIG.entryScore ? "BUY" : "HOLD");

  let qty, sl, tp;
  if (action === "BUY" && atrVal) {
    const riskAmt = 1000; // 单笔风险 $1000
    sl = +(price - atrVal * 1.5).toFixed(2);
    tp = +(price * (1 + SCALP_CONFIG.profitTarget)).toFixed(2);
    qty = Math.floor(riskAmt / (price - sl));
  }
  if (action === "SELL" && holding) { qty = holding.qty; }

  return { symbol: "", action, score: +score.toFixed(1), reasons, price, qty, sl, tp, trend, rsi: rsiVal, macd: macdLine.toFixed(3), volRatio: volRatio.toFixed(1), atrPct: (atrPct*100).toFixed(2) };
}

// ---- 工具 (复用) ----
function sma(a,n){return a.map((_,i)=>i<n-1?null:a.slice(i-n+1,i+1).reduce((s,v)=>s+v)/n);}
function ema(a,n){const k=2/(n+1),o=[];let e=a.slice(0,n).reduce((s,v)=>s+v)/n;for(let i=0;i<a.length;i++){if(i<n-1)o.push(null);else if(i===n-1)o.push(e);else{e=a[i]*k+e*(1-k);o.push(e);}}return o;}
function rsi(c,p=14){const o=[];let ag=0,al=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];if(d>0)ag+=d;else al-=d;}ag/=p;al/=p;o[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;o[i]=al===0?100:100-100/(1+ag/al);}return o;}
function atr(k,p=14){const t=[];for(let i=1;i<k.length;i++){t.push(Math.max(k[i].high-k[i].low,Math.abs(k[i].high-k[i-1].close),Math.abs(k[i].low-k[i-1].close)));}const o=Array(k.length).fill(null);let a=t.slice(0,p).reduce((s,v)=>s+v)/p;o[p]=a;for(let i=p+1;i<k.length;i++){a=(a*(p-1)+t[i-1])/p;o[i]=a;}return o;}

// ---- 智能撤单重挂 ----
function checkAndFixOrders(holdings) {
  const orders = cli("order");
  if (!Array.isArray(orders)) return;

  const pending = orders.filter(o => o.status === "New" || o.status === "Queued");
  for (const o of pending) {
    const symbol = o.symbol, orderId = o.order_id, orderPrice = parseFloat(o.price);
    // 获取最新行情
    const q = cli(`quote ${symbol}`);
    if (!Array.isArray(q) || !q.length) continue;
    const lastPrice = parseFloat(q[0].last);
    const deviation = Math.abs(lastPrice - orderPrice) / orderPrice;

    // 价格偏离 > 0.5% 或挂单超过 10 分钟，撤单重挂
    const createdAt = new Date(o.created_at).getTime();
    const ageMin = (Date.now() - createdAt) / 60000;

    if (deviation > 0.005 || ageMin > 10) {
      // 撤单
      try {
        execSync(`echo "y" | ${LB} order cancel ${orderId}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
        console.log(`  🔄 撤单 ${symbol} #${orderId.slice(-8)} 原价$${orderPrice.toFixed(2)} 现价$${lastPrice.toFixed(2)} 偏离${(deviation*100).toFixed(1)}%`);
      } catch(e) { console.log(`  ❌ 撤单失败 ${symbol}: ${e.message}`); continue; }

      // 重挂新价格
      const newPrice = (lastPrice * (o.side === "Buy" ? 1.001 : 0.999)).toFixed(2);
      const side = o.side === "Buy" ? "buy" : "sell";
      const qty = parseInt(o.quantity);
      try {
        execSync(`echo "y" | ${LB} order ${side} ${symbol} ${qty} --price ${newPrice}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
        console.log(`  ✅ 重挂 ${side} ${symbol} ${qty}股 @ $${newPrice}`);
      } catch(e) { console.log(`  ❌ 重挂失败 ${symbol}: ${e.message}`); }
    }
  }
}

// ============================================================
// 主程序
// ============================================================
const SCALP_WATCH = ["NVDA.US", "TSLA.US", "AAPL.US", "MSFT.US", "META.US", "AMZN.US", "GOOGL.US"];
const MAX_POSITIONS = 3;      // 最多同时持 3 只
const MAX_HOLD_BARS = 12;     // 最多持 1 小时

async function main() {
  const now = new Date();
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  // 美股交易时间: 14:30-21:00 UTC (9:30-16:00 EST)
  const inMarketHours = (h > 14 || (h === 14 && m >= 30)) && h < 21;

  console.log(`\n⚡ 超短线趋势交易 ${now.toISOString().slice(0,19).replace("T"," ")} ${inMarketHours?"🟢盘中":"🔴盘后"}\n`);

  // 获取行情 + 持仓
  const pf = cli("portfolio");
  const pos = cli("positions");
  const asset = parseFloat(pf?.overview?.total_asset ?? 0);
  const holdings = Array.isArray(pos) ? pos.map(p => ({
    symbol: p.symbol, qty: parseInt(p.quantity), costPrice: parseFloat(p.cost_price),
  })) : [];

  // 市场情绪
  let sentiment = 0;
  try {
    const qs = cli("quote SPY.US QQQ.US");
    if (Array.isArray(qs)) for (const q of qs) {
      const chg = parseFloat(q.change_rate ?? 0);
      if (q.symbol === "SPY.US") sentiment += chg > 0 ? 0.5 : chg < 0 ? -0.5 : 0;
    }
  } catch {}

  // 扫描全部标的
  const opportunities = [];
  for (const sym of SCALP_WATCH) {
    try {
      const kl = cli(`kline ${sym} --period 5m --count ${SCALP_CONFIG.lookback}`);
      if (!Array.isArray(kl) || kl.length < 30) continue;
      const holding = holdings.find(h => h.symbol === sym);
      const sig = scalpSignal(kl, holding, sentiment);
      if (!sig) continue;
      sig.symbol = sym;
      opportunities.push(sig);
    } catch {}
  }

  // 按分数排序
  opportunities.sort((a,b) => b.score - a.score);

  // 展示
  console.log(`${"代码".padEnd(10)} ${"价格".padStart(8)} ${"方向".padStart(4)} ${"分数".padStart(5)} ${"RSI".padStart(4)} ${"MACD".padStart(7)} ${"量比".padStart(5)} ${"ATR%".padStart(6)} ${"信号".padStart(10)}`);
  for (const s of opportunities) {
    const dir = s.trend > 0 ? "📈" : "📉";
    const act = s.action === "BUY" ? "🟢买入" : s.action === "SELL" ? "🔴卖出" : "➖";
    console.log(`${s.symbol.padEnd(10)} ${String(s.price.toFixed(2)).padStart(8)} ${dir.padStart(4)} ${String(s.score).padStart(5)} ${String(s.rsi?.toFixed(0)??"-").padStart(4)} ${String(s.macd).padStart(7)} ${String(s.volRatio).padStart(5)} ${String(s.atrPct).padStart(6)} ${act.padStart(10)}`);
  }

  // ---- 自动交易 ----
  if (!AUTO_TRADE || !inMarketHours) {
    if (!inMarketHours) console.log("\n⏸ 盘后模式：监控不交易");
    if (!AUTO_TRADE) console.log("💡 加 --trade 开启自动交易");
    return;
  }

  // 先处理不合理挂单
  if (AUTO_TRADE && inMarketHours) checkAndFixOrders(holdings);

  console.log("\n── 交易执行 ──");
  const execList = opportunities.filter(s => s.action !== "HOLD");
  let executed = 0;

  // 先卖后买
  for (const s of execList) {
    if (s.action !== "SELL") continue;
    const h = holdings.find(x => x.symbol === s.symbol);
    if (!h) continue;
    try {
      execSync(`echo "y" | ${LB} order sell ${s.symbol} ${h.qty} --price ${(s.price*0.998).toFixed(2)}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
      console.log(`  ✅ 卖出 ${s.symbol} ${h.qty}股`);
      executed++;
    } catch(e) { console.log(`  ❌ 卖出 ${s.symbol} 失败: ${e.message}`); }
  }

  // 再买（控制持仓数）
  for (const s of execList) {
    if (s.action !== "BUY" || executed >= MAX_POSITIONS) continue;
    if (holdings.length - execList.filter(x=>x.action==="SELL").length + executed >= MAX_POSITIONS) {
      console.log(`  ⏭ ${s.symbol} 已达持仓上限`);
      continue;
    }
    if (!s.qty || s.qty < 1) continue;
    try {
      execSync(`echo "y" | ${LB} order buy ${s.symbol} ${s.qty} --price ${s.price.toFixed(2)}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
      console.log(`  ✅ 买入 ${s.symbol} ${s.qty}股 @ $${s.price.toFixed(2)} 止盈$${s.tp} 止损$${s.sl}`);
      executed++;
    } catch(e) { console.log(`  ❌ 买入 ${s.symbol} 失败: ${e.message}`); }
  }

  if (executed === 0) console.log("  无信号");
  console.log(`\n持仓: ${holdings.length}只 | 候选: ${execList.length}个 | 已执行: ${executed}笔`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
