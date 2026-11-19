import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

const EMPTY_DASHBOARD = {
  totals: {
    completedInspections: 0,
    idVisibleTracks: 0,
    confirmedNoIdTracks: 0,
    peopleWithBothMatches: 0,
    possibleBadgeRemovals: 0,
  },
  recentInspections: [],
};

const metrics = [
  {
    key: "idVisibleTracks",
    label: "ID-visible tracks",
    description: "Tracks with an ID visible",
    icon: "ID",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "confirmedNoIdTracks",
    label: "Confirmed no-ID tracks",
    description: "Tracks confirmed without an ID",
    icon: "!",
    tone: "bg-rose-50 text-rose-700",
  },
  {
    key: "peopleWithBothMatches",
    label: "People with both matches",
    description: "Lanyard and company-text matches",
    icon: "✓",
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    key: "possibleBadgeRemovals",
    label: "Possible badge removals",
    description: "Tracks flagged for possible removal",
    icon: "↗",
    tone: "bg-amber-50 text-amber-700",
  },
];

const formatCount = (value) => Number(value || 0).toLocaleString();
const fetchDashboardSummary = async () => {
  const { data } = await api.get("/inspections/summary");
  return data.data;
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDashboard(await fetchDashboardSummary());
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchDashboardSummary()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">
            Workspace overview
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Roll-up counts from {formatCount(dashboard.totals.completedInspections)} completed{" "}
            {dashboard.totals.completedInspections === 1 ? "inspection" : "inspections"}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="secondary-button"
            onClick={loadDashboard}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
          <Link to="/new-inspection" className="primary-button">
            <span aria-hidden="true">＋</span> New inspection
          </Link>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Detection totals">
        {metrics.map((metric) => (
          <article key={metric.key} className="surface-card p-5">
            <div className="flex min-h-[76px] items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
                <p className="mt-1 text-xs text-slate-400">{metric.description}</p>
              </div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${metric.tone}`} aria-hidden="true">
                {metric.icon}
              </span>
            </div>
            {loading ? (
              <div className="mt-5 h-9 w-24 animate-pulse rounded bg-slate-100" aria-label="Loading count" />
            ) : (
              <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
                {formatCount(dashboard.totals[metric.key])}
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Recent inspections</h2>
            <p className="mt-0.5 text-xs text-slate-500">Latest completed video analyses.</p>
          </div>
          <Link to="/history" className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" aria-live="polite">
            <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : dashboard.recentInspections.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">No completed inspections yet</p>
            <p className="mt-1 text-xs text-slate-500">Complete an inspection to see your totals here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dashboard.recentInspections.map((inspection) => (
              <Link
                key={inspection._id}
                to={`/inspections/${inspection._id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{inspection.filename}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Date(inspection.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  <span className="text-emerald-700">{formatCount(inspection.peopleWithId)} ID-visible</span>
                  <span className="text-rose-700">{formatCount(inspection.peopleWithoutId)} confirmed no-ID</span>
                  <span className="text-indigo-700">
                    {formatCount(inspection.companyMatchCount ?? inspection.companyMatches?.length)} both matches
                  </span>
                  <span className="text-amber-700">{formatCount(inspection.possibleBadgeRemovals)} possible removals</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
