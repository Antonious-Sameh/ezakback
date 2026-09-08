import { Router } from 'express';

const router = Router();

// Deliberately no DB/dependency check here — System 5 has no database of
// its own to check. A real end-to-end check ("can we actually reach all
// four shops?") is a job for a separate readiness endpoint once Stage 3
// (the shop client) exists, not for this liveness probe.
router.get('/', (req, res) => {
  res.json({ success: true, status: 'ok', service: 'system5-backend' });
});

export default router;
