export function databaseConfigured(env = process.env) {
  return /^postgres(ql)?:\/\//i.test(env.DATABASE_URL || "");
}
