/**
 * 24H 监控 + 飞书报表
 *
 * 每 30 分钟运行：拉取数据 → 计算指标 → 生成信号 → 输出报表
 * 每小时推送飞书收益明细
 */
import * as cli from "../data/cli-client";
import { analyze, IndicatorReport } from "../indicators";
import { SignalEngine, TradeSignal, Holding, DEFAULT_CONFIG } from "../engine";

const WATCHLIST = ["NVDA.US", "MSFT.US", "META.US", "AMZN.US", "GOOGL.US", "TSLA.US", "AAPL.US"];

export interface MonitorReport {
  timestamp: string;
  totalAsset: number; totalPnl: number; todayPnl: number;
  holdings: Holding[];
  indicators: Record<string, IndicatorReport>;
  signals: TradeSignal[];
  sentiment: number;
  news: string[];
}

export async function runMonitor(): Promise<MonitorReport> {
  // 1. 账户
  const pf = cli.getPortfolio();
  const pos = cli.getPositions();

  const ov = pf?.overview ?? {};
  const totalAsset = parseFloat(ov.total_asset ?? 0);
  const totalPnl = parseFloat(ov.total_pl ?? 0);
  const todayPnl = parseFloat(ov.total_today_pl ?? 0);
  const sentiment = cli.getMarketSentiment();

  // 2. 持仓解析
  const holdings: Holding[] = [];
  const posList = pos?.positions ?? pos ?? [];
  if (Array.isArray(posList)) {
    for (const p of posList) {
      holdings.push({
        symbol: p.symbol, name: p.symbol_name ?? p.symbol,
        qty: parseInt(p.quantity ?? 0), costPrice: parseFloat(p.cost_price ?? 0),
        marketValue: parseFloat(p.market_value ?? 0), currency: p.currency ?? "USD",
      });
    }
  }

  // 3. 技术分析
  const indicators: Record<string, IndicatorReport> = {};
  const signals: TradeSignal[] = [];
  const engine = new SignalEngine();
  const news: string[] = [];

  for (const sym of WATCHLIST) {
    try {
      // K 线 (日线 100 根)
      const kl = cli.getKline(sym, "day", 100);
      if (!Array.isArray(kl) || kl.length < 60) continue;

      const candles = kl.map((k: any) => ({
        close: parseFloat(k.close ?? 0), high: parseFloat(k.high ?? 0),
        low: parseFloat(k.low ?? 0), open: parseFloat(k.open ?? 0),
        volume: parseFloat(k.volume ?? 0),
      }));
      const ind = analyze(candles);
      ind.symbol = sym;
      indicators[sym] = ind;

      const holding = holdings.find(h => h.symbol === sym);
      const signal = engine.evaluate(ind, holding, totalAsset, sentiment);
      signals.push(signal);

      // 新闻（仅监股持仓获取，节省 API）
      if (holding) {
        try {
          const n = cli.getNews(sym);
          if (Array.isArray(n)) news.push(...n.slice(0, 3).map((a: any) => `[${sym}] ${a.title ?? a.headline ?? ""}`));
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return { timestamp: new Date().toISOString(), totalAsset, totalPnl, todayPnl, holdings, indicators, signals, sentiment, news };
}

// ---- 格式化输出 ----
export function formatReport(r: MonitorReport): string {
  const l: string[] = [
    `═══════════════════════════════════════`,
    `  长桥 24H 监控  |  ${r.timestamp.slice(0, 19).replace("T", " ")}`,
    `═══════════════════════════════════════`,
    ``,
    `💰 总资产: $${r.totalAsset.toFixed(2)}  |  日内盈亏: ${r.todayPnl >= 0 ? "+" : ""}$${r.todayPnl.toFixed(2)}  |  总盈亏: ${r.totalPnl >= 0 ? "+" : ""}$${r.totalPnl.toFixed(2)}`,
    `📊 市场情绪: ${r.sentiment > 0 ? "🟢乐观" : r.sentiment < 0 ? "🔴谨慎" : "⚪中性"}`,
    ``, `── 当前持仓 ──`,
  ];
  if (!r.holdings.length) l.push("  (空仓)");
  else for (const h of r.holdings) {
    const pnl = h.marketValue - h.qty * h.costPrice;
    const pnlPct = (pnl / (h.qty * h.costPrice) * 100);
    l.push(`  ${h.symbol.padEnd(10)} ${String(h.qty).padStart(5)}股  成本$${h.costPrice.toFixed(2)}  市值$${h.marketValue.toFixed(2)}  盈亏${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`);
  }

  l.push(``, `── 交易信号 ──`);
  const nonHold = r.signals.filter(s => s.action !== "HOLD");
  if (!nonHold.length) l.push("  暂无交易信号");
  else for (const s of nonHold) {
    l.push(`  ${s.action === "BUY" ? "🟢" : "🔴"} ${s.action} ${s.symbol.padEnd(10)} 分数:${s.score.toFixed(1)}  建议价:$${s.suggestedPrice?.toFixed(2) ?? "-"}  数量:${s.suggestedQty ?? "-"}`);
    if (s.reasons.length) l.push(`     ${s.reasons.join(" | ")}`);
  }

  l.push(``, `── 技术指标 ──`);
  for (const [sym, ind] of Object.entries(r.indicators)) {
    const parts = [`$${ind.price.toFixed(2)}`, `RSI${ind.rsi14?.toFixed(0) ?? "-"}`];
    parts.push(`MACD${ind.macdHist != null ? (ind.macdHist >= 0 ? "+" : "") + ind.macdHist.toFixed(2) : "-"}`);
    parts.push(`ADX${ind.adx?.toFixed(0) ?? "-"}`);
    parts.push(`${ind.trend === "up" ? "📈" : ind.trend === "down" ? "📉" : "📊"}`);
    l.push(`  ${sym.padEnd(10)} ${parts.join("  ")}`);
  }

  if (r.news.length) {
    l.push(``, `── 最新动态 ──`);
    for (const n of r.news.slice(0, 5)) l.push(`  📰 ${n}`);
  }

  l.push(``, `═══════════════════════════════════════`);
  return l.join("\n");
}
