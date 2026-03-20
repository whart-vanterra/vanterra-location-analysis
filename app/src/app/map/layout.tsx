export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-40 bg-white">{children}</div>;
}
