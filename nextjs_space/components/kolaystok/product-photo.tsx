'use client';

/** A product's photo, or its initials on a tinted square. Lazy, fixed size. */
export function ProductPhoto({ id, name, hasPhoto, size = 56 }: { id: string; name: string; hasPhoto: boolean; size?: number }) {
  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/stock/photo/${encodeURIComponent(id)}`}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        className="shrink-0 rounded-lg bg-slate-100 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.trim().slice(0, 2).toLocaleUpperCase('tr-TR');
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg bg-teal-50 text-lg font-bold text-teal-700"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}
