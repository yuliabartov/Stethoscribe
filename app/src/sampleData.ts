import type { TemplateDef } from './types';

export const INITIAL_TEMPLATES: TemplateDef[] = [
  {
    id: 'gp',
    name: 'General Physical',
    nameHe: 'בדיקה גופנית כללית',
    short: 'GP',
    shortHe: 'כל',
    accent: '#F2B23A',
    soft: '#FCEAC6',
    cats: [
      {
        name: 'General Appearance',
        nameHe: 'מראה כללי',
        type: 'Free text',
        sample: 'Alert, well-nourished, no acute distress',
        sampleHe: 'ערני, מוזן היטב, ללא מצוקה חריפה',
      },
      { name: 'Temperature', nameHe: 'חום', type: 'Number', sample: '37.2 °C', sampleHe: '37.2 °C' },
      { name: 'Heart Rate', nameHe: 'דופק', type: 'Number', sample: '78 bpm', sampleHe: '78 פעימות/דק׳' },
      {
        name: 'Blood Pressure',
        nameHe: 'לחץ דם',
        type: 'Free text',
        sample: '122/78 mmHg',
        sampleHe: '122/78 mmHg',
        low: true,
      },
      {
        name: 'Lungs',
        nameHe: 'ריאות',
        type: 'List',
        options: ['Clear', 'Wheeze', 'Crackles'],
        optionsHe: ['נקיות', 'צפצופים', 'חרחורים'],
        sample: 'Clear bilaterally',
        sampleHe: 'נקיות דו-צדדית',
      },
      {
        name: 'Skin',
        nameHe: 'עור',
        type: 'Free text',
        sample: 'Warm and dry, no rash',
        sampleHe: 'חמים ויבש, ללא פריחה',
        low: true,
      },
      {
        name: 'Notes',
        nameHe: 'הערות',
        type: 'Free text',
        sample: 'Reports mild fatigue past week',
        sampleHe: 'מדווח על עייפות קלה בשבוע האחרון',
      },
    ],
  },
];
