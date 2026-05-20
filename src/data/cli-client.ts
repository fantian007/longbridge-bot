/**
 * 数据层 —— 通过 Longbridge CLI 获取数据（纯 JS，无需原生绑定）
 *
 * CLI 版本: 0.21.0，已安装在服务器 /usr/local/bin/longbridge
 */
import { execSync } from "child_process";

const LB = "/usr/local/bin/longbridge";

// 只传递必要环境变量，避免 .env 中的 LONGBRIDGE_* 覆盖 CLI 存储 token
const ENV = { HOME: process.env.HOME || "/home/zys", PATH: process.env.PATH, USER: process.env.USER, SHELL: process.env.SHELL, LANG: process.env.LANG };

function run(cmd: string): any {
  try {
    const out = execSync(`${LB} ${cmd} --format json`, { encoding: "utf-8", timeout: 15000, env: ENV });
    return JSON.parse(out || "[]");
  } catch { return null; }
}

// ---- 行情 ----
export function getQuote(symbols: string[]) {
  return run(`quote ${symbols.join(" ")}`);
}
export function getKline(symbol: string, period = "day", count = 100) {
  return run(`kline ${symbol} --period ${period} --count ${count}`);
}
export function getIntraday(symbol: string) {
  return run(`intraday ${symbol}`);
}

// ---- 账户 ----
export function getAssets(currency = "USD") {
  return run(`assets --currency ${currency}`);
}
export function getPositions() {
  return run("positions");
}
export function getTodayOrders(symbol?: string) {
  return symbol ? run(`order --symbol ${symbol}`) : run("order");
}
export function getPortfolio() {
  return run("portfolio");
}

// ---- 交易 ----
export function submitOrder(symbol: string, side: string, qty: number, price: number) {
  try {
    return execSync(`echo "y" | ${LB} order ${side} ${symbol} ${qty} --price ${price}`,
      { encoding: "utf-8", timeout: 15000, env: ENV });
  } catch { return ""; }
}
export function cancelOrder(orderId: string) {
  try {
    return execSync(`echo "y" | ${LB} order cancel ${orderId}`,
      { encoding: "utf-8", timeout: 15000, env: ENV });
  } catch { return ""; }
}

// ---- 新闻 / 基本面 ----
export function getNews(symbol: string) {
  return run(`news ${symbol}`);
}
export function getValuation(symbol: string) {
  return run(`valuation ${symbol}`);
}
export function getForecastEps(symbol: string) {
  return run(`forecast-eps ${symbol}`);
}
export function getCapitalFlow(symbol: string) {
  return run(`capital ${symbol} --flow`);
}
export function getInstitutionRating(symbol: string) {
  return run(`institution-rating ${symbol}`);
}
export function getConsensus(symbol: string) {
  return run(`consensus ${symbol}`);
}
export function getFinancialReport(symbol: string) {
  return run(`financial-report ${symbol} --latest`);
}

// ---- 市场 ----
export function getMarketSentiment(): number {
  try {
    const quotes = getQuote(["SPY.US", "QQQ.US"]);
    let score = 0;
    for (const q of quotes) {
      if (q.symbol === "SPY.US") score += parseFloat(q.change_rate ?? 0) > 0 ? 1 : -1;
      if (q.symbol === "QQQ.US") score += parseFloat(q.change_rate ?? 0) > 0 ? 0.5 : -0.5;
    }
    return Math.max(-2, Math.min(2, score));
  } catch { return 0; }
}
