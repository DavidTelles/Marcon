import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "@/lib/db-types";
import { currentUser } from "@/lib/auth";
import { databaseEnabled, transaction } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginBlocked, recordFailedLogin, clearFailedLogins } from "@/lib/login-rate";

export const runtime = "nodejs";

type PasswordRow = RowDataPacket & { id: number; password_hash: string };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  return NextResponse.json({ name: user.name, email: user.email, id: user.id, role: user.role, persistent: databaseEnabled() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!databaseEnabled())
    return NextResponse.json({ error: "Configure o Neon para salvar alterações no perfil." }, { status: 503 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!data || typeof data !== "object") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const values = data as Record<string, unknown>;
  const currentPassword = typeof values.currentPassword === "string" ? values.currentPassword : "";
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const email = typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const newPassword = typeof values.newPassword === "string" ? values.newPassword : "";
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190 ||
      !currentPassword || (newPassword && (newPassword.length < 12 || newPassword.length > 1024)))
    return NextResponse.json({ error: "Confira nome, e-mail, senha atual e a nova senha (mínimo 12 caracteres)." }, { status: 400 });
  const attemptKey = `profile:${user.id}`;
  if (await loginBlocked(attemptKey)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  try {
    const result = await transaction(async (connection) => {
      const [rows] = await connection.execute<PasswordRow[]>(
        "SELECT id, password_hash FROM users WHERE employee_no = ? AND active = TRUE FOR UPDATE", [user.id],
      );
      const account = rows[0];
      if (!account || !verifyPassword(currentPassword, account.password_hash)) return false;
      if (newPassword) {
        await connection.execute("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?",
          [name, email, hashPassword(newPassword), account.id]);
      } else {
        await connection.execute("UPDATE users SET name = ?, email = ? WHERE id = ?", [name, email, account.id]);
      }
      await connection.execute(
        "INSERT INTO audit_log (actor_id, entity_type, entity_id, action, details) VALUES (?, 'user', ?, 'self_update', ?)",
        [account.id, account.id, JSON.stringify({ nameChanged: name !== user.name, emailChanged: email !== user.email, passwordChanged: Boolean(newPassword) })],
      );
      return true;
    });
    if (!result) {
      await recordFailedLogin(attemptKey);
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
    }
    await clearFailedLogins(attemptKey);
    return NextResponse.json({ name, email }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY")
      return NextResponse.json({ error: "Este e-mail já está em uso." }, { status: 409 });
    throw error;
  }
}
