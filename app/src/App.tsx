import { AppIcon } from './components/AppIcon';
import { BottomNav } from './components/BottomNav';
import { LandingPage } from './components/LandingPage';
import { PhoneFrame } from './components/PhoneFrame';
import { PrivacyPage } from './components/PrivacyPage';
import { BuilderScreen } from './screens/BuilderScreen';
import { ExamScreen } from './screens/ExamScreen';
import { ExportScreen } from './screens/ExportScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SignInScreen } from './screens/SignInScreen';
import { TemplatesScreen } from './screens/TemplatesScreen';
import { StethoscribeProvider, useStethoscribe } from './state/StethoscribeContext';

function Screen() {
  const { state } = useStethoscribe();
  switch (state.screen) {
    case 'signin':
      return <SignInScreen />;
    case 'home':
      return <HomeScreen />;
    case 'templates':
      return <TemplatesScreen />;
    case 'builder':
      return <BuilderScreen />;
    case 'exam':
      return <ExamScreen />;
    case 'review':
      return <ReviewScreen />;
    case 'export':
      return <ExportScreen />;
    case 'reports':
      return <ReportsScreen />;
    default:
      return <HomeScreen />;
  }
}

function AppShell() {
  const { state } = useStethoscribe();
  // Public privacy policy at a stable URL (hosting rewrites all paths to
  // index.html) — rendered before the auth gate so it loads instantly and is
  // reachable by Google's OAuth verification reviewers without signing in.
  if (window.location.pathname === '/privacy') {
    return <PrivacyPage />;
  }
  if (!state.authReady || (state.user && !state.dataReady)) {
    return (
      <PhoneFrame>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon size={128} style={{ animation: 'ssPulse 1.4s ease-in-out infinite' }} />
        </div>
      </PhoneFrame>
    );
  }
  // Signed out: the public landing page is the app's entry point (full-width,
  // responsive) — the phone-framed app is only for the signed-in experience.
  if (!state.user) {
    return <LandingPage />;
  }
  const showNav = state.screen === 'home' || state.screen === 'templates' || state.screen === 'reports';
  return (
    <PhoneFrame>
      <Screen />
      {showNav && <BottomNav />}
    </PhoneFrame>
  );
}

function App() {
  return (
    <StethoscribeProvider>
      <AppShell />
    </StethoscribeProvider>
  );
}

export default App;
