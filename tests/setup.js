process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.OWNER_JWT_SECRET = process.env.OWNER_JWT_SECRET || 'test-only-owner-jwt-secret-not-for-production';
// bcrypt hash of "test-password-123", generated once for test fixtures.
process.env.OWNER_PASSWORD_HASH =
  process.env.OWNER_PASSWORD_HASH || '$2a$10$ZICEXFqjhfW352PzAAt/OunnvnNZ3mllET/ByM2yjsA2v08AcYBuW';
