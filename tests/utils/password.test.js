import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../src/utils/password.js';

describe('hashPassword / comparePassword', () => {
  it('produces a hash that comparePassword confirms against the original password', async () => {
    const hash = await hashPassword('a-strong-password-1');
    await expect(comparePassword('a-strong-password-1', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password against a real hash', async () => {
    const hash = await hashPassword('a-strong-password-1');
    await expect(comparePassword('a-different-password', hash)).resolves.toBe(false);
  });

  it('never returns the plaintext password as the hash', async () => {
    const hash = await hashPassword('a-strong-password-1');
    expect(hash).not.toBe('a-strong-password-1');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt format
  });
});
