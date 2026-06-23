import React from "react";

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  clip: (<><path d="M4 7h16v13H4z" /><path d="M4 7l4-4M10 7l4-4M16 7l4-4" /></>),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  alert: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  trophy: (<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 7H5a2 2 0 0 0 0 4h1M16 7h3a2 2 0 0 1 0 4h-1M9 20h6M12 13v3" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></>),
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

export function Avatar({ url, name, size = 40, square = false }: { url?: string | null; name?: string | null; size?: number; square?: boolean }) {
  const initial = (name || "?").trim()[0]?.toUpperCase() || "?";
  const radius = square ? Math.round(size * 0.28) : size / 2;
  if (url) {
    return <img src={url} alt={name || ""} className="avatar-img" style={{ width: size, height: size, borderRadius: radius }} />;
  }
  return <div className="ava" style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.42) }}>{initial}</div>;
}

export function Hud({ name, sub, rank, avatarUrl }: { name: string; sub: string; rank: string; avatarUrl?: string | null }) {
  return (
    <div className="hud">
      <div className="hud-top">
        <Avatar url={avatarUrl} name={name} size={44} square />
        <div>
          <div className="hud-name">{name}</div>
          <div className="hud-sub">{sub}</div>
        </div>
        <div className="rank-pill"><span className="dot" />{rank}</div>
      </div>
    </div>
  );
}
