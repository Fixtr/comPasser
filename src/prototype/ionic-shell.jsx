import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  IonApp, IonBackButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton,
  IonTabs, IonTitle, IonToolbar, setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { homeOutline, listOutline, personOutline } from 'ionicons/icons';
import { decideRoute, getSafeReturnPath } from '../app/route-decision.mjs';
import { activeTabId, shouldShowTabBar, TABS } from '../app/tab-bar.mjs';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { offlineTrips } from '../domains/itinerary/services/offline-trips.mjs';
import { showErrorToast } from '../utils/toast.js';
import { DestinationScreen } from './destination-screen.jsx';
import { installPageTransitions } from './screen-transition.js';
import { usePlanExitGuard } from './plan-exit-guard.js';
import { logout, missingFirebaseConfig, subscribeToAuthChanges } from '../domains/auth/services/firebase-auth.js';
import { getLang, setLang, t } from '../utils/i18n.js';
import { HomeScreen, AuthScreen, PreferenceScreen, PlanScreen, ResultScreen, ProfileScreen, AccountDeletionScreen, RecommendScreen, CoursesScreen } from './ionic-screens.jsx';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/palettes/high-contrast.always.css';
import '@ionic/react/css/palettes/high-contrast-dark.class.css';
import '../styles/tokens.css';
import './ionic-shell.css';

setupIonicReact({ experimentalCloseWatcher: true });

const pages = [
  ['/destination', 'flowDestination'], ['/', 'heroTitle'], ['/home', 'heroTitle'], ['/recommend', 'shellRecommend'], ['/courses', 'shellCourses'],
  ['/login', 'authEmailLoginBtn'], ['/join', 'joinTitle'],
  ['/verify', 'verifyPendingTitle'], ['/account-deletion-status', 'shellAccountDeletion'],
  ['/preference', 'shellPreferences'], ['/preference/1', 'shellPreferences'], ['/preference/2', 'shellBudget'], ['/plan', 'tabPlan'],
  ['/profile', 'tabProfile'], ['/profile/trips', 'tabTrips'], ['/profile/personal', 'tabProfile'],
  ['/profile/security', 'shellSecurity'], ['/view/:id', 'shellResult'], ['/share/:id', 'shellShared'],
  ['/view', 'shellResult'],
];

function SettingsControls({ theme, onThemeChange, lang }) {
  return <div className="ionic-settings" role="group" aria-label={lang === 'ko' ? '화면 설정' : 'Display settings'}>
    <button type="button" onClick={onThemeChange} aria-label={t(theme === 'dark' ? 'lightMode' : 'darkMode')}>{t(theme === 'dark' ? 'lightMode' : 'darkMode')}</button>
  </div>;
}

function ShellPage({ titleKey, routePath, user, authSettled, settings }) {
  const location = useLocation();
  const params = useParams();
  const path = routePath.includes(':id') ? routePath.replace(':id', params.id || '') : routePath === '*' ? location.pathname : routePath;
  const active = location.pathname === path;
  const firstSearch = useRef(location.search).current;
  const search = active ? location.search : firstSearch;
  const next = new URLSearchParams(search).get('next');
  const decision = routePath === '*' ? { action: 'render' } : decideRoute({ path, user, authSettled, hasPreference: !!sessionStorage.getItem('userPreference'), returnTo: next });
  if (active && decision.action === 'redirect') {
    const returnPath = !user && getSafeReturnPath(path);
    const target = returnPath ? `${decision.to}?next=${encodeURIComponent(returnPath)}` : decision.to;
    return <Navigate to={target} replace />;
  }
  if (active && path === '/preference') return <Navigate to="/preference/1" replace />;

  let screen;
  if (path === '/' || path === '/home') screen = <HomeScreen user={user} settings={settings} />;
  else if (path === '/destination') screen = <DestinationScreen settings={settings} />;
  else if (path === '/recommend') screen = <RecommendScreen settings={settings} />;
  else if (path === '/courses') screen = <CoursesScreen settings={settings} />;
  else if (path === '/login' || path === '/join' || path.startsWith('/verify')) screen = <AuthScreen kind={path === '/join' ? 'join' : path.startsWith('/verify') ? 'verify' : 'login'} search={search} settings={settings} />;
  else if (path === '/preference/1' || path === '/preference/2') screen = <PreferenceScreen step={path.endsWith('/2') ? 2 : 1} settings={settings} active={active} />;
  else if (path === '/plan') screen = <PlanScreen user={user} settings={settings} />;
  else if (path === '/view' || /^\/(?:view|share)\/[a-zA-Z0-9]+$/.test(path)) screen = <ResultScreen path={path} active={active} user={user} authSettled={authSettled} settings={settings} />;
  else if (path.startsWith('/profile')) screen = <ProfileScreen key={user?.uid || 'guest'} tab={path === '/profile/personal' && new URLSearchParams(search).get('tab') === 'trips' ? 'trips' : path.split('/')[2] || 'personal'} settings={settings} active={active} />;
  else if (path === '/account-deletion-status') screen = <AccountDeletionScreen settings={settings} />;

  if (active && decision.action === 'wait') return <IonPage><IonContent className="ion-padding">{t('shellSignInRequired')}</IonContent></IonPage>;
  if (screen) return screen;
  return <IonPage>
    <IonHeader><IonToolbar>
      {path !== '/' && path !== '/home' && <IonButtons slot="start"><IonBackButton defaultHref="/" text={t('shellBack')} /></IonButtons>}
      <IonTitle>{t(titleKey)}</IonTitle>
    </IonToolbar></IonHeader>
    <IonContent className="ion-padding shell-content"><h1>{t(titleKey)}</h1><p>{t('shellCheckAddress')}</p></IonContent>
  </IonPage>;
}

function ShellRoutes({ user, authSettled, theme, lang, onThemeChange }) {
  useEffect(installPageTransitions, []);
  const location = useLocation();
  const navigate = useNavigate();
  usePlanExitGuard(location, user);
  useEffect(() => {
    const previous = window.navigate;
    window.navigate = (path, options) => {
      if (typeof path === 'string' && path.startsWith('/') && path !== window.location.pathname + window.location.search) navigate(path, options);
    };
    return () => { window.navigate = previous; };
  }, [navigate]);
  const showTabs = shouldShowTabBar({ path: location.pathname, user });
  const selectedTab = activeTabId(location.pathname + location.search);
  const icons = [homeOutline, listOutline, personOutline];
  const labels = [t('tabHome'), t('tabTrips'), t('tabProfile')];
  const settings = <SettingsControls theme={theme} onThemeChange={onThemeChange} lang={lang}  />;
  return <IonTabs>
    <IonRouterOutlet animated={false}>
      {pages.map(([path, titleKey]) => <Route key={path} path={path} element={<ShellPage titleKey={titleKey} routePath={path} user={user} authSettled={authSettled} settings={settings} />} />)}
      <Route path="*" element={<ShellPage titleKey="shellNotFound" routePath="*" user={user} authSettled={authSettled} settings={settings} />} />
    </IonRouterOutlet>

    {showTabs && <IonTabBar slot="bottom" aria-label={t('tabBarLabel')}>
      {TABS.map((tab, index) => <IonTabButton key={tab.id} tab={tab.id} href={tab.path} selected={selectedTab === tab.id}>
        <IonIcon icon={icons[index]} /><IonLabel>{labels[index]}</IonLabel>
      </IonTabButton>)}
    </IonTabBar>}
  </IonTabs>;
}

function Shell() {
  const [auth, setAuth] = useState({ user: null, settled: !!missingFirebaseConfig.length });
  const [lang, setLanguage] = useState(() => {
    if (new URLSearchParams(window.location.search).get('lang') === 'en') setLang('en');
    return getLang();
  });
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('ion-palette-dark', theme === 'dark');
    document.body.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121211' : '#FFFFFF');
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    const update = () => setLanguage(getLang());
    window.addEventListener('i18n-changed', update);
    return () => window.removeEventListener('i18n-changed', update);
  }, [lang]);
  useEffect(() => {
    const error = () => showErrorToast(t('flowDraftFailed'));
    window.addEventListener('planner-storage-error', error);
    return () => window.removeEventListener('planner-storage-error', error);
  }, []);
  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = event => {
      try { if (localStorage.getItem('theme')) return; } catch { /* Keep the current session usable. */ }
      setTheme(event.matches ? 'dark' : 'light');
    };
    systemDark.addEventListener('change', followSystem);
    return () => systemDark.removeEventListener('change', followSystem);
  }, []);
  const onThemeChange = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('theme', next); } catch { /* Keep the current session usable. */ }
  };
  useEffect(() => {
    if (missingFirebaseConfig.length) { plannerDraftStore.setUser(null); offlineTrips.setUser(null); return undefined; }
    return subscribeToAuthChanges(user => { plannerDraftStore.setUser(user?.uid); offlineTrips.setUser(user?.uid); setAuth({ user, settled: true }); });
  }, []);
  useEffect(() => {
    if (!auth.user) return;
    if (auth.user.providerData?.some(provider => provider.providerId === 'password') && !auth.user.emailVerified) void logout();
  }, [auth.user]);
  return <IonApp><IonReactRouter><ShellRoutes user={auth.user} authSettled={auth.settled} theme={theme} lang={lang} onThemeChange={onThemeChange}  /></IonReactRouter></IonApp>;
}

createRoot(document.getElementById('ionic-shell')).render(<Shell />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}
