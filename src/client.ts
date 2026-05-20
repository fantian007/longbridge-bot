/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 核心客户端模块 —— 基于 Longbridge Node SDK v4.x
 *
 * @module client
 */

import {
  Config,
  TradeContext,
  QuoteContext,
  OrderSide,
  OrderType,
  TimeInForceType,
  Decimal,
  Period,
  AdjustType,
  TradeSessions,
} from "longbridge";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export interface ClientOptions {
  appKey: string;
  appSecret: string;
  accessToken: string;
  baseUrl?: string;
  tradeEnv?: "real" | "simulate";
  proxy?: string;
}

// ---------------------------------------------------------------------------
// 客户端
// ---------------------------------------------------------------------------

export class LongbridgeClient {
  readonly #config: Config;
  #tradeCtx?: TradeContext;
  #quoteCtx?: QuoteContext;

  constructor(options: ClientOptions) {
    const { appKey, appSecret, accessToken, baseUrl, tradeEnv } = options;

    if (!appKey || !appSecret || !accessToken) {
      throw new Error("缺少必要参数: 请提供 appKey, appSecret 和 accessToken");
    }

    const extra: Record<string, string> = {};
    if (baseUrl) extra["httpUrl"] = baseUrl;
    if (tradeEnv === "real") extra["tradeEnv"] = "real";

    this.#config = Config.fromApikey(appKey, appSecret, accessToken, extra);
  }

  private tradeCtx(): TradeContext {
    if (!this.#tradeCtx) {
      this.#tradeCtx = TradeContext.new(this.#config);
    }
    return this.#tradeCtx;
  }

  private quoteCtx(): QuoteContext {
    if (!this.#quoteCtx) {
      this.#quoteCtx = QuoteContext.new(this.#config);
    }
    return this.#quoteCtx;
  }

  // ========================================================================
  // 账户 API
  // ========================================================================

  async getAssets(currency?: string) {
    return this.tradeCtx().accountBalance(currency);
  }

  async getPositions(symbols?: string[]) {
    return this.tradeCtx().stockPositions(symbols ?? null!);
  }

  // ========================================================================
  // 订单 API
  // ========================================================================

  async submitOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    submittedQuantity: number;
    submittedPrice: string;
    orderType?: string;
    timeInForce?: string;
  }) {
    const side = params.side === "buy" ? OrderSide.Buy : OrderSide.Sell;
    return this.tradeCtx().submitOrder({
      symbol: params.symbol,
      side,
      submittedQuantity: new Decimal(params.submittedQuantity) as any,
      submittedPrice: new Decimal(params.submittedPrice) as any,
      orderType: OrderType.LO as any,
      timeInForce: TimeInForceType.Day as any,
    });
  }

  async cancelOrder(orderId: string) {
    return this.tradeCtx().cancelOrder(orderId);
  }

  async getTodayOrders(symbol?: string) {
    return this.tradeCtx().todayOrders(symbol ? { symbol } : {});
  }

  // ========================================================================
  // 行情 API
  // ========================================================================

  async getQuote(symbols: string[]) {
    return this.quoteCtx().quote(symbols);
  }

  async getCandlesticks(
    symbol: string,
    period: string = "Day",
    count: number = 100
  ) {
    return this.quoteCtx().candlesticks(
      symbol,
      Period.Min_1 as any,
      count,
      AdjustType.ForwardAdjust,
      TradeSessions.Intraday
    );
  }

  // ========================================================================
  // 自选股 (SDK v4 暂未提供 watchlist API)
  // ========================================================================

  async getWatchlist(): Promise<Array<{ symbol: string }>> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 错误类
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}
