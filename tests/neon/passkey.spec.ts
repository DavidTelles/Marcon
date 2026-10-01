import { test, expect } from '@playwright/test';
import neon, { type ResultSetHeader } from "../neon-test-db";
import { hashPassword } from '../../lib/password';

test('passkey: cadastro, login, resposta vazia e desafio reutilizado', async ({ page, context }) => {
  const pool = neon.createPool();
  const identity = `pk_${Date.now()}`;
  const password = 'Passkey-Test-Only!93';
  let userId: number | undefined;
  try {
    const [insert] = await pool.execute<ResultSetHeader>(
      "INSERT INTO users (employee_no, name, email, password_hash, role, sector) VALUES (?, ?, ?, ?, 'admin', 'Teste')",
      [identity, 'Teste Passkey', `${identity}@example.test`, hashPassword(password)],
    );
    userId = insert.insertId;
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } });
    await page.goto('/login');
    const login = await page.evaluate(async ({ identity, password }) => {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity, password }) });
      return r.status;
    }, { identity, password });
    expect(login).toBe(200);
    await page.goto('/profile');
    const section = page.getByRole('region', { name: 'Passkey do dispositivo' });
    await section.getByLabel('Confirme sua senha atual').fill(password);
    await page.route('**/api/passkey', route => route.fulfill({ status: 503, body: '' }));
    await section.getByRole('button', { name: 'Cadastrar passkey' }).click();
    await expect(section.getByRole('alert')).toContainText('resposta inválida');
    await page.unroute('**/api/passkey');
    await section.getByLabel('Confirme sua senha atual').fill('incorreta');
    await section.getByRole('button', { name: 'Cadastrar passkey' }).click();
    await expect(section.getByRole('alert')).toContainText('Senha atual incorreta');
    await section.getByLabel('Confirme sua senha atual').fill(password);
    await section.getByRole('button', { name: 'Cadastrar passkey' }).click();
    await expect(section.getByText('Passkey cadastrada. Ela já pode ser usada no login.')).toBeVisible();
    await context.clearCookies();
    await page.goto('/login');
    await page.locator('input').first().fill(identity);
    await page.getByRole('button', { name: 'Entrar com passkey', exact: true }).click();
    const verified = page.waitForResponse(r => r.url().endsWith('/api/passkey') && r.request().postDataJSON().action === 'login-verify');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const response = await verified;
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(/\/inicio\/admin/);
    const replay = await page.evaluate(async body => {
      const r = await fetch('/api/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }, response.request().postDataJSON());
    expect(replay.status).toBe(400);
    expect(replay.body.error).toContain('expirada');
  } finally {
    if (userId) await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    await pool.end();
  }
});
