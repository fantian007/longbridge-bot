#!/usr/bin/env node
/**
 * 长桥 24H 自动盯盘 + 交易系统
 * 用法: node trading.mjs          # 仅监控
 *       node trading.mjs --trade  # 监控 + 自动交易
 */
const AUTO_TRADE = process.argv.includes("--trade");
import { execSync } from "child_process";

const LB = "/usr/local/bin/longbridge";
// 只传递必要环境变量，避免 .env 中的 LONGBRIDGE_* 覆盖 CLI 存储 token
const ENV = { HOME: process.env.HOME || "/home/zys", PATH: process.env.PATH, USER: process.env.USER, SHELL: process.env.SHELL, LANG: process.env.LANG };
const WATCH = ["NVDA.US", "MSFT.US", "META.US", "AMZN.US", "GOOGL.US", "TSLA.US", "AAPL.US"];

// ---- CLI 调用 ----
function cli(cmd) {
  try {
    // 从 /tmp 运行以避开 CWD 下的 .env 覆盖 CLI 存储 token
    return JSON.parse(execSync(`${LB} ${cmd} --format json`, { encoding: "utf8", timeout: 15000, env: ENV, cwd: "/tmp" }).toString());
  } catch(e) { return null; }
}

// ---- 技术指标 (20+) ----
function sma(arr, n) { return arr.map((_, i) => i < n-1 ? null : arr.slice(i-n+1, i+1).reduce((a,b) => a+b)/n); }
function ema(arr, n) { const k=2/(n+1); const out=[]; let emaV=arr.slice(0,n).reduce((a,b)=>a+b)/n; for(let i=0;i<arr.length;i++){if(i<n-1)out.push(null);else if(i===n-1)out.push(emaV);else{emaV=arr[i]*k+emaV*(1-k);out.push(emaV);}} return out; }
function std(arr) { const m=arr.reduce((a,b)=>a+b)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length); }

function analyze(klines) {
  if (klines.length < 60) return null;
  const closes = klines.map(k => parseFloat(k.close));
  const highs = klines.map(k => parseFloat(k.high));
  const lows = klines.map(k => parseFloat(k.low));
  const opens = klines.map(k => parseFloat(k.open));
  const volumes = klines.map(k => parseFloat(k.volume));
  const n = closes.length, i = n - 1;
  const price = closes[i];

  // SMA 20/60
  const s20 = sma(closes, 20), s60 = sma(closes, 60);
  // EMA 12/26
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  // MACD
  const macd = e12.map((v,j) => v!=null&&e26[j]!=null ? v-e26[j] : null);
  const macdSignal = ema(macd.filter(v=>v!=null), 9);
  const macdHist = macd.map((v,j) => {
    let si = 0; for(let k=0;k<j;k++) if(macd[k]!=null) si++;
    return v!=null&&macdSignal[si-1]!=null ? v-macdSignal[si-1] : null;
  });
  // RSI 14
  const rsiV = []; let avgG=0, avgL=0;
  for(let j=1;j<=14;j++){const d=closes[j]-closes[j-1]; if(d>0)avgG+=d; else avgL-=d;}
  avgG/=14; avgL/=14; rsiV[14]=avgL===0?100:100-100/(1+avgG/avgL);
  for(let j=15;j<n;j++){const d=closes[j]-closes[j-1]; avgG=(avgG*13+(d>0?d:0))/14; avgL=(avgL*13+(d<0?-d:0))/14; rsiV[j]=avgL===0?100:100-100/(1+avgG/avgL);}
  // Bollinger
  const bMid = s20, bUpper=[], bLower=[];
  for(let j=19;j<n;j++){const s=std(closes.slice(j-19,j+1)); bUpper[j]=bMid[j]+2*s; bLower[j]=bMid[j]-2*s;}
  // ATR 14
  const atrV = []; const tr=[];
  for(let j=1;j<n;j++) tr.push(Math.max(highs[j]-lows[j], Math.abs(highs[j]-closes[j-1]), Math.abs(lows[j]-closes[j-1])));
  let atrAvg=tr.slice(0,14).reduce((a,b)=>a+b)/14; atrV[14]=atrAvg;
  for(let j=15;j<n;j++){atrAvg=(atrAvg*13+tr[j-1])/14; atrV[j]=atrAvg;}
  // Stochastic
  const stochK=[], stochD=[];
  for(let j=13;j<n;j++){const sl=klines.slice(j-13,j+1); const hh=Math.max(...sl.map(k=>parseFloat(k.high))), ll=Math.min(...sl.map(k=>parseFloat(k.low))); stochK[j]=hh===ll?50:((closes[j]-ll)/(hh-ll))*100;}
  for(let j=16;j<n;j++) stochD[j]=(stochK[j]+stochK[j-1]+stochK[j-2])/3;
  // CCI 20
  const cciV=[];
  for(let j=19;j<n;j++){const sl=klines.slice(j-19,j+1); const tps=sl.map(k=>(parseFloat(k.high)+parseFloat(k.low)+parseFloat(k.close))/3); const m=tps.reduce((a,b)=>a+b)/20; const md=tps.map(tp=>Math.abs(tp-m)).reduce((a,b)=>a+b)/20; cciV[j]=md===0?0:(tps[19]-m)/(0.015*md);}
  // ADX 14
  const adxV=[], pdiV=[], ndiV=[]; let atrA=tr.slice(0,14).reduce((a,b)=>a+b)/14, pdA=0, ndA=0;
  for(let j=0;j<14;j++){const up=highs[j+1]-highs[j]; const dn=lows[j]-lows[j+1]; pdA+=(up>dn&&up>0?up:0); ndA+=(dn>up&&dn>0?dn:0);}
  pdA/=14; ndA/=14;
  for(let j=14;j<n-1;j++){atrA=(atrA*13+tr[j])/14; const up=highs[j+1]-highs[j]; const dn=lows[j]-lows[j+1]; pdA=(pdA*13+(up>dn&&up>0?up:0))/14; ndA=(ndA*13+(dn>up&&dn>0?dn:0))/14; pdiV[j+1]=atrA===0?0:(pdA/atrA)*100; ndiV[j+1]=atrA===0?0:(ndA/atrA)*100; const pdi=pdiV[j+1], ndi=ndiV[j+1]; adxV[j+1]=pdi+ndi===0?0:(Math.abs(pdi-ndi)/(pdi+ndi))*100;}
  for(let j=27;j<n;j++){const sl=adxV.slice(j-13,j+1).filter(v=>v!=null); if(sl.length) adxV[j]=sl.reduce((a,b)=>a+b)/sl.length;}
  // MFI 14
  const mfiV=[];
  for(let j=14;j<n;j++){let pos=0,neg=0; for(let k=j-13;k<=j;k++){const tp=(highs[k]+lows[k]+closes[k])/3, prevTp=(highs[k-1]+lows[k-1]+closes[k-1])/3; const mf=tp*volumes[k]; if(tp>=prevTp)pos+=mf; else neg+=mf;} mfiV[j]=neg===0?100:100-100/(1+pos/neg);}
  // VWAP
  const vwapV=[]; let cv=0,cpv=0; for(const k of klines){const tp=(parseFloat(k.high)+parseFloat(k.low)+parseFloat(k.close))/3; cv+=parseFloat(k.volume); cpv+=tp*parseFloat(k.volume); vwapV.push(cv===0?null:cpv/cv);}
  // ROC 10
  const rocV=[]; for(let j=0;j<n;j++) rocV.push(j<10?null:((closes[j]-closes[j-10])/closes[j-10])*100);
  // Volume Ratio
  const volR=[]; for(let j=0;j<n;j++){if(j<5){volR.push(null);continue;} const avgV=volumes.slice(j-4,j+1).reduce((a,b)=>a+b)/5; volR.push(avgV===0?1:volumes[j]/avgV);}

  const trend = price > (s20[i]??0) && (s20[i]??0) > (s60[i]??0) ? "up" : price < (s20[i]??Infinity) && (s20[i]??Infinity) < (s60[i]??Infinity) ? "down" : "sideways";
  return { price, sma20:s20[i], sma60:s60[i], ema12:e12[i], ema26:e26[i], macd:macd[i], macdHist:macdHist[i], rsi14:rsiV[i], bbUpper:bUpper[i], bbLower:bLower[i], bbWidth:bUpper[i]&&bLower[i]?((bUpper[i]-bLower[i])/bMid[i])*100:null, atr14:atrV[i], atrPct:atrV[i]?atrV[i]/price*100:null, stochK:stochK[i], stochD:stochD[i], cci20:cciV[i], adx:adxV[i], pdi:pdiV[i], ndi:ndiV[i], mfi14:mfiV[i], vwap:vwapV[i], roc10:rocV[i], volRatio:volR[i], trend };
}

// ---- 信号引擎 ----
function signal(ind, holding, asset, sentiment=0) {
  let score = 0; const reasons = [];
  if (ind.trend === "up") { score += 2; reasons.push("上升趋势"); }
  else if (ind.trend === "down") { score -= 2; reasons.push("下降趋势"); }
  if (ind.rsi14 != null) {
    if (ind.rsi14 < 30) { score += 2; reasons.push("RSI超卖"); }
    else if (ind.rsi14 > 70) { score -= 2; reasons.push("RSI超买"); }
  }
  if (ind.macdHist != null) {
    if (ind.macdHist > 0) score += 1; else score -= 1;
  }
  if (ind.bbLower != null && ind.price < ind.bbLower) { score += 1; reasons.push("触下轨"); }
  if (ind.bbUpper != null && ind.price > ind.bbUpper) { score -= 1; reasons.push("触上轨"); }
  if (ind.stochK != null && ind.stochK < 20) { score += 1; reasons.push("KD超卖"); }
  if (ind.stochK != null && ind.stochK > 80) { score -= 1; reasons.push("KD超买"); }
  if (ind.cci20 != null && ind.cci20 < -100) { score += 1; }
  if (ind.cci20 != null && ind.cci20 > 100) { score -= 1; }
  if (ind.adx != null && ind.adx > 25) { if (ind.pdi > ind.ndi) score += 1; else score -= 1; }
  if (ind.vwap != null) score += ind.price > ind.vwap ? 0.5 : -0.5;
  score += sentiment;
  // 降低阈值：买入 >= 2 积极建仓，卖出 <= -2 果断止损
  const action = score >= 2 && !holding ? "BUY" : score <= -2 && holding ? "SELL" : "HOLD";
  let stopLoss, takeProfit, qty;
  if (action === "BUY" && ind.atr14 && asset) {
    const risk = asset * 0.02, stopDist = ind.atr14 * 2;
    qty = Math.floor(risk / stopDist);
    stopLoss = +(ind.price - stopDist).toFixed(2);
    takeProfit = +(ind.price + stopDist * 1.5).toFixed(2);
  }
  if (action === "SELL" && holding) { qty = holding.qty; stopLoss = null; takeProfit = null; }
  return { symbol: ind.symbol, action, score, reasons, qty, stopLoss, takeProfit, price: ind.price };
}

// ---- 主程序 ----
async function main() {
  console.log("⏳ 拉取数据…");
  const pf = cli("portfolio");
  const pos = cli("positions");
  const ov = pf?.overview ?? {};
  const asset = parseFloat(ov.total_asset ?? 0);
  const totalPl = parseFloat(ov.total_pl ?? 0);
  const todayPl = parseFloat(ov.total_today_pl ?? 0);
  const holdings = (pos && Array.isArray(pos)) ? pos.map(p => ({ symbol: p.symbol, name: p.name ?? p.symbol, qty: parseInt(p.quantity), costPrice: parseFloat(p.cost_price), marketValue: parseFloat(p.market_value), pnl: (parseFloat(p.quantity)*(parseFloat(p.current_price??p.cost_price??0)-parseFloat(p.cost_price))) })) : [];

  // 市场情绪
  let sentiment = 0;
  try { const qs=cli("quote SPY.US QQQ.US"); if(Array.isArray(qs)){for(const q of qs){const chg=parseFloat(q.change_rate??0);if(q.symbol==="SPY.US")sentiment+=chg>0?1:-1;if(q.symbol==="QQQ.US")sentiment+=chg>0?0.5:-0.5;}}} catch{}
  sentiment = Math.max(-2, Math.min(2, sentiment));

  // 技术分析 + 信号
  const indicators = {};
  const signals = [];
  for (const sym of WATCH) {
    try {
      const kl = cli(`kline ${sym} --period day --count 100`);
      if (!Array.isArray(kl) || kl.length < 60) continue;
      const ind = analyze(kl);
      if (!ind) continue;
      ind.symbol = sym;
      indicators[sym] = ind;
      const h = holdings.find(h => h.symbol === sym);
      signals.push(signal(ind, h, asset, sentiment));
    } catch(e) { /* skip */ }
  }

  // ---- 输出报表 ----
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  长桥 24H 监控  |  ${new Date().toISOString().slice(0,19).replace("T"," ")}`);
  console.log(`═══════════════════════════════════════\n`);
  console.log(`💰 总资产: $${asset.toFixed(2)}  |  日内: ${todayPl>=0?"+":""}$${todayPl.toFixed(2)}  |  总盈亏: ${totalPl>=0?"+":""}$${totalPl.toFixed(2)}`);
  console.log(`📊 市场情绪: ${sentiment>0?"🟢乐观":sentiment<0?"🔴谨慎":"⚪中性"}\n`);

  console.log(`── 当前持仓 ──`);
  if (!holdings.length) console.log("  (空仓)");
  else for (const h of holdings) {
    const pnl = h.pnl ?? (h.marketValue - h.qty * h.costPrice);
    console.log(`  ${(h.symbol??"").padEnd(10)} ${String(h.qty).padStart(5)}股  成本$${h.costPrice.toFixed(2)}  盈亏${pnl>=0?"+":""}$${pnl.toFixed(2)}`);
  }

  console.log(`\n── 交易信号 ──`);
  const nonHold = signals.filter(s => s.action !== "HOLD");
  if (!nonHold.length) console.log("  暂无交易信号");
  else for (const s of nonHold) {
    console.log(`  ${s.action==="BUY"?"🟢":"🔴"} ${s.action} ${s.symbol.padEnd(10)} 分数:${s.score.toFixed(1)}  建议价:$${s.price?.toFixed(2)}  数量:${s.qty??"-"}`);
    if (s.reasons?.length) console.log(`     ${s.reasons.join(" | ")}`);
    if (s.stopLoss) console.log(`     止损:$${s.stopLoss}  止盈:$${s.takeProfit}`);
  }

  // ---- 智能撤单重挂 ----
  (function checkOrders() {
    const orders = cli("order");
    if (!Array.isArray(orders)) return;
    const pending = orders.filter(o => o.status === "New" || o.status === "Queued");
    for (const o of pending) {
      const q = cli(`quote ${o.symbol}`);
      if (!Array.isArray(q) || !q.length) continue;
      const last = parseFloat(q[0].last), orderPx = parseFloat(o.price);
      const dev = Math.abs(last - orderPx) / orderPx;
      const ageMin = (Date.now() - new Date(o.created_at).getTime()) / 60000;
      if (dev > 0.005 || ageMin > 15) {
        try { execSync(`echo "y" | ${LB} order cancel ${o.order_id}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" }); } catch {}
        const newPx = (last * (o.side === "Buy" ? 1.001 : 0.999)).toFixed(2);
        try { execSync(`echo "y" | ${LB} order ${o.side === "Buy" ? "buy" : "sell"} ${o.symbol} ${o.quantity} --price ${newPx}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" }); } catch {}
        console.log(`  🔄 重挂 ${o.symbol} ${o.side} $${orderPx}→$${newPx} 偏离${(dev*100).toFixed(1)}%`);
      }
    }
  })();

  // ---- 自动交易执行 ----
  if (AUTO_TRADE) {
    console.log(`\n── 自动交易 ──`);
    // 风险控制：总持仓不超过 60%，单只不超过 15%
    const totalMktValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const maxTotal = asset * 0.60, maxSingle = asset * 0.15;
    let executed = 0;

    for (const s of nonHold) {
      if (executed >= 3) break; // 单次最多 3 笔
      const holding = holdings.find(h => h.symbol === s.symbol);
      const currentValue = holding?.marketValue ?? 0;

      if (s.action === "BUY") {
        // 风控检查
        const newValue = currentValue + (s.qty ?? 0) * s.price;
        if (totalMktValue + newValue - currentValue > maxTotal) {
          console.log(`  ⏭ ${s.symbol} 超过总仓位上限 (60%)，跳过`);
          continue;
        }
        if (newValue > maxSingle) {
          console.log(`  ⏭ ${s.symbol} 超过单只上限 (15%)，跳过`);
          continue;
        }
        // 执行买入
        const qty = Math.min(s.qty ?? 10, Math.floor((maxSingle - currentValue) / s.price));
        if (qty <= 0) { console.log(`  ⏭ ${s.symbol} 仓位已满，跳过`); continue; }
        const ret = cli(`order buy ${s.symbol} --price ${s.price?.toFixed(2)} --quantity ${qty}`) || execSync(`echo "y" | ${LB} order buy ${s.symbol} ${qty} --price ${s.price?.toFixed(2)}`, { encoding:"utf8", timeout:15000, env:ENV });
        console.log(`  ✅ 买入 ${s.symbol} ${qty}股 @ $${s.price?.toFixed(2)}`);
        executed++;
      }

      if (s.action === "SELL" && holding) {
        const ret = execSync(`echo "y" | ${LB} order sell ${s.symbol} ${holding.qty} --price ${s.price?.toFixed(2)}`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" });
        console.log(`  ✅ 卖出 ${s.symbol} ${holding.qty}股 @ $${s.price?.toFixed(2)}`);
        executed++;
      }
    }
    if (executed === 0) console.log("  无符合条件的交易");
  }

  console.log(`\n── 技术指标 ──`);
  for (const [sym, ind] of Object.entries(indicators)) {
    const parts = [`$${ind.price.toFixed(2)}`, `RSI${ind.rsi14?.toFixed(0)??"-"}`];
    if (ind.macdHist != null) parts.push(`MACD${ind.macdHist>=0?"+":""}${ind.macdHist.toFixed(2)}`);
    parts.push(`ADX${ind.adx?.toFixed(0)??"-"}`, ind.trend==="up"?"📈":ind.trend==="down"?"📉":"📊");
    console.log(`  ${sym.padEnd(10)} ${parts.join("  ")}`);
  }
  console.log(`\n═══════════════════════════════════════`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
