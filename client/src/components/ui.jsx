const STATUS_STYLES = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export const StatusBadge = ({ status }) => (
  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
    {status}
  </span>
);

export const Card = ({ className = "", children }) => (
  <div className={`surface-card mb-4 p-4 ${className}`}>
    {children}
  </div>
);

export const ProgressBar = ({ value }) => (
  <div className="progress-track">
    <div
      className="progress-fill"
      style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0))}%` }}
    />
  </div>
);

export const Button = ({ variant = "primary", className = "", ...props }) => {
  const styles = variant === "danger" ? "danger-button" : "primary-button";
  return (
    <button
      {...props}
      className={`${styles} ${className}`}
    />
  );
};