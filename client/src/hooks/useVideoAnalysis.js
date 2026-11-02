import { useCallback, useRef, useState } from 'react';
import { drawPredictionOverlays } from '../utils/previewOverlay.js';
import { annotatePredictionsWithPeople } from '../utils/idStatus.js';

const REQUEST_TIMEOUT_MS = 35000;
const MAX_FRAME_WIDTH = 1280;
const MAX_SAMPLES_TO_DISPLAY = 100;

function createVideoRecorder(canvas) {
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    throw new Error('This browser does not support creating a preview video.');
  }

  const stream = canvas.captureStream(30);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  return { recorder, stream, chunks };
}

function stopRecorder(recorder) {
  if (recorder.state === 'inactive') return Promise.resolve();
  return new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.stop();
  });
}

async function createAnnotatedPreview(video, canvas, context, frames) {
  const recorderSession = createVideoRecorder(canvas);
  const originalTime = video.currentTime;
  const originalMuted = video.muted;
  let animationFrame;

  const drawCurrentFrame = () => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      let sample;
      for (const frame of frames) {
        if (frame.timeSeconds > video.currentTime) break;
        sample = frame;
      }
      if (sample) {
        drawPredictionOverlays(context, sample.predictions, canvas.width, canvas.height);
      }
    }
  };

  try {
    video.pause();
    video.muted = true;
    await seekTo(video, 0);
    drawCurrentFrame();
    recorderSession.recorder.start(1000);

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
      };
      const onEnded = () => {
        drawCurrentFrame();
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('The source video could not be played to create its annotated preview.'));
      };
      const drawLoop = () => {
        drawCurrentFrame();
        if (!video.ended) animationFrame = window.requestAnimationFrame(drawLoop);
      };

      video.addEventListener('ended', onEnded, { once: true });
      video.addEventListener('error', onError, { once: true });
      animationFrame = window.requestAnimationFrame(drawLoop);
      video.play().catch((error) => {
        cleanup();
        reject(new Error(`Unable to play the source video for preview: ${error.message}`));
      });
    });
  } finally {
    video.pause();
    await stopRecorder(recorderSession.recorder);
    recorderSession.stream.getTracks().forEach((track) => track.stop());
    video.muted = originalMuted;
    if (Number.isFinite(originalTime) && Math.abs(video.currentTime - originalTime) > 0.05) {
      await seekTo(video, Math.min(originalTime, Math.max(0, video.duration - 0.01)));
    }
  }

  return new Blob(recorderSession.chunks, {
    type: recorderSession.recorder.mimeType || 'video/webm',
  });
}

function seekTo(video, timeSeconds) {
  const waitForEvent = (eventName, errorMessage) => new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return waitForEvent('loadeddata', 'The browser could not read this video frame.')
      .then(() => seekTo(video, timeSeconds));
  }
  if (Math.abs(video.currentTime - timeSeconds) < 0.01) return Promise.resolve();

  const seeked = waitForEvent('seeked', 'The browser could not seek to this video frame.');
  video.currentTime = timeSeconds;
  return seeked;
}

function requestDetections(socket, image) {
  return new Promise((resolve, reject) => {
    socket.timeout(REQUEST_TIMEOUT_MS).emit('video:frame', { image }, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error('The detection server did not respond. Check the connection and try again.'));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else if (!response?.detections) {
        reject(new Error('The detection server returned an invalid response.'));
      } else {
        resolve(response);
      }
    });
  });
}

export default function useVideoAnalysis(socket) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [frameResponses, setFrameResponses] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const cancelledRef = useRef(false);
  const previewUrlRef = useRef('');

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
    setReport(null);
    setError('');
    setFrameResponses([]);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPreviewUrl('');
  }, []);

  const analyze = useCallback(async (video, intervalSeconds) => {
    if (!socket?.connected) {
      setError('Connect to the detection server before analyzing a video.');
      return;
    }
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      setError('The selected video is not ready or has no duration.');
      return;
    }

    const frameCanvas = document.createElement('canvas');
    const frameContext = frameCanvas.getContext('2d');
    const previewCanvas = document.createElement('canvas');
    const previewContext = previewCanvas.getContext('2d');
    if (!frameContext || !previewContext) {
      setError('This browser could not prepare video frames for analysis.');
      return;
    }

    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
    frameCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    frameCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    previewCanvas.width = frameCanvas.width;
    previewCanvas.height = frameCanvas.height;

    const total = Math.ceil(video.duration / intervalSeconds);
    const missingSamples = [];
    const annotatedFrames = [];
    let peopleObservations = 0;
    let missingIdObservations = 0;
    let framesWithMissingIds = 0;
    let framesAnalyzed = 0;
    cancelledRef.current = false;
    setBusy(true);
    setError('');
    setReport(null);
    setFrameResponses([]);
    setProgress({ current: 0, total });
    video.pause();

    try {
      for (let index = 0; index < total; index += 1) {
        if (cancelledRef.current) break;

        const timeSeconds = index * intervalSeconds;
        await seekTo(video, timeSeconds);
        frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

        const snapshot = frameCanvas.toDataURL('image/jpeg', 0.7);
        const { detections, predictions, rawResponse } = await requestDetections(socket, snapshot);
        const statusAnnotatedPredictions = annotatePredictionsWithPeople(
          detections.annotatedPredictions ?? predictions,
          detections.people,
        );
        annotatedFrames.push({ timeSeconds, predictions: statusAnnotatedPredictions });
        setFrameResponses((current) => [...current, {
          frameNumber: index + 1,
          timeSeconds,
          peopleCount: detections.people.length,
          cardCount: detections.cards.length,
          predictions,
          json: rawResponse,
        }]);
        framesAnalyzed += 1;
        const missingCount = detections.people.filter((person) => !person.hasId).length;
        peopleObservations += detections.people.length;
        missingIdObservations += missingCount;

        if (missingCount > 0) {
          framesWithMissingIds += 1;
          if (missingSamples.length < MAX_SAMPLES_TO_DISPLAY) {
            missingSamples.push({
              timeSeconds,
              peopleCount: detections.people.length,
              missingCount,
              snapshot,
            });
          }
        }

        setProgress({ current: index + 1, total });
      }

      setReport({
        fileName: video.dataset.fileName || 'Uploaded video',
        duration: video.duration,
        intervalSeconds,
        framesAnalyzed,
        peopleObservations,
        missingIdObservations,
        framesWithMissingIds,
        missingSamples,
        cancelled: cancelledRef.current,
      });
    } catch (analysisError) {
      setError(analysisError.message || 'Video analysis failed.');
    } finally {
      if (annotatedFrames.length > 0) {
        setProgress({ current: total, total, generatingPreview: true });
        try {
          const blob = await createAnnotatedPreview(
            video,
            previewCanvas,
            previewContext,
            annotatedFrames,
          );
          if (blob.size > 0) {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = URL.createObjectURL(blob);
            setPreviewUrl(previewUrlRef.current);
          }
        } catch (previewError) {
          setError((current) => current
            ? `${current} Preview video could not be created: ${previewError.message}`
            : previewError.message);
        }
      }
      setBusy(false);
    }
  }, [socket]);

  return {
    analyze, cancel, reset, busy, progress, report, error, frameResponses, previewUrl,
  };
}
