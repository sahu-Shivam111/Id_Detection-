import { NavLink } from "react-router-dom";

const navigation = [
  { to: "/", label: "New inspection", icon: "＋", end: true },
  { to: "/history", label: "Inspection history", icon: "▤" },
];

export default function Sidebar() {
  return (
    <aside className="app-sidebar">
      <NavLink to="/" className="brand-lockup" aria-label="ID Check home">
        <span className="brand-mark">ID</span>
        <span>
          <strong>ID Check</strong>
          <small>VIDEO INSPECTION</small>
        </span>
      </NavLink>

      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-help">
        <span className="help-dot" />
        <div>
          <strong>Detection workspace</strong>
          <p>Review video, detections, and evidence in one place.</p>
        </div>
      </div>
    </aside>
  );
}
