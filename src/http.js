class HttpError extends Error {
  constructor(status, message, code = 'request_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `${name} es obligatorio y debe tener como máximo ${max} caracteres`, 'invalid_input');
  }
  return value.trim();
}

function dateOrNull(value, name) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${name} no es una fecha válida`, 'invalid_input');
  return date;
}

module.exports = { HttpError, asyncRoute, text, dateOrNull };

