import bcrypt from 'bcryptjs';

export function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}

export function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}
