import axios from 'axios';
import config from '../config/env.js';

function getClassName(prediction) {
  const value = prediction.class
    ?? prediction.class_name
    ?? prediction.className
    ?? prediction.label
    ?? prediction.category;
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (value && typeof value === 'object') {
    return String(value.name ?? value.class ?? '').trim().toLowerCase();
  }
  return '';
}

function getBoundingBox(prediction) {
  const box = prediction.bounding_box
    ?? prediction.boundingBox
    ?? prediction.bbox
    ?? prediction.box;
  if (Array.isArray(box) && box.length >= 4) {
    const [x, y, width, height] = box.map(Number);
    if ([x, y, width, height].every(Number.isFinite)) {
      return { x, y, width, height };
    }
  }
  if (box && typeof box === 'object') {
    const x = Number(box.x ?? box.center_x);
    const y = Number(box.y ?? box.center_y);
    const width = Number(box.width ?? box.w);
    const height = Number(box.height ?? box.h);
    if ([x, y, width, height].every(Number.isFinite)) {
      return { x, y, width, height };
    }
  }

  const x = Number(prediction.x ?? prediction.center_x);
  const y = Number(prediction.y ?? prediction.center_y);
  const width = Number(prediction.width ?? prediction.w);
  const height = Number(prediction.height ?? prediction.h);
  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height };
  }

  const left = Number(prediction.left);
  const top = Number(prediction.top);
  const right = Number(prediction.right);
  const bottom = Number(prediction.bottom);
  if ([left, top, right, bottom].every(Number.isFinite)) {
    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      width: right - left,
      height: bottom - top,
    };
  }
  return null;
}

function getConfidence(prediction) {
  const value = prediction.confidence ?? prediction.score ?? prediction.probability;
  if (value === undefined || value === null || value === '') return 1;
  const isPercentage = typeof value === 'string' && value.trim().endsWith('%');
  const confidence = Number(isPercentage ? value.trim().slice(0, -1) : value);
  if (!Number.isFinite(confidence)) return Number.NaN;
  return isPercentage || (confidence > 1 && confidence <= 100)
    ? confidence / 100
    : confidence;
}

function collectPredictions(value, output, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectPredictions(item, output, depth + 1));
    return;
  }

  const className = getClassName(value);
  if (className) {
    const box = getBoundingBox(value);
    const confidence = getConfidence(value);
    if (Number.isFinite(confidence)) {
      output.push({
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        hasBoundingBox: Boolean(box),
        class: className,
        confidence,
      });
    }
    return;
  }

  Object.values(value).forEach((item) => collectPredictions(item, output, depth + 1));
}

export function extractPredictions(response) {
  const predictions = [];
  collectPredictions(response, predictions);
  return predictions;
}

export async function detect(buffer) {
  if (!config.workflowUrl) {
    throw new Error('WORKFLOW_URL is not configured.');
  }
  if (!config.roboflowApiKey) {
    throw new Error('ROBOFLOW_API_KEY is not configured.');
  }

  const { data } = await axios.post(
    config.workflowUrl,
    {
      api_key: config.roboflowApiKey,
      inputs: {
        image: { type: 'base64', value: buffer.toString('base64') },
      },
    },
    { timeout: config.roboflowTimeoutMs },
  );

  return {
    rawResponse: data,
    predictions: extractPredictions(data),
  };
}
