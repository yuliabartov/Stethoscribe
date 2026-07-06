import type { CSSProperties } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';
import { AppIcon } from './AppIcon';
import { LangToggle } from './LangToggle';

// Public privacy policy, served at /privacy (Firebase hosting rewrites every
// path to index.html; App.tsx routes this one before the auth gate). A stable
// public URL is required for Google's OAuth verification of the gmail.send
// scope, and spec §13 requires disclosing how exam audio is processed.
//
// Long-form document copy lives here (per language) rather than in the DICT
// UI-string dictionary.

const CONTACT_EMAIL = 'yuliabartov@gmail.com';
const LAST_UPDATED_EN = 'July 5, 2026';
const LAST_UPDATED_HE = '5 ביולי 2026';

interface Section {
  title: string;
  paras: string[];
}

const SECTIONS_EN: Section[] = [
  {
    title: 'What Stethoscribe is',
    paras: [
      'Stethoscribe is a voice-assisted documentation tool for physicians. During a physical examination the doctor speaks section names and findings aloud; the app turns them into a structured report that can be reviewed, edited, exported to Word/PDF, and emailed. This policy explains what data the app handles and how.',
    ],
  },
  {
    title: 'What we store',
    paras: [
      'Your account details from Google sign-in: name, email address, profile photo, and Google account identifier.',
      'Your exam templates (section names, aliases, field types, options, units).',
      'Your exam reports: the findings text and values you dictated or typed, the template used, report names, and creation/edit timestamps.',
      'All of this is stored in Google Firebase (Cloud Firestore) under your account only, encrypted in transit and at rest by Google Cloud. No one else’s account can read your data.',
    ],
  },
  {
    title: 'No patient identifiers — by design',
    paras: [
      'Stethoscribe has no fields for patient names, ID numbers, dates of birth, or any other direct identifiers, and it never asks for them. Reports are designed to be anonymized.',
      'Important: anything you speak into a free-text finding is stored as text. Do not dictate patient names, ID numbers, or other identifying details into findings. The report is about the examination, not the person’s identity.',
    ],
  },
  {
    title: 'Voice and audio processing',
    paras: [
      'Speech recognition is performed by your browser or device’s speech service, not by Stethoscribe itself. Depending on your browser, audio may be sent to the browser vendor’s servers to be transcribed — for example, Chrome sends audio to Google’s speech service. On some devices (such as Safari on newer iPhones) recognition may run on the device.',
      'Stethoscribe never receives, stores, or retains the audio itself — only the resulting text, which becomes part of your report and can be edited or deleted like any other text.',
    ],
  },
  {
    title: 'Your Google account and email',
    paras: [
      'Sign-in uses your Google account. If you use the email feature, the app asks Google for permission to send email from your Gmail address (the gmail.send permission). This permission is used for exactly one thing: sending the report files you explicitly choose to send, at the moment you confirm sending. Stethoscribe cannot read, delete, or manage your mail.',
      'You can also export reports as local file downloads without using email at all.',
    ],
  },
  {
    title: 'Offline storage on your device',
    paras: [
      'For offline use, the app keeps a local copy of your templates and reports in your browser’s storage. This local copy is deleted when you sign out. Avoid staying signed in on shared computers.',
    ],
  },
  {
    title: 'Deleting your data',
    paras: [
      'You can delete any report or template inside the app at any time; deletion removes it from the synced storage. For complete deletion of your account data, contact us at the address below.',
    ],
  },
  {
    title: 'Third-party services',
    paras: [
      'Stethoscribe uses: Google Firebase (authentication, database, hosting), the Gmail API (only when you send a report by email), and your browser/device speech service (transcription). There are no analytics trackers and no advertising.',
    ],
  },
  {
    title: 'Changes and contact',
    paras: [
      'If this policy changes materially, the date at the top of this page will be updated. Questions or data requests: ' + CONTACT_EMAIL,
    ],
  },
];

const SECTIONS_HE: Section[] = [
  {
    title: 'מה זה Stethoscribe',
    paras: [
      'Stethoscribe הוא כלי תיעוד קולי לרופאים. במהלך בדיקה גופנית הרופא מקריא בקול שמות מקטעים וממצאים; האפליקציה הופכת אותם לדוח מובנה שניתן לסקור, לערוך, לייצא ל־Word/PDF ולשלוח במייל. מדיניות זו מסבירה אילו נתונים האפליקציה מטפלת בהם וכיצד.',
    ],
  },
  {
    title: 'מה אנחנו שומרים',
    paras: [
      'פרטי החשבון שלך מהכניסה עם Google: שם, כתובת אימייל, תמונת פרופיל ומזהה חשבון Google.',
      'תבניות הבדיקה שלך (שמות מקטעים, כינויים, סוגי שדות, אפשרויות, יחידות).',
      'דוחות הבדיקה שלך: טקסט וערכי הממצאים שהוקראו או הוקלדו, התבנית שבה נעשה שימוש, שמות דוחות וחותמות זמן של יצירה ועריכה.',
      'כל אלה נשמרים ב־Google Firebase (Cloud Firestore) תחת החשבון שלך בלבד, מוצפנים בתעבורה ובאחסון על ידי Google Cloud. אף חשבון אחר אינו יכול לקרוא את הנתונים שלך.',
    ],
  },
  {
    title: 'ללא פרטים מזהים של מטופלים — בתכנון',
    paras: [
      'ב־Stethoscribe אין שדות לשם מטופל, מספר זהות, תאריך לידה או כל פרט מזהה ישיר אחר, והאפליקציה לעולם לא מבקשת אותם. הדוחות מתוכננים להיות אנונימיים.',
      'חשוב: כל מה שמוקרא לשדה טקסט חופשי נשמר כטקסט. אין להכתיב שמות מטופלים, מספרי זהות או פרטים מזהים אחרים לתוך ממצאים. הדוח עוסק בבדיקה — לא בזהות המטופל.',
    ],
  },
  {
    title: 'עיבוד קול ואודיו',
    paras: [
      'זיהוי הדיבור מתבצע על ידי שירות הדיבור של הדפדפן או המכשיר שלך, לא על ידי Stethoscribe עצמה. בהתאם לדפדפן, האודיו עשוי להישלח לשרתי ספק הדפדפן לצורך תמלול — לדוגמה, Chrome שולח אודיו לשירות הדיבור של Google. בחלק מהמכשירים (כגון Safari באייפונים חדשים) הזיהוי עשוי לרוץ על המכשיר עצמו.',
      'Stethoscribe לעולם אינה מקבלת, שומרת או משמרת את האודיו עצמו — רק את הטקסט המתקבל, שהופך לחלק מהדוח שלך וניתן לעריכה או מחיקה כמו כל טקסט אחר.',
    ],
  },
  {
    title: 'חשבון Google והאימייל שלך',
    paras: [
      'הכניסה מתבצעת עם חשבון Google שלך. אם תשתמש בתכונת האימייל, האפליקציה תבקש מ־Google הרשאה לשלוח אימייל מכתובת ה־Gmail שלך (הרשאת gmail.send). הרשאה זו משמשת לדבר אחד בלבד: שליחת קובצי הדוח שבחרת לשלוח במפורש, ברגע שאישרת את השליחה. Stethoscribe אינה יכולה לקרוא, למחוק או לנהל את הדואר שלך.',
      'ניתן גם לייצא דוחות כהורדת קבצים מקומית בלי להשתמש באימייל כלל.',
    ],
  },
  {
    title: 'אחסון לא־מקוון במכשיר שלך',
    paras: [
      'לצורך שימוש לא־מקוון, האפליקציה שומרת עותק מקומי של התבניות והדוחות שלך באחסון הדפדפן. העותק המקומי נמחק בעת התנתקות. הימנע מהישארות מחובר במחשבים משותפים.',
    ],
  },
  {
    title: 'מחיקת הנתונים שלך',
    paras: [
      'ניתן למחוק כל דוח או תבנית בתוך האפליקציה בכל עת; המחיקה מסירה אותם מהאחסון המסונכרן. למחיקה מלאה של נתוני החשבון, פנה אלינו בכתובת שלמטה.',
    ],
  },
  {
    title: 'שירותי צד שלישי',
    paras: [
      'Stethoscribe משתמשת ב: Google Firebase (הזדהות, מסד נתונים, אחסון אתר), Gmail API (רק כשאתה שולח דוח במייל), ושירות הדיבור של הדפדפן/המכשיר שלך (תמלול). אין עוקבי אנליטיקה ואין פרסום.',
    ],
  },
  {
    title: 'שינויים ויצירת קשר',
    paras: [
      'אם מדיניות זו תשתנה באופן מהותי, התאריך בראש העמוד יעודכן. שאלות או בקשות בנוגע לנתונים: ' + CONTACT_EMAIL,
    ],
  },
];

export function PrivacyPage() {
  const { t, dir, rtl } = useStethoscribe();
  const sections = rtl ? SECTIONS_HE : SECTIONS_EN;

  const page: CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'radial-gradient(130% 80% at 50% 0%, #F4EDDE 0%, #EBE3D4 55%, #E4DBC9 100%)',
    color: color.ink,
  };
  const container: CSSProperties = {
    width: '100%',
    maxWidth: 760,
    marginInline: 'auto',
    paddingInline: 'clamp(20px, 5vw, 40px)',
  };

  return (
    <div dir={dir} style={page}>
      <header style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 20, paddingBottom: 8 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none' }}>
          <AppIcon size={40} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px' }}>
            <span style={{ color: color.teal }}>Stetho</span>
            <span style={{ color: color.ink }}>scribe</span>
          </span>
        </a>
        <LangToggle />
      </header>

      <main style={{ ...container, paddingBottom: 48 }}>
        <h1 style={{ margin: '26px 0 6px', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800, letterSpacing: '-.5px' }}>{t.privacyLink}</h1>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: color.muted }}>
          {rtl ? `עודכן לאחרונה: ${LAST_UPDATED_HE}` : `Last updated: ${LAST_UPDATED_EN}`}
        </div>

        {sections.map((s) => (
          <section key={s.title} style={{ marginTop: 30 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, color: color.ink }}>{s.title}</h2>
            {s.paras.map((p, i) => (
              <p key={i} style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 500, color: color.inkSoft, lineHeight: 1.6 }}>{p}</p>
            ))}
          </section>
        ))}

        <a
          href="/"
          style={{ display: 'inline-block', marginTop: 34, padding: '13px 24px', borderRadius: 14, background: color.ink, color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none' }}
        >
          {t.backToHome}
        </a>
      </main>
    </div>
  );
}
