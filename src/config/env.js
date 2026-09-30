import dotenv from 'dotenv';
import { z } from 'zod';

// Tests must never read the developer's real .env: it holds the live shops'
// URLs + read keys, so a test could silently hit a real shop, and any test
// that clears SHOP* vars and re-imports config (vi.resetModules) would get
// them re-loaded from disk. Tests set everything they need in tests/setup.js.
if (process.env.NODE_ENV !== 'test') dotenv.config();

/**
 * Stage 1-2 scope: server boot, health check, and the raw connection
 * details for Shops 1-4. The derived, validated shop list (used by every
 * later stage) lives in ./shops.js, not here — this file only parses raw
 * env vars. Owner-login secrets (Stage 4) get added to this schema when
 * that stage lands.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Comma-separated list of origins allowed to call this API — set to
  // System 5's own frontend URL once it's deployed (see app.js).
  CORS_ORIGINS: z.string().trim().optional().default(''),

  // ── Stage 2: connection details for Shops 1-4 ───────────────────────────
  // Each shop's own backend, and the ADMIN_READONLY_KEY generated for it
  // when /api/admin/* was added there. These are the ONLY credentials this
  // service holds for the shops — never a JWT secret, never a MongoDB URI,
  // never a Cloudinary key. Optional at the schema level (so Stage 1's
  // tests and any environment not yet fully configured don't break), but
  // validated as a set below: a shop is either fully configured (URL + key)
  // or not configured at all — never half.
  SHOP1_NAME: z.string().trim().optional().default('المحل الأول'),
  SHOP1_API_URL: z.string().trim().url().optional(),
  SHOP1_ADMIN_KEY: z.string().trim().optional(),

  SHOP2_NAME: z.string().trim().optional().default('المحل الثاني'),
  SHOP2_API_URL: z.string().trim().url().optional(),
  SHOP2_ADMIN_KEY: z.string().trim().optional(),

  SHOP3_NAME: z.string().trim().optional().default('المحل الثالث'),
  SHOP3_API_URL: z.string().trim().url().optional(),
  SHOP3_ADMIN_KEY: z.string().trim().optional(),

  SHOP4_NAME: z.string().trim().optional().default('المحل الرابع'),
  SHOP4_API_URL: z.string().trim().url().optional(),
  SHOP4_ADMIN_KEY: z.string().trim().optional(),

  // How long to wait for one shop's backend before giving up on it (Stage 3
  // uses this). Kept short and finite on purpose — with 4 shops queried in
  // parallel, one hung backend must not stall the whole dashboard request.
  SHOP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  // ── Stage 4: System 5's own owner login ─────────────────────────────────
  // Deliberately NOT reusing anything from the shops' own auth (nor from
  // ADMIN_READONLY_KEY, which is for server-to-server calls, not a human
  // login). System 5 has exactly one account — the business owner — so
  // there's no user/device/role model to build: a single bcrypt hash and a
  // JWT secret is the whole mechanism. No database needed: the hash lives
  // directly in the env, generated once with `npm run hash-password`.
  OWNER_PASSWORD_HASH: z.string().trim().optional(),
  OWNER_JWT_SECRET: z.string().trim().optional(),
  OWNER_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && !env.OWNER_PASSWORD_HASH) {
  console.error('❌ OWNER_PASSWORD_HASH is required when NODE_ENV=production');
  process.exit(1);
}

if (env.NODE_ENV === 'production' && !env.OWNER_JWT_SECRET) {
  console.error('❌ OWNER_JWT_SECRET is required when NODE_ENV=production');
  process.exit(1);
}

export const CORS_ORIGINS = env.CORS_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export default env;
