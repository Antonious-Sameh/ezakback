import env from '../config/env.js';

/**
 * Thrown for any failure talking to a shop's backend — network failure,
 * timeout, non-2xx response, or a response that isn't valid JSON. Always
 * carries `shopId` so a caller aggregating across shops (Stage 5+) can
 * report exactly which shop failed without guessing from a generic message.
 */
export class ShopClientError extends Error {
  constructor(message, { shopId, status = null } = {}) {
    super(message);
    this.name = 'ShopClientError';
    this.shopId = shopId;
    this.status = status; // null = no HTTP response at all (network/timeout)

    // Makes this compatible with errorHandler.js's AppError contract without
    // importing AppError here (would create a circular-ish dependency
    // between a low-level HTTP client and the error-handling middleware).
    // `message` is always safe to show as-is — it's built from shop.name
    // plus a generic reachability/status phrase, or the shop's own message,
    // never a header or key.
    this.isOperational = true;

    // Two different kinds of failure need two different statusCodes:
    //  - The shop itself is unreachable or broken: no response at all
    //    (network/timeout, status === null), our ADMIN_READONLY_KEY was
    //    rejected (401/403 — a System 5 misconfiguration, not the caller's
    //    problem), or the shop had its own internal error (5xx). None of
    //    these are something the API consumer could fix by changing their
    //    request, so they're all reported as 502 uniformly — and crucially
    //    NEVER as 401/403, which would look to the frontend like ITS OWN
    //    System 5 session expired rather than an unrelated shop problem.
    //  - The shop responded normally but about THIS specific request being
    //    invalid (400 bad filter, 404 item not found, ...) — that status is
    //    genuinely useful to the caller and passes through unchanged, e.g.
    //    "product not found" should reach the frontend as a 404, not a
    //    vague 502 that hides a perfectly answerable question.
    const isUpstreamFailure = status === null || status === 401 || status === 403 || (status && status >= 500);
    this.statusCode = isUpstreamFailure ? 502 : status;
  }
}

/**
 * Shops 1-4 send errors as `{ success: false, error: { message } }` (nested),
 * not System 5's own flat `{ message }` — reading only `payload.message`
 * meant every real shop error (e.g. "الفاتورة غير موجودة") was replaced by
 * the generic fallback. Both shapes are accepted here.
 */
export function extractShopMessage(payload) {
  const nested = payload?.error?.message;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  const flat = payload?.message;
  if (typeof flat === 'string' && flat.trim()) return flat.trim();
  return null;
}

/**
 * The message the OWNER will read. Problems that are about the connection
 * between System 5 and the shop (key rejected, shop broken, rate limited)
 * always name the shop — the owner is looking at four shops and needs to
 * know which one — and never echo the shop's internal wording about "admin
 * keys", which means nothing to them. A shop's answer about this specific
 * request (400 bad filter, 404 not found) is passed through as-is.
 */
export function shopErrorMessage(shop, status, payload) {
  const shopMessage = extractShopMessage(payload);
  if (status === 401 || status === 403) return `${shop.name}: تعذر التحقق من مفتاح الربط مع المحل`;
  if (status === 429) return `${shop.name}: طلبات كتير على المحل في وقت قصير، حاول تاني بعد دقيقة`;
  if (status >= 500) return `${shop.name}: ${shopMessage || 'حصل خطأ في خادم المحل'}`;
  return shopMessage || `${shop.name}: رجع خطأ من الخادم`;
}

/**
 * Builds a query string from a plain params object. Skips undefined, null,
 * empty-string, and the sentinel value 'all' (the shops' own list endpoints
 * treat an omitted filter and filter=all the same way, so there's no reason
 * to send it). Shared by every stage that talks to a shop's /admin/* list
 * endpoints, so the "what counts as no filter" rule lives in exactly one
 * place.
 */
export function buildQueryString(params = {}) {
  const usable = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all',
  );
  if (usable.length === 0) return '';
  const search = new URLSearchParams();
  for (const [key, value] of usable) search.append(key, String(value));
  return `?${search.toString()}`;
}

/**
 * Calls one shop's /api/admin/{path} and returns the parsed JSON body.
 * Throws ShopClientError for every failure mode — the caller never has to
 * distinguish "network error" from "bad response" from "timeout" itself.
 *
 * `timeoutMs` is a param (not just read from env) so tests can exercise the
 * timeout path in milliseconds instead of waiting out the real 8s default.
 */
export async function fetchFromShop(shop, path, { params, timeoutMs = env.SHOP_REQUEST_TIMEOUT_MS } = {}) {
  const url = `${shop.apiUrl}/admin${path}${buildQueryString(params)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Admin-Key': shop.adminKey },
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    throw new ShopClientError(
      isTimeout ? `${shop.name}: انتهت مهلة الاتصال` : `${shop.name}: تعذر الاتصال بالمحل`,
      { shopId: shop.id },
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    throw new ShopClientError(shopErrorMessage(shop, response.status, payload), {
      shopId: shop.id,
      status: response.status,
    });
  }

  return payload;
}

/**
 * Calls the same path on every configured shop in parallel and never
 * rejects — each shop either succeeds or fails independently, so one shop
 * being down never prevents the other three from showing up. Callers
 * (Stage 5's /api/shops, Stage 6's compare report) decide how to render a
 * failed entry; this layer's only job is to not let one bad shop take down
 * the whole response.
 */
export async function fetchFromAllShops(shops, path, options = {}) {
  const settled = await Promise.allSettled(shops.map((shop) => fetchFromShop(shop, path, options)));

  return settled.map((result, index) => {
    const shop = shops[index];
    if (result.status === 'fulfilled') {
      return { shopId: shop.id, name: shop.name, ok: true, data: result.value, error: null };
    }
    return {
      shopId: shop.id,
      name: shop.name,
      ok: false,
      data: null,
      error: result.reason?.message || 'خطأ غير معروف',
    };
  });
}
