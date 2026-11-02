import { getHealthStatus } from '../services/health.service.js';

export function getHealth(_request, response) {
  const health = getHealthStatus();
  response.status(health.httpStatus).json({
    status: health.status,
  });
}
