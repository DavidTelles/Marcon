require('dotenv').config();

const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'marcon',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marcon'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  rfid: {
    apiUrl: process.env.RFID_API_URL || '',
    apiKey: process.env.RFID_API_KEY || '',
    timeoutMs: Number(process.env.RFID_TIMEOUT_MS || 4000)
  },
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

if (!env.jwt.secret && env.nodeEnv !== 'test') {
  throw new Error('JWT_SECRET is required');
}

module.exports = env;
