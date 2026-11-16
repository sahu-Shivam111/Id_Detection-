import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

const statusClass = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const countValue = (value) => Number(value || 0).toLocaleString();

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/inspections", {
        params: { page, limit: 10, ...(status ? { status } : {}) },
      });
      setItems(data.data);
      setPages(data.pagination.pages || 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    let active = true;
    api.get("/inspections", {
      params: { page, limit: 10, ...(status ? { status } : {}) },
    })
      .then(({ data }) => {
        if (!active) return;
        setItems(data.data);
        setPages(data.pagination.pages || 1);
        setError("");
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, status]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? items.filter((item) => item.filename.toLowerCase().includes(query)) : items;
  }, [items, search]);

  const changeStatus = (value) => {
    setLoading(true);
    setStatus(value);
    setPage(1);
  };

  const changePage = (nextPage) => {
    setLoading(true);
    setPage(nextPage);
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.filename}" and all its evidence images?`)) return;
    setDeletingId(item._id);
    try {
      await api.delete(`/inspections/${item._id}`);
      if (items.length === 1 && page > 1) changePage(page - 1);
      else await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">Your workspace</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inspection history</h2>
          <p className="mt-1 text-sm text-slate-500">Browse completed analyses, track progress, and revisit evidence.</p>
        </div>
        <Link to="/" className="primary-button"><span aria-hidden="true">＋</span> New inspection</Link>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">All inspections</h3>
            <p className="mt-0.5 text-xs text-slate-500">Newest videos appear first.</p>
          </div>
          <button type="button" className="secondary-button !min-h-9 !px-3" onClick={load} disabled={loading}>
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:px-5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search this page by filename</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search videos on this page"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Status
            <select
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 p-5" aria-live="polite">
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-xl text-slate-500">▤</span>
            <h3 className="text-sm font-bold text-slate-800">{search ? "No matching videos" : "No inspections yet"}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {search ? "Try another filename or clear your search." : "Upload a video to see its analysis here."}
            </p>
            {!search && <Link to="/" className="primary-button mt-4">Start an inspection</Link>}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <article key={item._id} className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700">▶</span>
                    <div className="min-w-0">
                      <Link to={`/inspections/${item._id}`} className="block truncate text-sm font-bold text-slate-800 hover:text-indigo-700">
                        {item.filename}
                      </Link>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.duration ? ` · ${Math.floor(item.duration / 60)}m ${item.duration % 60}s` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClass[item.status] || statusClass.pending}`}>
                    {item.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pl-0 sm:pl-[52px]">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-slate-600"><strong className="text-slate-800">{countValue(item.totalPeople)}</strong> people at peak frame</span>
                    <span className="text-emerald-700"><strong>{countValue(item.peopleWithId)}</strong> ID-visible tracks</span>
                    <span className="text-red-600"><strong>{countValue(item.peopleWithoutId)}</strong> confirmed no-ID tracks</span>
                    <span className="text-amber-700"><strong>{countValue(item.uncertainPeople)}</strong> unresolved tracks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/inspections/${item._id}`} className="secondary-button !min-h-8 !px-3">View report <span aria-hidden="true">→</span></Link>
                    <button
                      type="button"
                      className="danger-button !min-h-8 !px-3"
                      onClick={() => remove(item)}
                      disabled={deletingId === item._id || item.status === "processing"}
                      title={item.status === "processing" ? "Cannot delete while processing" : "Delete inspection"}
                    >
                      {deletingId === item._id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5">
            <span className="text-xs text-slate-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button type="button" className="secondary-button !min-h-8 !px-3" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Previous
              </button>
              <button type="button" className="secondary-button !min-h-8 !px-3" disabled={page >= pages} onClick={() => changePage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
