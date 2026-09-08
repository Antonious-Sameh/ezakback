import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signOwnerToken, verifyOwnerToken } from '../../src/config/jwt.js';

describe('owner JWT', () => {
  it('signs a token that verifies successfully', () => {
    const token = signOwnerToken();
    expect(() => verifyOwnerToken(token)).not.toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const foreignToken = jwt.sign({}, 'a-completely-different-secret', { subject: 'owner', expiresIn: '1h' });
    expect(() => verifyOwnerToken(foreignToken)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({}, process.env.OWNER_JWT_SECRET, { subject: 'owner', expiresIn: -10 });
    expect(() => verifyOwnerToken(expired)).toThrow();
  });

  it('rejects a token with the wrong subject', () => {
    const wrongSubject = jwt.sign({}, process.env.OWNER_JWT_SECRET, { subject: 'shop', expiresIn: '1h' });
    expect(() => verifyOwnerToken(wrongSubject)).toThrow();
  });
});
