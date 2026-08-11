// Parol xeshini yaratadi:  node scripts/hash.js "parol"
const bcrypt = require('bcryptjs');
const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Foydalanish: node scripts/hash.js "kamida-10-belgili-parol"');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
