import { detect } from '../services/roboflow.service.js';
import { classifyDetections } from '../services/detection.service.js';
import { validateFrame } from '../utils/validateFrame.js';
import logger from '../utils/logger.js';

export function registerFrameHandler(socket) {
  let processing = false;

  const getInferenceErrorMessage = (error) => (
    [401, 403].includes(error.response?.status)
      ? 'Roboflow rejected the API key.'
      : error.code === 'ECONNABORTED'
        ? 'Roboflow request timed out.'
        : 'Detection service is unavailable.'
  );

  socket.on('video:frame', async (payload, acknowledge) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    const frame = validateFrame(payload);
    if (!frame.valid) {
      reply({ error: frame.error });
      return;
    }
    if (processing) {
      reply({ error: 'Another video frame is being processed. Try again shortly.' });
      return;
    }

    processing = true;
    try {
      const { predictions, rawResponse } = await detect(frame.buffer);
      const detections = classifyDetections(predictions);
      reply({
        detections,
        predictions: detections.annotatedPredictions,
        rawResponse,
      });
    } catch (error) {
      logger.error(`Video frame inference failed: ${error.message}`);
      reply({ error: getInferenceErrorMessage(error) });
    } finally {
      processing = false;
    }
  });
}
