interface CrmBadgeProps {
  badge: 'PROVEN' | 'SIGNAL' | null;
}

export default function CrmBadge({ badge }: CrmBadgeProps) {
  if (!badge) return null;

  const styles =
    badge === 'PROVEN'
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-yellow-100 text-yellow-800 border-yellow-200';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${styles}`}
    >
      {badge}
    </span>
  );
}
