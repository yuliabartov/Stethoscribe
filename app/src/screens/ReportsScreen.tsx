import type { CSSProperties } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function ReportsScreen() {
  const { state, t, rtl, loc, tplByName, accentFor, update, reviewFromReport, delReport } = useStethoscribe();

  const handleDelete = (id: string) => {
    if (window.confirm(t.confirmDeleteReport)) delReport(id);
  };

  const sortStyle = (on: boolean): CSSProperties => ({
    padding: '9px 16px',
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 700,
    border: `1.5px solid ${on ? color.ink : color.borderCream4}`,
    background: on ? color.ink : '#fff',
    color: on ? '#fff' : color.inkSoft,
  });

  let list = state.reports.slice();
  if (state.sort === 'oldest') list = list.slice().reverse();
  const q = state.search.trim().toLowerCase();
  if (q) {
    list = list.filter((r) =>
      (loc(tplByName(r.template), 'name') + ' ' + r.template + ' ' + r.date + ' ' + r.time).toLowerCase().includes(q),
    );
  }
  const noResults = list.length === 0;
  const noResultsText = state.reports.length === 0
    ? t.noSavedReports
    : rtl
      ? `אין דוחות התואמים ל"${state.search}"`
      : `No reports match "${state.search}"`;

  return (
    <>
      <div style={{ padding: '26px 22px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: color.ink, letterSpacing: '-.4px' }}>{t.savedReports}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, background: '#fff', border: `1.5px solid ${color.borderCream3}`, borderRadius: 16, padding: '0 16px' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={state.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder={t.searchPlaceholder}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: color.ink, outline: 'none', padding: '14px 0', textAlign: 'start' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          <button onClick={() => update({ sort: 'recent' })} style={sortStyle(state.sort === 'recent')}>
            {t.newestFirst}
          </button>
          <button onClick={() => update({ sort: 'oldest' })} style={sortStyle(state.sort === 'oldest')}>
            {t.oldestFirst}
          </button>
        </div>
      </div>

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '8px 22px 110px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {list.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                background: '#fff',
                border: `1px solid ${color.borderCream2}`,
                borderRadius: 18,
                padding: '15px 16px',
                boxShadow: '0 1px 0 rgba(23,58,75,.03)',
              }}
            >
              <button
                onClick={() => reviewFromReport(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, border: 'none', background: 'transparent', textAlign: 'start', padding: 0 }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: accentFor(r.template) }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: color.ink }}>{loc(tplByName(r.template), 'name')}</span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: color.muted, marginTop: 2 }}>
                    {r.date} · {r.time}
                  </span>
                </span>
                <svg
                  style={rtl ? { transform: 'scaleX(-1)' } : undefined}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={color.chevron}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                style={{ width: 34, height: 34, border: 'none', background: color.delBg, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color.warnText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
              </button>
            </div>
          ))}
          {noResults && <div style={{ textAlign: 'center', padding: '50px 20px', color: color.faint, fontSize: 15, fontWeight: 600 }}>{noResultsText}</div>}
        </div>
      </div>
    </>
  );
}
