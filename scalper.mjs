#!/usr/bin/env node
/**
 * 超短线趋势交易 —— 顺势而为，涨跌都赚
 * 策略：追涨杀跌，快进快出，T+0 高频轮动
 * 用法: node scalper.mjs --trade
 */
import { execSync } from "child_process";

const LB = "/usr/local/bin/longbridge";
const TRADE = process.argv.includes("--trade");
const ENV = { HOME: "/home/zys", PATH: process.env.PATH };

function cli(cmd) {
  try { return JSON.parse(execSync(`${LB} ${cmd} --format json`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" })); }
  catch { return null; }
}
function order(side, sym, qty, price) {
  try {
    return execSync(`echo "y" | ${LB} order ${side} ${sym} ${qty} --price ${price}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
  } catch(e) { return ""; }
}

const WATCH = ["NVDA.US", "TSLA.US", "AAPL.US", "MSFT.US", "META.US", "AMZN.US", "GOOGL.US"];

// ---- 技术指标 (超短线参数) ----
function sma(a,n){return a.map((_,i)=>i<n-1?null:a.slice(i-n+1,i+1).reduce((s,v)=>s+v)/n);}
function ema(a,n){const k=2/(n+1),o=[];let e=a.slice(0,n).reduce((s,v)=>s+v)/n;for(let i=0;i<a.length;i++){if(i<n-1)o.push(null);else if(i===n-1)o.push(e);else{e=a[i]*k+e*(1-k);o.push(e);}}return o;}

function analyze(klines) {
  const n = klines.length, i = n - 1;
  if (n < 30) return null;
  const c = klines.map(k => parseFloat(k.close));
  const h = klines.map(k => parseFloat(k.high));
  const l = klines.map(k => parseFloat(k.low));
  const v = klines.map(k => parseFloat(k.volume));
  const price = c[i];

  // 均线趋势
  const ma5 = sma(c, 5), ma10 = sma(c, 10), ma20 = sma(c, 20);
  const trend5 = ma5[i] > ma10[i] ? 1 : -1;
  const trend20 = ma10[i] > ma20[i] ? 1 : -1;

  // 动量
  const mom3 = (c[i] - c[i-3]) / c[i-3];    // 3 根 K 线涨跌幅
  const mom1 = (c[i] - c[i-1]) / c[i-1];    // 最近 1 根

  // MACD
  const e5 = ema(c, 5), e13 = ema(c, 13);
  const macd = e5[i] - e13[i];
  const prevMacd = e5[i-1] - e13[i-1];
  const macdUp = macd > prevMacd;

  // RSI
  let ag=0,al=0; for(let j=i-6;j<=i;j++){const d=c[j]-c[j-1];if(d>0)ag+=d;else al-=d;}
  const rsi = al===0?100:100-100/(1+(ag/7)/(al/7));

  // ATR
  const tr=[]; for(let j=i-6;j<=i;j++) tr.push(Math.max(h[j]-l[j],Math.abs(h[j]-c[j-1]),Math.abs(l[j]-c[j-1])));
  const atr = tr.reduce((s,x)=>s+x)/7;

  // 量能
  const avgVol5 = v.slice(i-5, i).reduce((s,x)=>s+x)/5;
  const volRatio = v[i] / (avgVol5 || 1);

  // ---- 综合评分 (-10 ~ +10) ----
  let score = 0; const reasons = [];

  // 趋势 (最重)
  if (trend5 > 0 && trend20 > 0) { score += 3; reasons.push("多头排列"); }
  else if (trend5 < 0 && trend20 < 0) { score -= 3; reasons.push("空头排列"); }
  else if (trend5 > 0) { score += 1; reasons.push("短线偏多"); }
  else { score -= 1; reasons.push("短线偏空"); }

  // 动量
  if (mom3 > 0.003) { score += 2; reasons.push("加速上涨"); }
  else if (mom3 < -0.003) { score -= 2; reasons.push("加速下跌"); }
  if (mom1 > 0.001) score += 0.5; else score -= 0.5;

  // MACD
  if (macdUp && macd > 0) { score += 2; reasons.push("MACD金叉"); }
  else if (!macdUp && macd < 0) { score -= 2; reasons.push("MACD死叉"); }

  // RSI
  if (rsi < 30) { score += 1.5; reasons.push("超卖反弹"); }
  if (rsi > 70) { score -= 1.5; reasons.push("超买回调"); }

  // 量能
  if (volRatio > 1.5 && trend5 > 0) { score += 1; reasons.push("放量突破"); }
  if (volRatio > 1.5 && trend5 < 0) { score -= 1; reasons.push("放量破位"); }

  // 决策：降低门槛，积极轮动
  const action = score >= 2 ? "LONG" : score <= -2 ? "SHORT" : "HOLD";

  const stopDist = atr * 1.5;
  return { symbol: "", price, score: +score.toFixed(1), action, reasons, rsi: +rsi.toFixed(0), macd: +macd.toFixed(3), volRatio: +volRatio.toFixed(1), mom3: +(mom3*100).toFixed(2), atr: +atr.toFixed(2), trend5, trend20, stopDist };
}

// ---- 智能撤单 ----
function fixOrders() {
  const orders = cli("order");
  if (!Array.isArray(orders)) return;
  for (const o of orders.filter(o => o.status === "New" || o.status === "Queued")) {
    const q = cli(`quote ${o.symbol}`);
    if (!Array.isArray(q)?.length) continue;
    const last = parseFloat(q[0].last), oPx = parseFloat(o.price);
    const dev = Math.abs(last - oPx) / oPx;
    const age = (Date.now() - new Date(o.created_at).getTime()) / 60000;
    if (dev > 0.003 || age > 8) {
      execSync(`echo "y" | ${LB} order cancel ${o.order_id}`, { encoding:"utf8", timeout:10000, env:ENV, cwd:"/tmp" });
      const newPx = (last * (o.side === "Buy" ? 1.0005 : 0.9995)).toFixed(2);
      order(o.side === "Buy" ? "buy" : "sell", o.symbol, o.quantity, newPx);
      console.log(`  🔄 ${o.symbol} 撤单重挂 $${oPx}→$${newPx}`);
    }
  }
}

// ============================================================
function main() {
  const now = new Date();
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  const inMarket = (h > 14 || (h === 14 && m >= 30)) && h < 21;
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;

  console.log(`\n⚡ 超短线趋势  ${now.toISOString().slice(0,19)}  ${inMarket&&isWeekday?"🟢盘中":"🔴休市"}\n`);

  const pf = cli("portfolio"), pos = cli("positions");
  const asset = parseFloat(pf?.overview?.total_asset ?? 0);
  const todayPl = parseFloat(pf?.overview?.total_today_pl ?? 0);
  const holdings = Array.isArray(pos) ? pos.map(p => ({ symbol: p.symbol, qty: parseInt(p.quantity), cost: parseFloat(p.cost_price) })) : [];
  const holdingMap = Object.fromEntries(holdings.map(h => [h.symbol, h]));

  let sentiment = 0;
  try { const qs = cli("quote SPY.US QQQ.US"); if (qs) for (const q of qs) { const chg = parseFloat(q.change_rate??0); if (q.symbol==="SPY.US") sentiment += chg>0?0.5:-0.5; if (q.symbol==="QQQ.US") sentiment += chg>0?0.3:-0.3; } } catch {}

  // 分析
  const opps = [];
  for (const sym of WATCH) {
    try {
      const kl = cli(`kline ${sym} --period 5m --count 60`);
      if (!Array.isArray(kl) || kl.length < 30) continue;
      const sig = analyze(kl);
      if (!sig) continue;
      sig.symbol = sym;
      sig.holding = holdingMap[sym];
      sig.score = +sig.score + sentiment;
      opps.push(sig);
    } catch {}
  }
  opps.sort((a,b) => b.score - a.score);

  // 展示
  console.log(`资产: $${asset.toFixed(0)}  日内: ${todayPl>=0?"+":""}$${todayPl.toFixed(0)}  持仓: ${holdings.length}只  情绪: ${sentiment>0?"🟢":sentiment<0?"🔴":"⚪"}\n`);
  console.log(`${"代码".padEnd(10)} ${"价格".padStart(8)} ${"分数".padStart(5)} ${"RSI".padStart(4)} ${"MACD".padStart(8)} ${"动量%".padStart(6)} ${"量比".padStart(5)} ${"ATR".padStart(6)}  信号`);
  for (const s of opps) {
    const act = s.action === "LONG" ? "🟢做多" : s.action === "SHORT" ? "🔴清仓" : "➖ 持有";
    console.log(`${s.symbol.padEnd(10)} ${String(s.price.toFixed(2)).padStart(8)} ${String(s.score).padStart(5)} ${String(s.rsi).padStart(4)} ${String(s.macd).padStart(8)} ${String(s.mom3).padStart(6)} ${String(s.volRatio).padStart(5)} ${String(s.atr).padStart(6)}  ${act}${s.holding?" 持仓中":""}`);
  }

  // 交易执行
  if (!TRADE || !inMarket || !isWeekday) {
    if (!TRADE) console.log("\n💡 加 --trade 启用自动交易");
    return;
  }

  fixOrders();

  const actions = opps.filter(s => s.action !== "HOLD");
  const longCandidates = actions.filter(s => s.action === "LONG" && !s.holding).slice(0, 3);
  const sellCandidates = actions.filter(s => s.action === "SHORT" && s.holding).slice(0, 3);

  console.log(`\n── 执行 (最多做多3只 + 清仓3只) ──`);

  // 先卖（腾出现金）
  for (const s of sellCandidates) {
    const h = holdingMap[s.symbol];
    if (!h) continue;
    const px = (s.price * 0.999).toFixed(2);
    const ret = order("sell", s.symbol, h.qty, px);
    console.log(`  🔴 卖出 ${s.symbol} ${h.qty}股 @ $${px}  |  ${s.reasons?.join(", ")}`);
  }

  // 再买
  let bought = 0;
  const maxPositions = 5;
  const currentCnt = holdings.length - sellCandidates.length;
  // 计算可用现金（扣除已挂卖出单的市值）
  const lockedValue = sellCandidates.reduce((s, x) => s + (holdingMap[x.symbol]?.qty ?? 0) * x.price, 0);
  const availableCash = Math.max(0, (asset * 0.6) - (holdings.reduce((s,h) => s + h.qty * (opps.find(o=>o.symbol===h.symbol)?.price ?? h.cost), 0) - lockedValue));
  const perTradeMax = availableCash / Math.max(1, longCandidates.length) * 0.8;

  for (const s of longCandidates) {
    if (currentCnt + bought >= maxPositions) { console.log(`  ⏭ 已达持仓上限`); break; }
    const maxQtyByCash = Math.floor(perTradeMax / s.price);
    const riskQty = Math.floor((asset * 0.01) / Math.max(0.1, s.stopDist || s.atr * 2));
    const qty = Math.max(1, Math.min(maxQtyByCash, riskQty));
    if (qty * s.price > availableCash * 0.5 && bought > 0) { console.log(`  ⏭ 资金不足`); continue; }
    const px = (s.price * 1.001).toFixed(2);
    const ret = order("buy", s.symbol, qty, px);
    console.log(`  🟢 买入 ${s.symbol} ${qty}股 @ $${px}  ≈$${((qty*s.price)/1000).toFixed(1)}k  止损$${(s.price - (s.stopDist||s.atr*2)).toFixed(2)}  |  ${s.reasons?.join(", ")}`);
    bought++;
  }

  if (!sellCandidates.length && !longCandidates.length) console.log("  无信号");
  console.log(`\n✅ 持仓${holdings.length}→${currentCnt + bought}只  日内$${todayPl.toFixed(0)}`);
}

try { main(); } catch(e) { console.error("❌", e.message); process.exit(1); }
