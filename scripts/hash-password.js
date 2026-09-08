import { hashPassword } from '../src/utils/password.js';

const password = process.argv[2];

if (!password) {
  console.error('الاستخدام: npm run hash-password -- "كلمة السر"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ كلمة السر قصيرة جدًا — استخدم 8 حروف/أرقام على الأقل.');
  process.exit(1);
}

const hash = await hashPassword(password);

/* eslint-disable no-console -- deliberate: this is the whole point of the script, a copy-pasteable line for .env */
console.log('\nحط السطر ده في .env:\n');
console.log(`OWNER_PASSWORD_HASH=${hash}\n`);
/* eslint-enable no-console */
