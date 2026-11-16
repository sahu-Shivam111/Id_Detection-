import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { socket } from "../services/api";
import AppRoutes from "../AppRoutes";
import Sidebar from "../components/Sidebar";

const getPageTitle = (pathname) => {
  if (pathname.startsWith("/inspections/")) return "Inspection report";
  if (pathname === "/history") return "Inspection history";
  return "New inspection";
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const [completionToast, setCompletionToast] = useState(null);

  useEffect(() => {
    const onComplete = ({ peopleWithoutId = 0 } = {}) => {
      setCompletionToast(Number(peopleWithoutId) || 0);
    };

    socket.on("processing-complete", onComplete);
    return () => socket.off("processing-complete", onComplete);
  }, []);

  useEffect(() => {
    if (completionToast === null) return undefined;
    const timeout = window.setTimeout(() => setCompletionToast(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [completionToast]);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">ID CHECK / WORKSPACE</p>
            <h1>{getPageTitle(pathname)}</h1>
          </div>
          <div className="connection-pill">
            <span className="connection-dot" />
            Analysis ready
          </div>
        </header>

        <main className="page-content">
          <AppRoutes />
        </main>

        <footer className="app-footer">
          ID Check <span>·</span> Video inspection workspace
        </footer>
      </div>
      {completionToast !== null && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-5 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start gap-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-xl"
        >
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-700" aria-hidden="true">
            ✓
          </span>
          <p className="flex-1 text-sm text-slate-700">
            Inspection complete: <strong>{completionToast}</strong>{" "}
            {completionToast === 1 ? "person" : "people"} without an ID card.
          </p>
          <button
            type="button"
            className="rounded px-1 text-lg leading-none text-slate-400 hover:text-slate-700"
            aria-label="Dismiss completion notification"
            onClick={() => setCompletionToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
