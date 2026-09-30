// Configuração compartilhada pela aplicação, migração, seed e testes.
export function databaseConfigured(env = process.env) {
  return Boolean(env.DB_NAME || env.DB_USER || env.DATABASE_URL);
}

export function databaseConfig(env = process.env, withoutDatabase = false) {
  // Os campos separados têm prioridade quando configurados.
  if (env.DB_NAME || env.DB_USER) {
    if (!env.DB_NAME || !env.DB_USER) throw new Error("Defina DB_NAME e DB_USER.");
    const port = Number(env.DB_PORT || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DB_PORT inválida.");
    return {
      host: env.DB_HOST || "127.0.0.1",
      port,
      user: env.DB_USER,
      password: env.DB_PASSWORD || "",
      database: withoutDatabase ? undefined : env.DB_NAME,
    };
  }
  let url;
  try {
    url = new URL(env.DATABASE_URL || "");
    if (url.protocol !== "mysql:" || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch {
    throw new Error("Configure DB_NAME e DB_USER ou uma DATABASE_URL válida (mysql://usuario:senha@host:3306/banco).");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (withoutDatabase) url.pathname = "/";
  return { uri: url.toString(), database: withoutDatabase ? undefined : database };
}
