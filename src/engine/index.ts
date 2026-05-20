/**
 * 交易信号引擎 —— 多因子综合决策
 *
 * 输入：指标报告 + 持仓 + 新闻情绪 + 手续费
 * 输出：买入 / 卖出 / 持仓 信号 + 仓位大小
 */
import { IndicatorReport, OHLCV } from "../indicators";

// ---- 配置 ----
export interface EngineConfig {
  maxPositionPct: number;       // 单只最大仓位占比 (默认 0.15)
  maxTotalPct: number;          // 总持仓占比上限 (默认 0.60)
  stopLossPct: number;          // 止损线 (默认 -0.05)
  takeProfitPct: number;        // 止盈线 (默认 0.10)
  feeRate: number;              // 手续费率 (默认 0.0003)
  minScoreBuy: number;          // 买入最低分数 (默认 5)
  minScoreSell: number;         // 卖出触发分数 (默认 -3)
  atrMultiplierStop: number;    // ATR 止损倍数 (默认 2)
  atrMultiplierTake: number;    // ATR 止盈倍数 (默认 3)
}

export const DEFAULT_CONFIG: EngineConfig = {
  maxPositionPct: 0.15, maxTotalPct: 0.60,
  stopLossPct: 0.05, takeProfitPct: 0.10,
  feeRate: 0.0003,
  minScoreBuy: 5, minScoreSell: -3,
  atrMultiplierStop: 2, atrMultiplierTake: 3,
};

// ---- 持仓 ----
export interface Holding {
  symbol: string; name: string; qty: number; costPrice: number; marketValue: number; currency: string;
}

// ---- 信号输出 ----
export interface TradeSignal {
  symbol: string; action: "BUY" | "SELL" | "HOLD";
  score: number;            // 综合分数 (-10 ~ +10)
  reasons: string[];        // 决策原因
  suggestedQty?: number;    // 建议数量
  suggestedPrice?: number;  // 建议价格
  stopLoss?: number;
  takeProfit?: number;
}

// ---- 评分引擎 ----
export class SignalEngine {
  config: EngineConfig;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 综合技术面评分 (-10 ~ +10)
   */
  scoreTechnical(ind: IndicatorReport): { score: number; reasons: string[] } {
    let s = 0; const reasons: string[] = [];

    // 趋势跟随 (权重 3)
    if (ind.trend === "up") { s += 3; reasons.push("上升趋势"); }
    else if (ind.trend === "down") { s -= 3; reasons.push("下降趋势"); }

    // RSI (权重 2)
    if (ind.rsi14 != null) {
      if (ind.rsi14 < 30) { s += 2; reasons.push("RSI 超卖"); }
      else if (ind.rsi14 > 70) { s -= 2; reasons.push("RSI 超买"); }
    }

    // MACD (权重 2)
    if (ind.macdHist != null && ind.macd != null) {
      if (ind.macdHist > 0) {
        s += 1;
        if (ind.macd > 0) { s += 1; reasons.push("MACD 金叉看涨"); }
      } else {
        s -= 1;
        if (ind.macd < 0) { s -= 1; reasons.push("MACD 死叉看跌"); }
      }
    }

    // Bollinger (权重 1)
    if (ind.bbLower != null && ind.bbUpper != null && ind.bbMiddle != null) {
      if (ind.price < ind.bbLower) { s += 1; reasons.push("触及布林下轨"); }
      else if (ind.price > ind.bbUpper) { s -= 1; reasons.push("触及布林上轨"); }
    }

    // Stochastic (权重 1)
    if (ind.stochK != null && ind.stochD != null) {
      if (ind.stochK < 20 && ind.stochD < 20) { s += 1; reasons.push("KD 超卖区"); }
      else if (ind.stochK > 80 && ind.stochD > 80) { s -= 1; reasons.push("KD 超买区"); }
    }

    // CCI (权重 1)
    if (ind.cci20 != null) {
      if (ind.cci20 < -100) { s += 1; reasons.push("CCI 超卖"); }
      else if (ind.cci20 > 100) { s -= 1; reasons.push("CCI 超买"); }
    }

    // ADX 强度
    if (ind.adx != null && ind.adx > 25) {
      if (ind.pdi != null && ind.ndi != null && ind.pdi > ind.ndi) { s += 1; reasons.push("ADX 多方强势"); }
      else { s -= 1; reasons.push("ADX 空方强势"); }
    }

    // VWAP
    if (ind.vwap != null && ind.price > ind.vwap) { s += 0.5; }
    else if (ind.vwap != null) { s -= 0.5; }

    return { score: Math.max(-10, Math.min(10, s)), reasons };
  }

  /**
   * 生成交易信号
   */
  evaluate(ind: IndicatorReport, holding?: Holding, totalAsset?: number, marketSentiment = 0): TradeSignal {
    const reasons: string[] = [];
    let score = 0;

    // 1. 技术面评分
    const tech = this.scoreTechnical(ind);
    score += tech.score;
    reasons.push(...tech.reasons);

    // 2. 市场情绪修正 (-2 ~ +2)
    score += marketSentiment;
    if (marketSentiment > 0) reasons.push(`市场情绪乐观(+${marketSentiment})`);
    else if (marketSentiment < 0) reasons.push(`市场情绪悲观(${marketSentiment})`);

    // 3. 持仓盈亏修正
    if (holding) {
      const pnlPct = (ind.price - holding.costPrice) / holding.costPrice;
      if (pnlPct >= this.config.takeProfitPct) {
        score -= 2; reasons.push(`已达止盈线 (+${(pnlPct * 100).toFixed(1)}%)`);
      } else if (pnlPct <= -this.config.stopLossPct) {
        score -= 3; reasons.push(`触及止损线 (${(pnlPct * 100).toFixed(1)}%)`);
      }
    }

    // 决策
    let action: TradeSignal["action"] = "HOLD";
    if (!holding && score >= this.config.minScoreBuy) action = "BUY";
    else if (holding && score <= this.config.minScoreSell) action = "SELL";

    const signal: TradeSignal = { symbol: ind.symbol, action, score, reasons };

    // 仓位建议
    if (action === "BUY" && totalAsset && ind.atr14) {
      const riskAmount = totalAsset * 0.02; // 单笔风险 2%
      const stopDist = ind.atr14 * this.config.atrMultiplierStop;
      signal.suggestedQty = Math.floor(riskAmount / stopDist);
      signal.suggestedPrice = ind.price;
      signal.stopLoss = ind.price - stopDist;
      signal.takeProfit = ind.price + stopDist * this.config.atrMultiplierTake / this.config.atrMultiplierStop;
    }

    if (action === "SELL" && holding) {
      signal.suggestedQty = holding.qty;
      signal.suggestedPrice = ind.price;
    }

    return signal;
  }
}
