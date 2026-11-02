import { getIdStatus } from './idStatus.js';

function normalizeClass(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s-]/g, '');
}

export function getOverlayStyle(prediction) {
  const className = normalizeClass(prediction.class);
  if (['idcard', 'icard'].includes(className)) {
    return { color: '#20c997', label: 'ID CARD' };
  }
  if (!['person', 'people'].includes(className)) {
    return { color: '#4268c5', label: String(prediction.class ?? 'DETECTION').toUpperCase() };
  }

  const status = getIdStatus(prediction);
  if (status === 'present') return { color: '#16a36a', label: 'PERSON · ID PRESENT' };
  if (status === 'missing') return { color: '#dc3545', label: 'PERSON · ID MISSING' };
  return { color: '#e5a900', label: 'PERSON · ID UNCERTAIN' };
}

export function getOverlayBounds(prediction, width, height) {
  const x = Number(prediction.x);
  const y = Number(prediction.y);
  const boxWidth = Number(prediction.width);
  const boxHeight = Number(prediction.height);
  if (![x, y, boxWidth, boxHeight].every(Number.isFinite) || boxWidth <= 0 || boxHeight <= 0) {
    return null;
  }

  const normalized = [x, y, boxWidth, boxHeight].every((value) => Math.abs(value) <= 1);
  const scaleX = normalized ? width : 1;
  const scaleY = normalized ? height : 1;
  const scaledWidth = boxWidth * scaleX;
  const scaledHeight = boxHeight * scaleY;
  return {
    left: x * scaleX - scaledWidth / 2,
    top: y * scaleY - scaledHeight / 2,
    width: scaledWidth,
    height: scaledHeight,
  };
}

export function drawPredictionOverlays(context, predictions, width, height) {
  context.save();
  context.font = 'bold 16px sans-serif';
  context.textBaseline = 'middle';

  predictions.forEach((prediction) => {
    if (prediction.hasBoundingBox === false) return;
    const bounds = getOverlayBounds(prediction, width, height);
    if (!bounds) return;
    const { color, label } = getOverlayStyle(prediction);
    const confidence = Number(prediction.confidence);
    const confidenceLabel = Number.isFinite(confidence)
      ? ` ${Math.round(confidence * 100)}%`
      : '';
    const tag = `${label}${confidenceLabel}`;
    const tagWidth = context.measureText(tag).width + 12;
    const tagHeight = 24;
    const tagTop = Math.max(0, bounds.top - tagHeight);

    context.strokeStyle = color;
    context.lineWidth = Math.max(3, width / 300);
    context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    context.fillStyle = color;
    context.fillRect(bounds.left, tagTop, tagWidth, tagHeight);
    context.fillStyle = '#ffffff';
    context.fillText(tag, bounds.left + 6, tagTop + tagHeight / 2);
  });

  context.restore();
}
