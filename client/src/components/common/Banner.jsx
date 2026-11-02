export default function Banner({ tone = 'warning', children }) {
  if (!children) return null;
  return <div className={`banner banner-${tone}`} role="status">{children}</div>;
}
