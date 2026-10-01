const env = require('./src/config/env');
const createApp = require('./src/app');

const app = createApp();

if (require.main === module) {
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`MARCON API running on ${env.port}`);
    console.log(`Swagger: http://localhost:${env.port}/api-docs`);
  });
}

module.exports = app;
