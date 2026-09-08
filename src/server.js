import env from './config/env.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';

// No connectDB() here (unlike Shops 1-4) — System 5 has no database of its
// own by design; all data comes from Shops 1-4's own APIs (Stage 3).

function start() {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
