const request = require('supertest');
const createApp = require('../../src/app');
const { authorize } = require('../../src/middlewares/auth');

test.each(['/register', '/admin/create', '/api/workspace/actions', '/api/stock/in'])('%s exige sessão antes de consultar o banco', async (path) => {
  const response = await request(createApp()).post(path).send({ role: 'ADMIN', name: 'Sem sessão' });
  expect(response.status).toBe(401);
});

test('restrição individual bloqueia administrador na autorização REST', () => {
  const next = jest.fn();
  authorize('ADMIN', 'stock.manage')({ user: { roleCode: 'ADMIN', permissionOverrides: { 'stock.manage': false } } }, {}, next);
  expect(next.mock.calls[0][0].statusCode).toBe(403);
});
