import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatTime } from "../services/api";

const LEGEND = [
  ["bg-emerald-500", "ID visible"],
  ["bg-amber-500", "No ID · unconfirmed"],
  ["bg-red-500", "No ID · confirmed"],
  ["bg-slate-400", "Unknown"],
  ["bg-cyan-500", "Detected badge"],
  ["bg-violet-500", "Lanyard + text"],
];
const EMPTY_EVENTS = [];
const EMPTY_MATCHES = [];

function Stat({ value, label, tone }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${tone}`}>{value ?? 0}</p>
    </div>
  );
}

export default function InspectionDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("preview");
  const [search, setSearch] = useState("");
  const videoRef = useRef(null);

  useEffect(() => {
    let active = true;
    api.get(`/inspections/${id}`)
      .then((response) => {
        if (active) setData(response.data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || requestError.message);
      });
    return () => { active = false; };
  }, [id]);

  const events = data?.events || EMPTY_EVENTS;
  const matchingEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? events.filter((event) =>
        `track ${event.personTrackId} ${event.timestamp} ${event.reason || ""} ${event.note || ""}`.toLowerCase().includes(query)
      )
      : events;
  }, [events, search]);

  if (error) {
    return (
      <div role="alert" className="surface-card p-6">
        <p className="text-sm font-semibold text-red-700">{error}</p>
        <Link to="/history" className="secondary-button mt-4">Back to history</Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="surface-card space-y-3 p-5" aria-live="polite">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="aspect-video animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  const { inspection } = data;
  const companyMatches = inspection.companyMatches || EMPTY_MATCHES;
  const previewUrl = inspection.previewVideo?.url;
  const showingPreview = view === "preview" && Boolean(previewUrl);
  const videoSrc = showingPreview ? previewUrl : inspection.video.url;

  const seek = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    video.play().catch(() => {});
    video.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/history" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-700">
            <span aria-hidden="true">←</span> Inspection history
          </Link>
          <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900">{inspection.filename}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{new Date(inspection.createdAt).toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span className={`rounded-full px-2.5 py-1 font-bold capitalize ${
              inspection.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                inspection.status === "failed" ? "bg-red-50 text-red-700" :
                  inspection.status === "processing" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
            }`}>{inspection.status}</span>
          </div>
        </div>
        <Link to="/" className="secondary-button">＋ New inspection</Link>
      </section>

      {inspection.errorMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          {inspection.errorMessage}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Stat value={inspection.totalPeople} label="People in busiest frame" tone="text-slate-900" />
        <Stat value={inspection.peopleWithId} label="ID-visible tracks" tone="text-emerald-700" />
        <Stat value={inspection.peopleWithoutId} label="Confirmed no-ID tracks" tone="text-red-600" />
        <Stat value={inspection.possibleBadgeRemovals} label="Possible badge removals" tone="text-amber-700" />
        <Stat value={inspection.uncertainPeople} label="Unresolved tracks" tone="text-amber-700" />
        <Stat
          value={inspection.companyMatchCount ?? companyMatches.length}
          label="People with both matches"
          tone="text-indigo-700"
        />
      </section>
      <p className="-mt-2 text-[11px] text-slate-500">
        People in busiest frame is the maximum from one sampled frame
        {inspection.countFrameNumber > 0 && ` (frame ${inspection.countFrameNumber} at ${formatTime(inspection.countTimestamp)})`}.
        Possible removals require 2 consecutive no-ID samples after an ID was visible; a later visible sample resolves the suspicion. Confirmed no-ID tracks require 3 no-ID samples and no visible-ID samples.
      </p>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Video review</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Jump to a detection from the evidence list below.</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Select video version">
            <button
              type="button"
              onClick={() => setView("preview")}
              disabled={!previewUrl}
              aria-pressed={showingPreview}
              className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${
                showingPreview ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Detection preview
            </button>
            <button
              type="button"
              onClick={() => setView("original")}
              aria-pressed={!showingPreview}
              className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${
                !showingPreview ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Original video
            </button>
          </div>
        </div>
        <div className="bg-slate-950 p-2 sm:p-4">
          <video
            key={videoSrc}
            ref={videoRef}
            src={videoSrc}
            controls
            playsInline
            className="mx-auto max-h-[560px] w-full rounded-lg bg-black"
          />
        </div>
        {showingPreview ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            {LEGEND.map(([color, label]) => (
              <span key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
                {label}
              </span>
            ))}
            <span className="text-[10px] text-slate-400">
              Boxes and counts update once per sampled second. Lanyard labels are visual clues, not ID verdicts.
            </span>
          </div>
        ) : !previewUrl ? (
          <p className="px-5 py-3 text-xs text-slate-500">No detection preview is available for this inspection.</p>
        ) : null}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:px-5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600">Workflow clues</p>
          <h3 className="text-base font-bold text-slate-800">
            Same-frame lanyard and company-text matches
            <span className="ml-2 text-sm font-medium text-slate-400">
              ({inspection.companyMatchCount ?? companyMatches.length} people)
            </span>
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Each person is counted once. The saved frame is the first sampled frame where the Workflow associated a lanyard-color assessment and company-text match with that track. Analysis samples one frame per second.
          </p>
        </div>
        {companyMatches.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {inspection.status === "completed"
              ? "No people matched both conditions in the sampled frames."
              : "Match results will appear here when inspection processing completes."}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {companyMatches.map((match) => (
              <article
                key={`${match.personTrackId}-${match.frameNumber}`}
                className="flex flex-col items-center gap-5 p-4 sm:p-8"
              >
                <div className="grid w-full max-w-5xl place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-1 sm:p-2">
                  {match.evidenceImage?.url ? (
                    <img
                      src={match.evidenceImage.url}
                      alt={`Matching frame for track ${match.personTrackId}`}
                      loading="lazy"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">
                      Frame image unavailable
                    </div>
                  )}
                </div>
                <div className="flex w-full max-w-5xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">Track #{match.personTrackId}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Lanyard color: <strong>
                        {typeof match.lanyardColorStatus === "string"
                          ? match.lanyardColorStatus.replace(/_/g, " ")
                          : "Not reported"}
                      </strong>
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-600">
                      Company text: <strong>{match.companyText || "Match"}</strong>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Frame {match.frameNumber} at {formatTime(match.timestamp)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => seek(match.timestamp)}
                  className="secondary-button !min-h-8 !px-3"
                >
                  ▶ Play matching frame
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-600">Evidence</p>
            <h3 className="text-base font-bold text-slate-800">Badge visibility evidence <span className="ml-1 text-sm font-medium text-slate-400">({events.length} events)</span></h3>
          </div>
          {events.length > 0 && (
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search evidence</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search track or note"
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs"
              />
            </label>
          )}
        </div>

        {matchingEvents.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              {events.length === 0 ? "No badge visibility events were recorded." : "No evidence matches your search."}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {events.length === 0 ? "No-badge-on-entry and possible badge-removal events will appear here with timestamps and images." : "Try searching for another person or note."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {matchingEvents.map((event) => (
              <article key={event._id} className="p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-[9px] font-bold text-red-700">T{event.personTrackId}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Track #{event.personTrackId}</p>
                      <p className="mt-0.5 text-[10px] text-slate-600">
                        {event.reason === "possible_badge_removal"
                          ? "Possible badge removal"
                          : "No badge on entry"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">At {formatTime(event.timestamp)} · Frame {event.frameNumber}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] text-slate-500">
                      Confidence <strong className="text-slate-700">{(event.confidence * 100).toFixed(0)}%</strong>
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                      event.resolved
                        ? "bg-slate-100 text-slate-600"
                        : event.reason === "possible_badge_removal"
                          ? "bg-amber-50 text-amber-700"
                          : event.confirmed
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                    }`}>
                      {event.resolved
                        ? "Resolved"
                        : event.reason === "possible_badge_removal"
                          ? "Possible"
                          : event.confirmed
                            ? "Confirmed"
                            : "Unconfirmed"}
                    </span>
                    <button type="button" onClick={() => seek(event.timestamp)} className="primary-button !min-h-8 !px-3">
                      ▶ Play from here
                    </button>
                  </div>
                </div>
                {event.note && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{event.note}</p>}
                {event.resolved && (
                  <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    The badge was visible again later, so this removal suspicion was cleared.
                  </p>
                )}
                <div className={`grid grid-cols-1 gap-3 ${
                  event.reason === "possible_badge_removal" && event.lastIdVisibleImage?.url
                    ? "md:grid-cols-3"
                    : "md:grid-cols-2"
                }`}>
                  <figure>
                    <img src={event.originalImage.url} alt={`Original frame for person ${event.personTrackId}`} loading="lazy" className="aspect-video w-full rounded-lg bg-slate-100 object-contain" />
                    <figcaption className="mt-1.5 text-center text-[10px] font-medium text-slate-500">Original frame</figcaption>
                  </figure>
                  <figure>
                    <img src={event.annotatedImage.url} alt={`Annotated frame for person ${event.personTrackId}`} loading="lazy" className="aspect-video w-full rounded-lg bg-slate-100 object-contain" />
                    <figcaption className="mt-1.5 text-center text-[10px] font-medium text-slate-500">Annotated evidence</figcaption>
                  </figure>
                  {event.reason === "possible_badge_removal" && event.lastIdVisibleImage?.url && (
                    <figure>
                      <img
                        src={event.lastIdVisibleImage.url}
                        alt={`Last frame with ID visible for person ${event.personTrackId}`}
                        loading="lazy"
                        className="aspect-video w-full rounded-lg bg-slate-100 object-contain"
                      />
                      <figcaption className="mt-1.5 text-center text-[10px] font-medium text-slate-500">
                        Last ID-visible frame
                        {event.lastIdVisibleFrameNumber &&
                          ` · Frame ${event.lastIdVisibleFrameNumber} at ${formatTime(event.lastIdVisibleTimestamp)}`}
                      </figcaption>
                    </figure>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
