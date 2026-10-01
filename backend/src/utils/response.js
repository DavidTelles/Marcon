function success(res, status, data, message) {
  return res.status(status).json({
    ok: true,
    message: message || undefined,
    data
  });
}

module.exports = { success };
