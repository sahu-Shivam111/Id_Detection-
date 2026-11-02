import logger from '../utils/logger.js';

export default function errorHandler(error, _request, response, _next) {
  logger.error(error.stack ?? error.message);
  response.status(error.status ?? 500).json({
    error: error.status ? error.message : 'Internal server error.',
  });
}
