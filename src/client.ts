/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 核心客户端模块 —— 封装长桥 OpenAPI 的鉴权与请求
 *
 * @module client
 */

import { createHmac } from "node:crypto";
import type { Agent } from "node:http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 长桥 OpenAPI 基础地址 */
const DEFAULT_BASE_URL = "https://openapi.longbridge.com" as const;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 客户端配置选项 */
export interface ClientOptions {
  /** 应用 Key（在 Longbridge 开发者平台获取） */
  appKey: string;
  /** 应用 Secret */
  appSecret: string;
  /** 访问令牌 */
  accessToken: string;
  /** API 基础地址（默认 https://openapi.longbridge.com） */
  baseUrl?: string;
  /**
   * HTTP 代理地址
   * @example "http://127.0.0.1:7890"
   * @example "socks5://127.0.0.1:1080"
   */
  proxy?: string;
}

/** 签名算法所需的参数 */
interface SignParams {
  method: string;
  path: string;
  query: string;
  body: string;
  timestamp: number;
}

/** 通用 API 响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// ---------------------------------------------------------------------------
// 签名算法
// ---------------------------------------------------------------------------

/**
 * 计算长桥 OpenAPI HMAC-SHA256 签名
 *
 * 签名规则:
 *   sign = HMAC-SHA256(app_secret, method + "\n" + uri + "\n" + query + "\n" + body + "\n" + timestamp)
 *
 * @param secret  - App Secret
 * @param params  - 签名参数
 * @returns hex 编码的签名
 */
function sign(secret: string, params: SignParams): string {
  const payload = [
    params.method.toUpperCase(),
    params.path,
    params.query,
    params.body,
    String(params.timestamp),
  ].join("\n");

  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// 客户端类
// ---------------------------------------------------------------------------

/**
 * 长桥 OpenAPI HTTP 客户端
 *
 * 支持:
 * - AppKey + AppSecret + AccessToken 鉴权
 * - HTTP / SOCKS5 代理
 *
 * @example
 * ```ts
 * const client = new LongbridgeClient({
 *   appKey: "your_app_key",
 *   appSecret: "your_app_secret",
 *   accessToken: "your_access_token",
 * });
 *
 * const assets = await client.getAssets();
 * ```
 */
export class LongbridgeClient {
  readonly #appKey: string;
  readonly #appSecret: string;
  readonly #accessToken: string;
  readonly #baseUrl: string;
  readonly #agent: Agent | undefined;

  constructor(options: ClientOptions) {
    const { appKey, appSecret, accessToken, baseUrl, proxy } = options;

    if (!appKey || !appSecret || !accessToken) {
      throw new Error(
        "缺少必要参数: 请提供 appKey, appSecret 和 accessToken"
      );
    }

    this.#appKey = appKey;
    this.#appSecret = appSecret;
    this.#accessToken = accessToken;
    this.#baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    if (proxy) {
      this.#agent = proxy.startsWith("socks")
        ? (new SocksProxyAgent(proxy) as unknown as Agent)
        : (new HttpsProxyAgent(proxy) as unknown as Agent);
    }
  }

  // ---------------------------------------------------------------------------
  // 核心请求方法
  // ---------------------------------------------------------------------------

  /**
   * 向 OpenAPI 发送请求
   *
   * @param method  - HTTP 方法 (GET / POST / DELETE 等)
   * @param path    - API 路径 (如 "/v1/asset/account")
   * @param params  - URL 查询参数
   * @param body    - 请求体对象（会自动 JSON 序列化）
   * @returns 解析后的 API 响应
   */
  async request<T = unknown>(
    method: string,
    path: string,
    params: Record<string, string> = {},
    body: Record<string, unknown> | null = null
  ): Promise<ApiResponse<T>> {
    const timestamp = Math.floor(Date.now() / 1000);

    // 构建查询字符串
    const queryEntries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null
    );
    const queryString = queryEntries.length
      ? `?${new URLSearchParams(queryEntries).toString()}`
      : "";

    // 构建请求体
    const bodyStr = body ? JSON.stringify(body) : "";

    // 计算签名
    const signature = sign(this.#appSecret, {
      method,
      path,
      query: queryString,
      body: bodyStr,
      timestamp,
    });

    // 构建请求
    const url = `${this.#baseUrl}${path}${queryString}`;
    const headers: Record<string, string> = {
      "x-api-key": this.#appKey,
      "x-api-signature": signature,
      "x-api-timestamp": String(timestamp),
      Authorization: `Bearer ${this.#accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
      ...(this.#agent ? { dispatcher: this.#agent } : {}),
    });

    const data = (await response.json()) as ApiResponse<T>;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        `API 请求失败 [${response.status}]: ${JSON.stringify(data)}`,
        data
      );
    }

    if (data.code !== 0) {
      throw new ApiError(
        response.status,
        `API 业务错误 [code=${data.code}]: ${data.message}`,
        data
      );
    }

    return data;
  }

  // ========================================================================
  // 账户 API
  // ========================================================================

  /**
   * 获取账户资产信息
   *
   * @see https://open.longportapp.com/en/docs/asset/account
   */
  async getAssets() {
    return this.request("/v1/asset/account");
  }

  /**
   * 获取持仓列表
   *
   * @param currency - 货币类型 (HKD / USD / CNY)
   * @see https://open.longportapp.com/en/docs/asset/position
   */
  async getPositions(currency = "HKD") {
    return this.request("/v1/asset/position", { currency });
  }

  // ========================================================================
  // 订单 API
  // ========================================================================

  /**
   * 提交订单
   *
   * @param order - 订单参数
   * @see https://open.longportapp.com/en/docs/trade/order
   */
  async placeOrder(order: Record<string, unknown>) {
    return this.request("POST", "/v1/trade/order", {}, order);
  }

  /**
   * 撤销订单
   *
   * @param orderId - 订单 ID
   */
  async cancelOrder(orderId: string) {
    return this.request("DELETE", `/v1/trade/order/${orderId}`);
  }

  /**
   * 查询订单列表
   *
   * @param params - 筛选参数（如 status, symbol 等）
   */
  async getOrders(params: Record<string, string> = {}) {
    return this.request("/v1/trade/order/list", params);
  }

  /**
   * 查询订单详情
   *
   * @param orderId - 订单 ID
   */
  async getOrderDetail(orderId: string) {
    return this.request(`/v1/trade/order/${orderId}`);
  }

  // ========================================================================
  // 行情 API
  // ========================================================================

  /**
   * 获取实时行情
   *
   * @param symbol - 股票代码 (如 "700.HK")
   * @see https://open.longportapp.com/en/docs/quote/realtime
   */
  async getQuote(symbol: string) {
    return this.request("/v1/quote/realtime", { symbol });
  }

  /**
   * 获取 K 线数据
   *
   * @param symbol - 股票代码
   * @param period - K 线周期 (1D / 1W / 1M 等)
   * @param count  - 返回的 K 线数量
   */
  async getCandlesticks(
    symbol: string,
    period = "1D",
    count = 100
  ) {
    return this.request("/v1/quote/kline", {
      symbol,
      period,
      count: String(count),
      adjust_type: "forward",
    });
  }

  // ========================================================================
  // 自选股 API
  // ========================================================================

  /**
   * 获取自选股列表
   *
   * @see https://open.longportapp.com/en/docs/user/watchlist
   */
  async getWatchlist() {
    return this.request("/v1/user/watchlist");
  }

  // ========================================================================
  // 定投 (DCA) API
  // ========================================================================

  /**
   * 获取定投计划列表
   */
  async getDcaPlans() {
    return this.request("/v1/dca/plan/list");
  }

  /**
   * 创建定投计划
   *
   * @param plan - 定投计划参数
   */
  async createDcaPlan(plan: Record<string, unknown>) {
    return this.request("POST", "/v1/dca/plan", {}, plan);
  }
}

// ---------------------------------------------------------------------------
// 自定义错误类
// ---------------------------------------------------------------------------

/**
 * API 调用错误
 */
export class ApiError extends Error {
  /** HTTP 状态码 */
  readonly statusCode: number;
  /** 原始 API 响应 */
  readonly response: ApiResponse;

  constructor(statusCode: number, message: string, response: ApiResponse) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.response = response;
  }
}
