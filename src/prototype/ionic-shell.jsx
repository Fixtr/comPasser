import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  IonApp, IonBackButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton,
  IonTabs, IonTitle, IonToolbar, setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { calendarOutline, listOutline, personOutline } from 'ionicons/icons';
import { decideRoute, getSafeReturnPath } from '../app/route-decision.mjs';
import { activeTabId, shouldShowTabBar, TABS } from '../app/tab-bar.mjs';
import { logout, missingFirebaseConfig, subscribeToAuthChanges } from '../domains/auth/services/firebase-auth.js';
import { getLang, setLang, t } from '../utils/i18n.js';
import { trackEvent } from '../utils/analytics.js';
import { HomeScreen, AuthScreen, PreferenceScreen, PlanScreen, ResultScreen, ProfileScreen, AccountDeletionScreen } from './ionic-screens.jsx';

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
  ['/', 'heroTitle'], ['/home', 'heroTitle'], ['/login', 'authEmailLoginBtn'], ['/join', 'joinTitle'],
  ['/verify', 'verifyPendingTitle'], ['/account-deletion-status', 'shellAccountDeletion'],
  ['/preference', 'shellPreferences'], ['/preference/1', 'shellPreferences'], ['/preference/2', 'shellBudget'], ['/plan', 'tabPlan'],
  ['/profile', 'tabProfile'], ['/profile/trips', 'tabTrips'], ['/profile/personal', 'tabProfile'],
  ['/profile/security', 'shellSecurity'], ['/view/:id', 'shellResult'], ['/share/:id', 'shellShared'],
  ['/view', 'shellResult'],
];

function SettingsControls({ theme, onThemeChange, lang, onLanguageChange }) {
  return <div className="ionic-settings" role="group" aria-label={lang === 'ko' ? '화면 설정' : 'Display settings'}>
    <button type="button" onClick={onLanguageChange} aria-label={lang === 'ko' ? 'Switch to English' : '한국어로 변경'}>{lang === 'ko' ? 'English' : '한국어'}</button>
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
  else if (path === '/login' || path === '/join' || path.startsWith('/verify')) screen = <AuthScreen kind={path === '/join' ? 'join' : path.startsWith('/verify') ? 'verify' : 'login'} search={search} />;
  else if (path === '/preference/1' || path === '/preference/2') screen = <PreferenceScreen step={path.endsWith('/2') ? 2 : 1} />;
  else if (path === '/plan') screen = <PlanScreen user={user} />;
  else if (path === '/view' || /^\/(?:view|share)\/[a-zA-Z0-9]+$/.test(path)) screen = <ResultScreen path={path} active={active} user={user} authSettled={authSettled} settings={settings} />;
  else if (path.startsWith('/profile')) screen = <ProfileScreen tab={path.split('/')[2] || 'personal'} />;
  else if (path === '/account-deletion-status') screen = <AccountDeletionScreen />;

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

function ShellRoutes({ user, authSettled, theme, lang, onThemeChange, onLanguageChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const previous = window.navigate;
    window.navigate = path => {
      if (typeof path === 'string' && path.startsWith('/') && path !== window.location.pathname + window.location.search) navigate(path);
    };
    return () => { window.navigate = previous; };
  }, [navigate]);
  const showTabs = shouldShowTabBar({ path: location.pathname, user });
  const selectedTab = activeTabId(location.pathname);
  const icons = [calendarOutline, listOutline, personOutline];
  const labels = [t('tabPlan'), t('tabTrips'), t('tabProfile')];
  const settings = <SettingsControls theme={theme} onThemeChange={onThemeChange} lang={lang} onLanguageChange={onLanguageChange} />;
  const resultPath = /^\/(?:view|share)(?:\/|$)/.test(location.pathname);
  return <IonTabs>
    <IonRouterOutlet>
      {pages.map(([path, titleKey]) => <Route key={path} path={path} element={<ShellPage titleKey={titleKey} routePath={path} user={user} authSettled={authSettled} settings={settings} />} />)}
      <Route path="*" element={<ShellPage titleKey="shellNotFound" routePath="*" user={user} authSettled={authSettled} settings={settings} />} />
    </IonRouterOutlet>
    {!resultPath && location.pathname !== '/' && location.pathname !== '/home' && settings}
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121211' : '#F4F4F1');
  }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
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
  const onLanguageChange = () => {
    const next = lang === 'ko' ? 'en' : 'ko';
    setLang(next);
    setLanguage(next);
    trackEvent('change_language', { language: next });
  };
  useEffect(() => {
    if (missingFirebaseConfig.length) return undefined;
    return subscribeToAuthChanges(user => setAuth({ user, settled: true }));
  }, []);
  useEffect(() => {
    if (!auth.user) return;
    if (auth.user.providerData?.some(provider => provider.providerId === 'password') && !auth.user.emailVerified) void logout();
  }, [auth.user]);
  return <IonApp><IonReactRouter><ShellRoutes user={auth.user} authSettled={auth.settled} theme={theme} lang={lang} onThemeChange={onThemeChange} onLanguageChange={onLanguageChange} /></IonReactRouter></IonApp>;
}

createRoot(document.getElementById('ionic-shell')).render(<Shell />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}
