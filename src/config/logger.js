import pino from 'pino';
import env from './env.js';

// Same redaction discipline as Shops 1-4: secrets never make it into a log
// line even if some future route accidentally echoes a body/header that
// contains one. Relevant here in particular because this backend holds the
// ADMIN_READONLY_KEY for all four shops (added in Stage 2) plus its own
// owner-login secrets (Stage 4) — all worth guarding from day one.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-key"]',
  'req.body.password',
  'req.body.token',
  '*.password',
  '*.token',
  '*.adminKey',
  '*.secret',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } } }
    : {}),
});

export default logger;
