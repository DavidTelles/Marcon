const { evaluateAccess, normalizeTag } = require('../../src/services/rfidService');
const { PERMISSIONS, RFID_REASONS } = require('../../src/config/constants');

describe('Controle de acesso RFID', () => {
  test('RFID válido + funcionário ativo → acesso permitido', () => {
    const decision = evaluateAccess(
      { id: 1, active: 1, rfid_access_enabled: 1 },
      [PERMISSIONS.RFID_ACCESS]
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe(RFID_REASONS.ALLOWED);
  });

  test('RFID inexistente → acesso negado', () => {
    const decision = evaluateAccess(null, []);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RFID_REASONS.TAG_NOT_FOUND);
  });

  test('RFID válido + funcionário inativo → acesso negado', () => {
    const decision = evaluateAccess(
      { id: 1, active: 0, rfid_access_enabled: 1 },
      [PERMISSIONS.RFID_ACCESS]
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RFID_REASONS.USER_INACTIVE);
  });

  test('RFID válido + usuário sem permissão → acesso negado', () => {
    const decision = evaluateAccess({ id: 1, active: 1, rfid_access_enabled: 1 }, []);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RFID_REASONS.NO_PERMISSION);
  });

  test('RFID com acesso desabilitado → acesso negado', () => {
    const decision = evaluateAccess(
      { id: 1, active: 1, rfid_access_enabled: 0 },
      [PERMISSIONS.RFID_ACCESS]
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RFID_REASONS.NO_PERMISSION);
  });

  test('normalização de tag', () => {
    expect(normalizeTag('aabbccddee')).toBe('AABBCCDDEE');
    expect(() => normalizeTag('xyz')).toThrow();
    expect(() => normalizeTag(123)).toThrow();
  });
});
