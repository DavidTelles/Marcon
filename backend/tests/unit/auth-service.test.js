jest.mock('../../src/repositories/userRepository', () => ({
  findByEmail: jest.fn(), findByEmployeeCode: jest.fn(),
  getPermissionsForUser: jest.fn(), publicUser: jest.fn(user => ({ id: user.id })),
  create: jest.fn(), update: jest.fn()
}));
jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const repository = require('../../src/repositories/userRepository');
const { query } = require('../../src/config/db');
const auth = require('../../src/services/authService');
const { hashPassword, comparePassword } = require('../../src/utils/password');

describe('Serviço de autenticação com senhas assíncronas', () => {
  const password = 'TestPassword@12345';
  let user;
  beforeEach(async () => {
    jest.clearAllMocks();
    user = { id: 1, employee_no: '1004', role: 'admin', active: 1, password_hash: await hashPassword(password) };
    repository.findByEmail.mockResolvedValue(user);
    repository.getPermissionsForUser.mockResolvedValue([]);
  });

  test('rejeita senha incorreta para uma conta existente', async () => {
    await expect(auth.login({ login: '1004', password: 'incorrect-password' })).rejects.toMatchObject({ statusCode: 401 });
    expect(repository.getPermissionsForUser).not.toHaveBeenCalled();
  });
  test('aceita senha correta e emite JWT', async () => {
    await expect(auth.login({ login: '1004', password })).resolves.toMatchObject({ token: expect.any(String), user: { id: 1 } });
  });
  test('cadastro grava hash resolvido', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.findByEmployeeCode.mockResolvedValue(null);
    repository.create.mockResolvedValue(user);
    await auth.register({ id: '1004', password, role: 'admin' }, { roleCode: 'ADMIN' });
    const stored = repository.create.mock.calls[0][0].password_hash;
    expect(typeof stored).toBe('string');
    expect(await comparePassword(password, stored)).toBe(true);
  });
  test('redefinição grava hash resolvido', async () => {
    query.mockResolvedValueOnce([{ id: 1, user_id: 1 }]).mockResolvedValueOnce([]);
    await auth.resetPassword({ token: 'test-reset-token', password });
    const stored = repository.update.mock.calls[0][1].password_hash;
    expect(typeof stored).toBe('string');
    expect(await comparePassword(password, stored)).toBe(true);
  });
});
