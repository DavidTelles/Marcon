const asyncHandler = require('../utils/asyncHandler');
const { rfidService } = require('../services/container');

const ingest = asyncHandler(async (req, res) => {
  const result = await rfidService.processAccess({
    rfid_id: req.body?.rfid_id,
    location: req.body?.location,
    device: req.body?.device || req.headers['x-rfid-device'],
    queryExternal: Boolean(req.body?.query_external)
  });
  const status = result.allowed ? 201 : 200;
  res.status(status).json({
    ok: result.ok,
    allowed: result.allowed,
    reason: result.reason,
    reading: result.reading,
    user: result.user
  });
});

const list = asyncHandler(async (req, res) => {
  const events = await rfidService.listEvents(req.query.limit || 200);
  const readings = events.map((e) => ({
    id: e.id,
    rfid_id: e.rfid_id,
    read_in: e.created_at,
    allowed: Boolean(e.allowed),
    reason: e.reason,
    user_id: e.user_id,
    user_name: e.user_name,
    location: e.location,
    device: e.device
  }));
  res.json(readings);
});

module.exports = { ingest, list };
