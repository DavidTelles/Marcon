const { signToken, verifyToken } = require('../../src/utils/token');
const { hashPassword, comparePassword } = require('../../src/utils/password');

describe('Autenticação JWT e senha', () => {
  test('gera e valida token', () => {
    const token = signToken({ sub: 1, role: 'ADMIN' });
    const payload = verifyToken(token);
    expect(payload.sub).toBe(1);
    expect(payload.role).toBe('ADMIN');
  });

  test('token inválido', () => {
    expect(() => verifyToken('abc.def.ghi')).toThrow();
  });

  test('token expirado', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET, { expiresIn: '0s' });
    expect(() => verifyToken(token)).toThrow();
  });

  test('senha nunca permanece em texto puro', async () => {
    const hash = await hashPassword('SenhaForte@123');
    expect(hash).not.toBe('SenhaForte@123');
    expect(await comparePassword('SenhaForte@123', hash)).toBe(true);
    expect(await comparePassword('errada', hash)).toBe(false);
  });
});
