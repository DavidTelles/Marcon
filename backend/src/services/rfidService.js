const { PERMISSIONS, RFID_REASONS } = require('../config/constants');
const AppError = require('../utils/AppError');
const { fetchLatestTag } = require('../integrations/rfid/rfidClient');

const RFID_PATTERN = /^[0-9A-Fa-f]{8,20}$/;

function evaluateAccess(user, permissions = []) {
  if (!user) {
    return { allowed: false, reason: RFID_REASONS.TAG_NOT_FOUND };
  }
  if (!user.active) {
    return { allowed: false, reason: RFID_REASONS.USER_INACTIVE };
  }
  const enabled = user.rfid_access_enabled === undefined || Boolean(user.rfid_access_enabled);
  const hasPermission = enabled && permissions.includes(PERMISSIONS.RFID_ACCESS);
  if (!hasPermission) {
    return { allowed: false, reason: RFID_REASONS.NO_PERMISSION };
  }
  return { allowed: true, reason: RFID_REASONS.ALLOWED };
}

function normalizeTag(rfidId) {
  if (typeof rfidId !== 'string' || !RFID_PATTERN.test(rfidId)) {
    throw new AppError(400, 'Invalid rfid_id');
  }
  return rfidId.toUpperCase();
}

async function resolveTag(bodyTag, queryExternal) {
  if (bodyTag) return normalizeTag(bodyTag);
  if (queryExternal) {
    const tag = await fetchLatestTag();
    if (!tag) throw new AppError(400, 'Nenhum RFID recebido da API RFID');
    return normalizeTag(tag);
  }
  throw new AppError(400, 'Invalid rfid_id');
}

function createRfidService({ userRepository, eventRepository, permissionLoader }) {
  async function processAccess({ rfid_id, location, device, queryExternal }) {
    const tag = await resolveTag(rfid_id, queryExternal);
    const user = await userRepository.findByRfid(tag);
    const permissions = user ? await permissionLoader(user.id) : [];
    const decision = evaluateAccess(user, permissions);

    const stored = await eventRepository.create({
      rfid_id: tag,
      user_id: user ? user.id : null,
      allowed: decision.allowed,
      reason: decision.reason,
      location,
      device
    });

    return {
      ok: decision.allowed,
      allowed: decision.allowed,
      reason: decision.reason,
      reading: {
        id: stored.id,
        rfid_id: tag,
        read_in: stored.created_at || new Date().toISOString()
      },
      user: user
        ? {
            id: user.id,
            name: user.name,
            employee_code: user.employee_no,
            role: user.role,
            is_active: Boolean(user.active)
          }
        : null,
      event: stored
    };
  }

  async function listEvents(limit) {
    return eventRepository.list(limit);
  }

  return { processAccess, listEvents, evaluateAccess, normalizeTag };
}

module.exports = { createRfidService, evaluateAccess, normalizeTag, RFID_PATTERN };
