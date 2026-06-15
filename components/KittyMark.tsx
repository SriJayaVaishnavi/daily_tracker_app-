// components/KittyMark.tsx
// Original cat mascot (gold bow) — NOT Sanrio's Hello Kitty. Presentational only.
// Add the `kitty-mark` class at the call site so the amber theme can hide it.
export default function KittyMark({
  size = 30,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 16 L8 4 L24 12 Z" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <path d="M50 16 L56 4 L40 12 Z" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <ellipse cx="32" cy="34" rx="24" ry="21" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <circle cx="23" cy="33" r="2.6" fill="#4a2c3a" />
      <circle cx="41" cy="33" r="2.6" fill="#4a2c3a" />
      <ellipse cx="32" cy="38" rx="3" ry="2" fill="#ffce4a" />
      <path d="M6 33 H17 M6 38 H17 M58 33 H47 M58 38 H47" stroke="#e7b9cb" strokeWidth="1.6" fill="none" />
      <path d="M44 16 l8 -5 0 10 z M52 16 l8 -5 0 10 z" fill="#ffce4a" stroke="#e3a93f" strokeWidth="1" />
      <circle cx="52" cy="16" r="2.4" fill="#ffdd77" />
    </svg>
  );
}
