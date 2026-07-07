// Guards the most safety-relevant logic in the app: which spoken finding
// lands in which report field. All fixtures are pure — no speech engine, no
// DOM — matching how the context feeds transcripts into processTranscript.
import { describe, expect, it } from 'vitest';
import {
  correctClinicalTerms,
  isStopKeyword,
  normalize,
  normalizeToken,
  parseSpokenNumber,
  processTranscript,
  processTranscriptMulti,
  similarity,
  type CompiledCategory,
} from './matchEngine';

/** Compile helper mirroring StethoscribeContext.compileCats for fixtures. */
function cat(
  id: string,
  anchors: string[],
  extra?: Partial<CompiledCategory>,
): CompiledCategory {
  return { id, type: 'Free text', anchors: anchors.map(normalize), ...extra };
}

describe('normalizeToken / normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeToken('Heart,')).toBe('heart');
    expect(normalize('Blood  Pressure!')).toBe('blood pressure');
  });

  it('strips Hebrew niqqud but keeps the letters', () => {
    expect(normalizeToken('רִאשׁוֹן')).toBe('ראשון');
  });
});

describe('similarity', () => {
  it('is 1 for identical strings and 0 for empty input', () => {
    expect(similarity('lungs', 'lungs')).toBe(1);
    expect(similarity('', 'lungs')).toBe(0);
  });

  it('boosts substrings and scores near-misses above unrelated words', () => {
    expect(similarity('auscultation', 'auscult')).toBe(0.9);
    const nearMiss = similarity('palpation', 'palpitation');
    const unrelated = similarity('palpation', 'temperature');
    expect(nearMiss).toBeGreaterThan(unrelated);
    expect(nearMiss).toBeGreaterThan(0.6);
  });
});

describe('parseSpokenNumber', () => {
  it('passes through digit literals, including decimals', () => {
    expect(parseSpokenNumber('78')).toBe('78');
    expect(parseSpokenNumber('37.2 degrees')).toBe('37.2');
  });

  it('parses English number words with decimals', () => {
    expect(parseSpokenNumber('five')).toBe('5');
    expect(parseSpokenNumber('thirty seven point two')).toBe('37.2');
    expect(parseSpokenNumber('one hundred and ten')).toBe('110');
  });

  it('parses Hebrew number words including the vav prefix', () => {
    expect(parseSpokenNumber('חמש')).toBe('5');
    expect(parseSpokenNumber('שלושים ושבע נקודה שתיים')).toBe('37.2');
    expect(parseSpokenNumber('מאה ועשרים')).toBe('120');
  });

  it('returns null when no number is present', () => {
    expect(parseSpokenNumber('clear bilaterally')).toBeNull();
    expect(parseSpokenNumber('')).toBeNull();
  });
});

describe('correctClinicalTerms', () => {
  it('snaps a close mis-hear to the clinical term', () => {
    expect(correctClinicalTerms('mild diaphoressis noted')).toContain('diaphoresis');
  });

  it('leaves exact terms and short tokens untouched', () => {
    const text = 'no rales or wheezes';
    expect(correctClinicalTerms(text)).toBe(text);
    expect(correctClinicalTerms('dry')).toBe('dry');
  });
});

describe('isStopKeyword', () => {
  it('detects the stop phrase in both languages, embedded in speech', () => {
    expect(isStopKeyword('okay end exam thank you')).toBe(true);
    expect(isStopKeyword('טוב סיום בדיקה תודה')).toBe(true);
    expect(isStopKeyword('the exam continues')).toBe(false);
  });
});

describe('processTranscript', () => {
  const cats: CompiledCategory[] = [
    cat('0', ['General Appearance', 'מראה כללי']),
    cat('1', ['Heart Rate', 'דופק'], { type: 'Number' }),
    cat('2', ['Lungs', 'ריאות'], {
      type: 'List',
      options: [
        { value: 'Clear', terms: [normalize('Clear'), normalize('נקיות')] },
        { value: 'Wheeze', terms: [normalize('Wheeze'), normalize('צפצופים')] },
      ],
    }),
  ];

  it('routes values to fields by anchor, with token start positions', () => {
    const r = processTranscript('general appearance alert and oriented heart rate 78', cats);
    const byId = new Map(r.fields.map((f) => [f.id, f]));
    expect(byId.get('0')?.value).toMatch(/alert and oriented/i);
    expect(byId.get('0')?.start).toBe(0);
    expect(byId.get('1')?.value).toBe('78');
    expect(byId.get('1')?.start).toBe(5);
  });

  it('accepts categories in any order and Hebrew anchors', () => {
    const r = processTranscript('דופק שמונים מראה כללי ערני', cats);
    const byId = new Map(r.fields.map((f) => [f.id, f]));
    expect(byId.get('1')?.value).toBe('80');
    expect(byId.get('0')?.value).toMatch(/ערני/);
  });

  it('lets the last mention win so re-stating corrects a field', () => {
    const r = processTranscript('heart rate 78 lungs clear heart rate 82', cats);
    const byId = new Map(r.fields.map((f) => [f.id, f]));
    expect(byId.get('1')?.value).toBe('82');
  });

  it('collects speech before the first anchor as unassigned', () => {
    const r = processTranscript('patient resting comfortably heart rate 78', cats);
    expect(r.unassigned.join(' ')).toMatch(/patient resting/i);
    expect(r.fields.find((f) => f.id === '1')?.value).toBe('78');
  });

  it('puts everything in unassigned when nothing matches', () => {
    const r = processTranscript('completely unrelated chatter', cats);
    expect(r.fields).toHaveLength(0);
    expect(r.unassigned).toEqual(['completely unrelated chatter']);
  });

  it('leaves a Number field untouched when no number was heard', () => {
    const r = processTranscript('heart rate irregular and thready', cats);
    expect(r.fields.find((f) => f.id === '1')).toBeUndefined();
  });

  it('flags out-of-range numbers low but keeps the value', () => {
    const ranged: CompiledCategory[] = [cat('0', ['Heart Rate'], { type: 'Number', min: 30, max: 220 })];
    const high = processTranscript('heart rate 300', ranged);
    expect(high.fields[0]).toMatchObject({ value: '300', low: true });
    const ok = processTranscript('heart rate 78', ranged);
    expect(ok.fields[0]).toMatchObject({ value: '78', low: false });
  });

  it('matches an alias anchor the same as the primary name', () => {
    const aliased: CompiledCategory[] = [cat('0', ['Heart Rate', 'pulse'], { type: 'Number' })];
    const r = processTranscript('pulse 64', aliased);
    expect(r.fields[0]?.value).toBe('64');
  });

  it('selects the closest List option and rejects far-off values', () => {
    const clear = processTranscript('lungs clear', cats);
    expect(clear.fields.find((f) => f.id === '2')?.value).toBe('Clear');
    const nonsense = processTranscript('lungs purple elephants everywhere', cats);
    expect(nonsense.fields.find((f) => f.id === '2')).toBeUndefined();
  });

  it('detects the stop keyword within the stream', () => {
    expect(processTranscript('heart rate 78 end exam', cats).stop).toBe(true);
    expect(processTranscript('heart rate 78', cats).stop).toBe(false);
  });

  it('forces the low flag when a clinical-term correction was applied', () => {
    const r = processTranscript('general appearance mild diaphoressis noted', cats);
    const f = r.fields.find((x) => x.id === '0');
    expect(f?.value).toContain('diaphoresis');
    expect(f?.low).toBe(true);
  });
});

describe('processTranscript windowing (fromToken)', () => {
  const cats: CompiledCategory[] = [
    cat('0', ['General Appearance']),
    cat('1', ['Heart Rate'], { type: 'Number' }),
    cat('2', ['Blood Pressure']),
  ];
  // tokens: general(0) appearance(1) alert(2) and(3) oriented(4)
  //         heart(5) rate(6) 78(7) blood(8) pressure(9) 120(10) over(11) 80(12)
  const text = 'general appearance alert and oriented heart rate 78 blood pressure 120 over 80';

  it('with fromToken=0 is identical to the full parse', () => {
    expect(processTranscript(text, cats, 0)).toEqual(processTranscript(text, cats));
  });

  it('returns only fields whose anchor is in the window, with ABSOLUTE token starts', () => {
    const r = processTranscript(text, cats, 5); // window begins at "heart rate…"
    const byId = new Map(r.fields.map((f) => [f.id, f]));
    expect(byId.has('0')).toBe(false); // General Appearance settled out of the window
    expect(byId.get('1')).toMatchObject({ value: '78', start: 5 }); // absolute, not window-relative 0
    expect(byId.get('2')?.value).toMatch(/120/);
    expect(byId.get('2')?.start).toBe(8);
  });

  it('windowed live fields exactly equal their full-parse counterparts', () => {
    const full = new Map(processTranscript(text, cats).fields.map((f) => [f.id, f]));
    for (const f of processTranscript(text, cats, 5).fields) {
      expect(f).toEqual(full.get(f.id)); // same value, low flag, and absolute start
    }
  });

  it('detects the stop keyword from the full text even when it sits before the window', () => {
    const withStop = text + ' end exam';
    const tokenCount = withStop.split(/\s+/).filter(Boolean).length;
    expect(processTranscript(withStop, cats, tokenCount).stop).toBe(true);
  });

  it('does not re-report leading speech that was settled out of the window', () => {
    // tokens: patient(0) resting(1) heart(2) rate(3) 78(4)
    const r = processTranscript('patient resting heart rate 78', cats, 2);
    expect(r.unassigned).toEqual([]); // window starts on the anchor → nothing leading
    expect(r.fields.find((f) => f.id === '1')?.value).toBe('78');
  });
});

describe('processTranscriptMulti (alternative hypotheses)', () => {
  const cats: CompiledCategory[] = [
    cat('0', ['General Appearance']),
    cat('1', ['Heart Rate'], { type: 'Number', min: 30, max: 220 }),
    cat('2', ['Lungs'], {
      type: 'List',
      options: [
        { value: 'Clear', terms: [normalize('Clear')] },
        { value: 'Wheeze', terms: [normalize('Wheeze')] },
      ],
    }),
  ];

  it('is identical to processTranscript when there are no alternatives', () => {
    const primary = 'heart rate 78 lungs clear';
    expect(processTranscriptMulti(primary, [], cats)).toEqual(processTranscript(primary, cats));
  });

  it('fills a List field the primary missed, using a confident alternative', () => {
    // Primary mis-hears the option as something matching neither Clear nor
    // Wheeze, so nothing is captured; the 2nd hypothesis is clean.
    const primary = 'lungs quiet';
    expect(processTranscript(primary, cats).fields.find((f) => f.id === '2')).toBeUndefined();
    const r = processTranscriptMulti(primary, ['lungs wheeze'], cats);
    expect(r.fields.find((f) => f.id === '2')?.value).toBe('Wheeze');
  });

  it('upgrades a low/out-of-range Number using a confident alternative', () => {
    const primary = 'heart rate 3'; // out of range → captured but flagged low
    expect(processTranscript(primary, cats).fields.find((f) => f.id === '1')).toMatchObject({ value: '3', low: true });
    const r = processTranscriptMulti(primary, ['heart rate 93'], cats);
    expect(r.fields.find((f) => f.id === '1')).toMatchObject({ value: '93', low: false });
  });

  it('never overrides a confident primary capture', () => {
    const r = processTranscriptMulti('lungs clear', ['lungs wheeze'], cats);
    expect(r.fields.find((f) => f.id === '2')?.value).toBe('Clear');
  });

  it('ignores alternatives for Free text fields', () => {
    const r = processTranscriptMulti('general appearance alert', ['general appearance adort'], cats);
    expect(r.fields.find((f) => f.id === '0')?.value).toMatch(/alert/i);
  });

  it('keeps the primary transcript token start when upgrading', () => {
    // tokens: heart(0) rate(1) 3(2) — anchor at 0 in both primary and alt.
    const r = processTranscriptMulti('heart rate 3', ['heart rate 93'], cats);
    expect(r.fields.find((f) => f.id === '1')?.start).toBe(0);
  });
});
