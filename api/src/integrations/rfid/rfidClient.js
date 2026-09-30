const env = require('../../config/env');
const AppError = require('../../utils/AppError');

async function fetchLatestTag() {
  if (!env.rfid.apiUrl) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.rfid.timeoutMs);

  try {
    const response = await fetch(env.rfid.apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(env.rfid.apiKey ? { 'x-api-key': env.rfid.apiKey } : {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new AppError(502, 'Falha na API RFID', { status: response.status });
    }

    const body = await response.json();
    const tag = body.rfid_id || body.uid || body.tag || null;
    return tag ? String(tag).toUpperCase() : null;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError(504, 'Timeout da API RFID');
    }
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'API RFID indisponível');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchLatestTag };
