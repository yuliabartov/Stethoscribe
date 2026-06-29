import { BackButton } from '../components/BackButton';
import { LangToggle } from '../components/LangToggle';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';
import type { BuilderCategory, CategoryType } from '../types';

const TYPE_META: Record<CategoryType, { bg: string; color: string }> = {
  'Free text': { bg: color.typeFreeBg, color: color.typeFreeColor },
  Number: { bg: color.typeNumberBg, color: color.typeNumberColor },
  List: { bg: color.typeListBg, color: color.typeListColor },
};

const TYPES: CategoryType[] = ['Free text', 'Number', 'List'];

export function BuilderScreen() {
  const { state, t, loc, rtl, update, moveCat, delCat, confirmAdd, saveTemplate, go } = useStethoscribe();
  const builder = state.builder!;

  const locOptions = (c: BuilderCategory): string[] => {
    const v = rtl ? c.optionsHe : undefined;
    return v ?? c.options ?? [];
  };

  return (
    <>
      <div style={{ padding: '22px 18px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${color.borderCream}` }}>
        <BackButton onClick={() => go('templates', { nav: 'templates' })} />
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: color.ink }}>{t.templateBuilder}</div>
        <LangToggle />
      </div>

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '20px 22px 130px' }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: color.inkMute, marginBottom: 8, letterSpacing: '.2px' }}>
          {t.templateNameLabel}
        </label>
        <input
          value={builder.name}
          onChange={(e) => update((s) => ({ builder: s.builder ? { ...s.builder, name: e.target.value } : s.builder }))}
          placeholder={t.tnPlaceholder}
          style={{
            width: '100%',
            padding: '16px 16px',
            border: `1.5px solid ${color.borderCream3}`,
            borderRadius: 16,
            background: '#fff',
            fontSize: 16,
            fontWeight: 700,
            color: color.ink,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 2px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: color.ink }}>{t.categories}</h2>
          <span style={{ fontSize: 13, fontWeight: 700, color: color.muted }}>
            {builder.cats.length} {t.total}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {builder.cats.map((c, idx) => {
            const meta = TYPE_META[c.type];
            const hasOptions = c.type === 'List' && c.options && c.options.length > 0;
            return (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${color.borderCream2}`, borderRadius: 16, padding: '13px 14px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => moveCat(idx, -1)}
                    style={{ width: 26, height: 22, border: 'none', background: '#F4F0E6', borderRadius: '7px 7px 4px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.muted2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveCat(idx, 1)}
                    style={{ width: 26, height: 22, border: 'none', background: '#F4F0E6', borderRadius: '4px 4px 7px 7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.muted2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: color.ink }}>{loc(c, 'name')}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 5, padding: '3px 9px', borderRadius: 8, background: meta.bg }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{t.types[c.type]}</span>
                  </div>
                  {hasOptions && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: color.muted, marginInlineStart: 8 }}>{locOptions(c).join(' · ')}</span>
                  )}
                </div>
                <button
                  onClick={() => delCat(c.id)}
                  style={{ width: 34, height: 34, border: 'none', background: color.delBg, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color.warnText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {state.adding ? (
          <div style={{ marginTop: 14, border: `1.5px solid ${color.tealSoftBorder}`, background: color.tealSoftBg, borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: color.ink, marginBottom: 12 }}>{t.newCategory}</div>
            <input
              value={state.addName}
              onChange={(e) => update({ addName: e.target.value })}
              placeholder={t.categoryNamePlaceholder}
              style={{
                width: '100%',
                padding: '13px 14px',
                border: `1.5px solid ${color.borderMint}`,
                borderRadius: 13,
                background: '#fff',
                fontSize: 15,
                fontWeight: 600,
                color: color.ink,
                outline: 'none',
                marginBottom: 12,
              }}
            />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: color.inkMute, marginBottom: 8 }}>{t.typeLabel}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {TYPES.map((ty) => {
                const selected = state.addType === ty;
                return (
                  <button
                    key={ty}
                    onClick={() => update({ addType: ty })}
                    style={{
                      flex: 1,
                      padding: '11px 6px',
                      borderRadius: 12,
                      fontSize: 13.5,
                      fontWeight: 700,
                      border: `1.5px solid ${selected ? color.teal : color.borderMint}`,
                      background: selected ? color.teal : '#fff',
                      color: selected ? '#fff' : color.inkSoft,
                    }}
                  >
                    {t.types[ty]}
                  </button>
                );
              })}
            </div>
            {state.addType === 'List' && (
              <input
                value={state.addOptions}
                onChange={(e) => update({ addOptions: e.target.value })}
                placeholder={t.optionsPlaceholder}
                style={{
                  width: '100%',
                  padding: '13px 14px',
                  border: `1.5px solid ${color.borderMint}`,
                  borderRadius: 13,
                  background: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  color: color.ink,
                  outline: 'none',
                  marginBottom: 12,
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => update({ adding: false, addName: '', addOptions: '', addType: 'Free text' })}
                style={{ flex: 1, padding: 13, border: `1.5px solid ${color.borderMint}`, background: '#fff', borderRadius: 13, fontSize: 14.5, fontWeight: 700, color: color.inkSoft }}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmAdd}
                style={{ flex: 1, padding: 13, border: 'none', background: color.teal, borderRadius: 13, fontSize: 14.5, fontWeight: 700, color: '#fff' }}
              >
                {t.add}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => update({ adding: true })}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              width: '100%',
              marginTop: 14,
              border: `1.5px dashed ${color.tealDashedBorder}`,
              background: 'transparent',
              borderRadius: 16,
              padding: 15,
              fontSize: 15,
              fontWeight: 700,
              color: color.teal,
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color.teal} strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t.addCategory}
          </button>
        )}
      </div>

      <div style={{ padding: '14px 22px calc(18px + env(safe-area-inset-bottom))', borderTop: `1px solid ${color.borderCream}`, background: color.cream }}>
        <button
          onClick={saveTemplate}
          style={{
            width: '100%',
            padding: 17,
            border: 'none',
            borderRadius: 18,
            background: color.amber,
            color: color.ink,
            fontSize: 16.5,
            fontWeight: 800,
            boxShadow: '0 14px 26px -14px rgba(235,164,31,.8)',
          }}
        >
          {t.saveTemplate}
        </button>
      </div>
    </>
  );
}
