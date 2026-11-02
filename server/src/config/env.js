import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 5000);
const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.4);
const roboflowTimeoutMs = Number(process.env.ROBOFLOW_TIMEOUT_MS ?? 30000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
  throw new Error('CONFIDENCE_THRESHOLD must be between 0 and 1.');
}
if (!Number.isInteger(roboflowTimeoutMs) || roboflowTimeoutMs < 1) {
  throw new Error('ROBOFLOW_TIMEOUT_MS must be a positive integer.');
}

export default Object.freeze({
  port,
  roboflowApiKey: process.env.ROBOFLOW_API_KEY ?? '',
  workflowUrl: process.env.WORKFLOW_URL ?? '',
  confidenceThreshold,
  roboflowTimeoutMs,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
});
