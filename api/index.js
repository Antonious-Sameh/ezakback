import { createApp } from '../src/app.js';

// Simpler than Shops 1-4's entrypoint: no connectDB() step, since System 5
// has no database of its own — every request either serves from Stage 3's
// shop client (calls out to Shops 1-4) or is stateless.
const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}
