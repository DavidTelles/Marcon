const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query
      });
      req.body = parsed.body || req.body;
      req.params = parsed.params || req.params;
      req.query = parsed.query || req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(400, 'Erro de validação', error.errors));
      }
      next(error);
    }
  };
}

module.exports = { validate };
