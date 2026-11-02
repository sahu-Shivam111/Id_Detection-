import { useEffect, useRef, useState } from 'react';
import Banner from '../common/Banner.jsx';
import useVideoAnalysis from '../../hooks/useVideoAnalysis.js';

const SAMPLE_INTERVALS = [1, 2, 5];

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function VideoAnalyzer({ socket, connected }) {
  const videoRef = useRef(null);
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [intervalSeconds, setIntervalSeconds] = useState(1);
  const [fileError, setFileError] = useState('');
  const {
    analyze, cancel, reset, busy, progress, report, error, frameResponses, previewUrl,
  } = useVideoAnalysis(socket);

  useEffect(() => {
    if (!file) {
      setVideoUrl('');
      setDuration(0);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onFileChange = (event) => {
    const nextFile = event.target.files?.[0] ?? null;
    reset();
    setFileError('');
    if (nextFile && nextFile.type && !nextFile.type.startsWith('video/')) {
      setFile(null);
      setFileError('Choose a video file supported by your browser.');
      event.target.value = '';
      return;
    }
    setFile(nextFile);
    setDuration(0);
  };

  const startAnalysis = () => {
    const video = videoRef.current;
    if (video && file) {
      video.dataset.fileName = file.name;
      analyze(video, intervalSeconds);
    }
  };

  return (
    <section className="panel video-panel">
      <div className="panel-heading">
        <div>
          <h2>Analyze a video</h2>
          <p>Upload a recording to check sampled frames for missing ID cards.</p>
        </div>
      </div>

      <label className="video-file-control">
        <span>Video file</span>
        <input type="file" accept="video/*" onChange={onFileChange} disabled={busy} />
      </label>
      {file && <p className="video-file-name">{file.name}</p>}
      {fileError && <Banner tone="error">{fileError}</Banner>}

      {videoUrl && (
        <video
          ref={videoRef}
          className="video-preview"
          src={videoUrl}
          controls
          preload="metadata"
          onLoadedMetadata={(event) => {
            const videoDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(videoDuration) ? videoDuration : 0);
          }}
          onError={() => setFileError('The browser could not open this video format.')}
        />
      )}

      <div className="video-analysis-controls">
        <label className="device-control">
          Sample every
          <select
            value={intervalSeconds}
            onChange={(event) => setIntervalSeconds(Number(event.target.value))}
            disabled={busy}
          >
            {SAMPLE_INTERVALS.map((seconds) => (
              <option key={seconds} value={seconds}>{seconds} second{seconds > 1 ? 's' : ''}</option>
            ))}
          </select>
        </label>
        {!busy ? (
          <button
            type="button"
            className="button button-primary"
            onClick={startAnalysis}
            disabled={!file || !duration || !connected}
          >
            Analyze video
          </button>
        ) : (
          <button type="button" className="button button-secondary" onClick={cancel}>
            Cancel analysis
          </button>
        )}
      </div>

      {!connected && <p className="video-help">Waiting for the detection server connection.</p>}
      <p className="video-help">Video stays in your browser; sampled frames are sent to the configured detection service.</p>
      {error && <Banner tone="error">{error}</Banner>}
      {busy && progress && (
        <div className="video-progress" role="status">
          <span>
            {progress.generatingPreview
              ? 'Creating annotated preview at source speed…'
              : `Analyzing frame ${progress.current} of ${progress.total}`}
          </span>
          <progress value={progress.current} max={progress.total} />
        </div>
      )}
      {frameResponses.length > 0 && (
        <section className="frame-responses">
          <h3>Roboflow responses by frame ({frameResponses.length})</h3>
          <div className="frame-response-list">
            {frameResponses.map((frame) => (
              <details className="roboflow-response" key={frame.frameNumber}>
                <summary>Frame {frame.frameNumber} · {formatTime(frame.timeSeconds)}</summary>
                <p className="frame-response-summary">
                  Parsed by app: {frame.peopleCount} people, {frame.cardCount} ID cards,
                  {` ${frame.predictions.length} predictions total.`}
                </p>
                {frame.predictions.length > 0 && (
                  <pre className="parsed-predictions">
                    {JSON.stringify(frame.predictions, null, 2)}
                  </pre>
                )}
                <pre>{JSON.stringify(frame.json, null, 2)}</pre>
              </details>
            ))}
          </div>
        </section>
      )}
      {previewUrl && (
        <section className="annotated-preview">
          <h3>Annotated preview video</h3>
          <p className="video-help">
            Person boxes: green = ID found, red = ID missing, yellow = uncertain.
            ID-card boxes are green. Preview has no audio.
          </p>
          <video className="video-preview" src={previewUrl} controls />
          <a
            className="button button-primary preview-download"
            href={previewUrl}
            download={`${file?.name.replace(/\.[^.]+$/, '') || 'video'}-annotated.webm`}
          >
            Download preview video
          </a>
        </section>
      )}

      {report && (
        <div className="video-report">
          <h3>{report.cancelled ? 'Partial analysis' : 'Analysis results'}</h3>
          <p className="video-report-name">{report.fileName} · {formatTime(report.duration)} total</p>
          <div className="video-summary">
            <div><strong>{report.framesAnalyzed}</strong><span>Frames analyzed</span></div>
            <div><strong>{report.peopleObservations}</strong><span>People observations</span></div>
            <div><strong>{report.missingIdObservations}</strong><span>Missing-ID observations</span></div>
            <div><strong>{report.framesWithMissingIds}</strong><span>Frames with missing IDs</span></div>
          </div>
          {report.framesWithMissingIds > 0 ? (
            <>
              <h4>Frames with possible violations</h4>
              <div className="video-results">
                {report.missingSamples.map((sample) => (
                  <article className="video-result" key={sample.timeSeconds}>
                    <img src={sample.snapshot} alt={`Video frame at ${formatTime(sample.timeSeconds)}`} />
                    <div>
                      <strong>{formatTime(sample.timeSeconds)}</strong>
                      <span>{sample.missingCount} missing ID{sample.missingCount === 1 ? '' : 's'}</span>
                      <span>{sample.peopleCount} people detected</span>
                    </div>
                  </article>
                ))}
              </div>
              {report.framesWithMissingIds > report.missingSamples.length && (
                <p className="video-help">
                  Showing the first {report.missingSamples.length} of {report.framesWithMissingIds} flagged frames.
                </p>
              )}
            </>
          ) : (
            <p className="video-help">No missing-ID observations were found in the analyzed frames.</p>
          )}
        </div>
      )}
    </section>
  );
}
