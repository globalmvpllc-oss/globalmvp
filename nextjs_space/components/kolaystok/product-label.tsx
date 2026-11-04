/**
 * How a product is named on every KolayStok screen: the full name (wraps,
 * never cut), the size as its own big bold tag,
 * and the code in small type. At Karadağ hundreds of products differ only by
 * size (Ø40, 25 cm), so the size must be impossible to miss.
 * The name is never cut: usually two lines, a very long one takes a third.
 */
export function ProductLabel({
  name,
  size,
  code,
  extra,
  large = false,
}: {
  name: string;
  size?: string | null;
  code: string;
  extra?: string | null;
  large?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`break-words font-semibold leading-snug ${large ? 'text-xl' : 'text-lg'}`}>{name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {size && (
          <span className={`rounded-lg bg-slate-900 px-2.5 py-0.5 font-extrabold tracking-wide text-white ${large ? 'text-xl' : 'text-lg'}`}>{size}</span>
        )}
        <span className="text-sm text-slate-500">
          {code}
          {extra ? ` · ${extra}` : ''}
        </span>
      </div>
    </div>
  );
}
