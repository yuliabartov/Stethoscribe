import { BottomNav } from './components/BottomNav';
import { PhoneFrame } from './components/PhoneFrame';
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
