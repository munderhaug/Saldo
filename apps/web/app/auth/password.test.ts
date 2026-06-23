import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.server.js';

// Pure unit test (no Docker) — argon2id via @node-rs/argon2, prebuilt binary on linux-x64.
describe('password hashing (argon2id)', () => {
  it('hashes to an argon2id PHC string and verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('uses a random salt (same input → different hash)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});
