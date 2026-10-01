// Senhas do banco unificado usam scrypt (formato scrypt$salt$digest), o mesmo
// do frontend. Mantida a interface async para compatibilidade com os testes.
const { hashPassword: scryptHash, verifyPassword } = require('../workspace/password');

async function hashPassword(plain) {
  return scryptHash(plain);
}

async function comparePassword(plain, hash) {
  return verifyPassword(plain, hash);
}

module.exports = { hashPassword, comparePassword };
