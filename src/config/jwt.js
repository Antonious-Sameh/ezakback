import jwt from 'jsonwebtoken';
import env from './env.js';

function requireSecret() {
  if (!env.OWNER_JWT_SECRET) {
    throw new Error('OWNER_JWT_SECRET is not configured — set it in your environment to issue/verify tokens.');
  }
  return env.OWNER_JWT_SECRET;
}

/**
 * Minimal payload on purpose: there is exactly one account (the business
 * owner), so there's nothing to carry beyond "this is a validly-issued
 * token" — no user id, no role, no device. `subject: 'owner'` mainly guards
 * against a token from a different service/secret ever being accepted here.
 */
export function signOwnerToken() {
  return jwt.sign({}, requireSecret(), {
    expiresIn: `${env.OWNER_TOKEN_TTL_HOURS}h`,
    subject: 'owner',
  });
}

/** Throws if the token is missing, malformed, expired, or signed with a different secret. */
export function verifyOwnerToken(token) {
  return jwt.verify(token, requireSecret(), { subject: 'owner' });
}
