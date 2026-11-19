import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, socket, joinInspection, formatTime } from "../services/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};
const initialProgress = { processedFrames: 0, totalFrames: 0, percentage: 0 };

const formatSize = (bytes) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [progress, setProgress] = useState(initialProgress);
  const [alerts, setAlerts] = useState([]);
  const [inspectionId, setInspectionId] = useState(null);
  const [error, setError] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const videoPreviewUrl = useRef("");
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTooLargeRef = useRef(false);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl.current) URL.revokeObjectURL(videoPreviewUrl.current);
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.ondataavailable = null;
        if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const onProgress = (data) => setProgress(data);
    const onAlert = (data) => setAlerts((previous) => [...previous, data]);
    const onAlertResolved = ({ eventId }) =>
      setAlerts((previous) =>
        previous.map((alert) =>
          alert.eventId === eventId ? { ...alert, resolved: true } : alert
        )
      );
    const onComplete = () => setPhase("done");
    const onFailed = (data) => {
      setError(data.message || "Processing failed.");
      setPhase("failed");
    };

    socket.on("processing-progress", onProgress);
    socket.on("id-evidence", onAlert);
    socket.on("id-evidence-resolved", onAlertResolved);
    socket.on("processing-complete", onComplete);
    socket.on("processing-failed", onFailed);
    return () => {
      socket.off("processing-progress", onProgress);
      socket.off("id-evidence", onAlert);
      socket.off("id-evidence-resolved", onAlertResolved);
      socket.off("processing-complete", onComplete);
      socket.off("processing-failed", onFailed);
    };
  }, []);

  const selectFile = (selectedFile) => {
    if (!selectedFile) return;
    const expectedExtension = ACCEPTED_VIDEO_TYPES[selectedFile.type];
    const hasExpectedExtension =
      expectedExtension && selectedFile.name.toLowerCase().endsWith(expectedExtension);
    if (!hasExpectedExtension) {
      setError("Choose an MP4 or WebM video to continue.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("This video is larger than the 10 MB upload limit.");
      return;
    }
    if (videoPreviewUrl.current) URL.revokeObjectURL(videoPreviewUrl.current);
    videoPreviewUrl.current = URL.createObjectURL(selectedFile);
    setVideoPreview(videoPreviewUrl.current);
    setError("");
    setFile(selectedFile);
    setPhase("idle");
    setInspectionId(null);
    setAlerts([]);
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraOpen(false);
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const startCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Webcam recording is not supported by this browser. Try a current version of Chrome, Edge, or Firefox.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (cameraError) {
      const message = cameraError.name === "NotAllowedError"
        ? "Camera access was denied. Allow camera access in your browser settings and try again."
        : cameraError.name === "NotFoundError"
          ? "No camera was found on this device."
          : cameraError.message || "Could not access the camera.";
      setError(message);
    }
  };

  const startRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;

    const supportedType = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    if (!supportedType) {
      setError("This browser cannot record MP4 or WebM video.");
      return;
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: supportedType });
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingTooLargeRef.current = false;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        recordingChunksRef.current.push(event.data);
        const totalSize = recordingChunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
        if (totalSize > MAX_FILE_SIZE) {
          recordingTooLargeRef.current = true;
          recorder.stop();
        }
      };
      recorder.onerror = () => {
        setError("The browser encountered an error while recording.");
        closeCamera();
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType.split(";")[0].toLowerCase();
        const extension = ACCEPTED_VIDEO_TYPES[mimeType];
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        closeCamera();

        if (recordingTooLargeRef.current) {
          setError("The recording exceeded the 10 MB upload limit. Record a shorter clip and try again.");
          recordingTooLargeRef.current = false;
          return;
        }
        if (!extension || chunks.length === 0) {
          setError("The browser did not produce a supported video recording.");
          return;
        }
        const recordedFile = new File(chunks, `webcam-recording${extension}`, { type: mimeType });
        selectFile(recordedFile);
      };
      recorder.start(1000);
      setRecordingSeconds(0);
      setIsRecording(true);
      setError("");
    } catch (recordingError) {
      setError(recordingError.message || "Could not start recording.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const handleStart = async () => {
    if (!file) return;
    setError("");
    setAlerts([]);
    setUploadPct(0);
    setProgress(initialProgress);

    try {
      setPhase("uploading");
      const form = new FormData();
      form.append("video", file);
      const { data } = await api.post("/video/upload", form, {
        onUploadProgress: (event) => {
          if (event.total) setUploadPct(Math.round((event.loaded / event.total) * 100));
        },
      });

      const id = data.data.inspectionId;
      setInspectionId(id);
      await joinInspection(id);
      setPhase("processing");
      await api.post(`/processing/${id}/start`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
      setPhase("failed");
    }
  };

  const reset = () => {
    if (videoPreviewUrl.current) URL.revokeObjectURL(videoPreviewUrl.current);
    videoPreviewUrl.current = "";
    setVideoPreview("");
    setFile(null);
    setError("");
    setPhase("idle");
    setInspectionId(null);
    setAlerts([]);
    setProgress(initialProgress);
    setUploadPct(0);
  };

  const busy = phase === "uploading" || phase === "processing";
  const sourceBusy = busy || isRecording || cameraOpen;
  const progressValue = phase === "uploading" ? uploadPct : progress.percentage;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">
            Video analysis
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Upload or record a video to detect people and review ID-card visibility.
          </p>
        </div>
        <Link className="secondary-button" to="/history">View inspection history <span aria-hidden="true">→</span></Link>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="min-w-0 p-5 sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-lg text-indigo-700">↥</span>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Choose a video</h2>
                <p className="text-xs text-slate-500">MP4 or WebM · Up to 10 MB</p>
              </div>
            </div>

            <label
              htmlFor="video-file"
              onDragOver={(event) => {
                event.preventDefault();
                if (!sourceBusy && !cameraOpen) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!sourceBusy && !cameraOpen) selectFile(event.dataTransfer.files?.[0]);
              }}
              className={`group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-7 text-center transition ${
                sourceBusy || cameraOpen ? "pointer-events-none border-slate-200 bg-slate-50 opacity-60" : dragging ? "border-indigo-500 bg-indigo-100" : "border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50"
              }`}
            >
              <input
                id="video-file"
                type="file"
                accept="video/mp4,.mp4,video/webm,.webm"
                disabled={sourceBusy || cameraOpen}
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
                className="sr-only"
              />
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white text-xl text-indigo-700 shadow-sm">↑</span>
              <span className="text-sm font-semibold text-slate-800">
                {file ? "Choose a different video" : "Click to browse for a video"}
              </span>
              <span className="mt-1 text-xs text-slate-500">Select an MP4 or WebM file from your device</span>
            </label>

            <div className="my-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button"
              onClick={cameraOpen ? closeCamera : startCamera}
              disabled={busy || isRecording}
              className="secondary-button w-full"
            >
              <span aria-hidden="true">{cameraOpen ? "×" : "◎"}</span>
              {cameraOpen ? "Close webcam" : "Record from webcam"}
            </button>

            {file && (
              <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">▶</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatSize(file.size)} · {file.type.split("/")[1]?.toUpperCase()} video</p>
                  </div>
                </div>
                {!busy && (
                  <button type="button" onClick={reset} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                    Remove
                  </button>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            {busy && (
              <div className="mt-5 rounded-lg bg-slate-50 p-4" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-700">
                    {phase === "uploading"
                      ? uploadPct === 100 ? "Saving video…" : "Uploading video…"
                      : progress.percentage === 100 ? "Rendering preview video…" : "Analyzing video frames…"}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {phase === "uploading"
                      ? `${uploadPct}%`
                      : progress.totalFrames
                        ? `${progress.processedFrames} / ${progress.totalFrames} frames`
                        : "Preparing"}
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={progressValue} aria-valuemin="0" aria-valuemax="100">
                  <div className="progress-fill" style={{ width: `${progressValue}%` }} />
                </div>
                {phase === "processing" && (
                  <p className="mb-0 mt-2 text-[11px] text-slate-500">
                    Keep this page open to see live detection alerts.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" className="primary-button" disabled={!file || sourceBusy} onClick={handleStart}>
                {busy ? "Analysis in progress…" : "Upload and analyze"} <span aria-hidden="true">→</span>
              </button>
              {phase === "done" && inspectionId && (
                <Link to={`/inspections/${inspectionId}`} className="secondary-button">
                  Open inspection report
                </Link>
              )}
              {phase === "failed" && file && (
                <button type="button" onClick={handleStart} className="secondary-button">Try again</button>
              )}
            </div>
          </div>

          <div className="min-w-0 border-t border-slate-100 bg-slate-50/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
            <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800">Video preview</h3>
                <p className="mt-1 text-xs text-slate-500">Check the selected clip before analysis.</p>
              </div>
              {file && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">{formatSize(file.size)}</span>}
            </div>
            {cameraOpen ? (
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live webcam preview"
                className="aspect-video w-full rounded-xl bg-slate-950 object-contain shadow-sm"
              />
            ) : videoPreview ? (
              <video
                key={videoPreview}
                src={videoPreview}
                controls
                className="aspect-video w-full rounded-xl bg-slate-950 object-contain shadow-sm"
              />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-center">
                <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-xl text-slate-500">▶</span>
                <p className="text-sm font-semibold text-slate-700">Your preview will appear here</p>
                <p className="mt-1 text-xs text-slate-400">Select a video or connect your webcam</p>
              </div>
            )}
            {cameraOpen && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-600" aria-live="polite">
                  <span className={`h-2 w-2 rounded-full ${isRecording ? "animate-pulse bg-red-500" : "bg-emerald-500"}`} />
                  {isRecording
                    ? `Recording ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`
                    : "Webcam connected"}
                </p>
                {isRecording ? (
                  <button type="button" onClick={stopRecording} className="danger-button !min-h-9">
                    <span aria-hidden="true">■</span> Stop recording
                  </button>
                ) : (
                  <button type="button" onClick={startRecording} className="primary-button !min-h-9">
                    <span aria-hidden="true">●</span> Start recording
                  </button>
                )}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["01", "Upload"],
                ["02", "Analyze"],
                ["03", "Review"],
              ].map(([number, label]) => (
                <div key={number} className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
                  <span className="mr-1.5 text-[10px] font-bold text-indigo-700">{number}</span>
                  <span className="text-[10px] font-medium text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="surface-card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-600">Live detections</p>
              <h3 className="text-base font-bold text-slate-800">Badge visibility events</h3>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{alerts.length} event{alerts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => (
              <article key={alert.eventId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <img src={alert.annotatedImageUrl} alt={`Detection evidence for track ${alert.personTrackId}`} className="aspect-video w-full bg-slate-100 object-cover" />
                <div className="flex items-center justify-between gap-2 p-3 text-xs">
                  <div>
                    <strong className="text-slate-800">Track #{alert.personTrackId}</strong>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {alert.reason === "possible_badge_removal"
                        ? "Possible badge removal"
                        : "No badge on entry"}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">Frame {alert.frameNumber} · {formatTime(alert.timestamp)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${
                    alert.resolved
                      ? "bg-slate-100 text-slate-600"
                      : alert.reason === "possible_badge_removal"
                        ? "bg-amber-50 text-amber-700"
                        : alert.confirmed
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                  }`}>
                    {alert.resolved
                      ? "Resolved"
                      : alert.reason === "possible_badge_removal"
                        ? "Possible"
                        : alert.confirmed
                          ? "Confirmed"
                          : "Unconfirmed"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
