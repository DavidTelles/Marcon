const path = require('node:path');

// Frontend, backend, migrations and seed use one root .env file.
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(path.resolve(__dirname, '../../..'));

const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  rfid: {
    apiUrl: process.env.RFID_API_URL || '',
    apiKey: process.env.RFID_API_KEY || '',
    timeoutMs: Number(process.env.RFID_TIMEOUT_MS || 4000)
  },
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

if (!env.jwt.secret || (env.nodeEnv !== 'test' && (env.jwt.secret.length < 32 || /^(change-|gere-|banana)/i.test(env.jwt.secret)))) {
  throw new Error('JWT_SECRET aleatória com pelo menos 32 caracteres é obrigatória');
}

module.exports = env;
