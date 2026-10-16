import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, shouldShowTabBar, activeTabId } from '../src/app/tab-bar.mjs';
test('home, trips and profile are the three top-level destinations', () => {
  assert.deepEqual(TABS.map(tab=>[tab.id,tab.path]),[['home','/home'],['trips','/profile/trips'],['profile','/profile/personal']]);
  for (const path of ['/','/home','/profile/trips','/profile/personal','/profile/security']) assert.equal(shouldShowTabBar({path}),true,path);
  for (const path of ['/destination','/preference/1','/preference/2','/plan','/plan?review=1','/view','/view/abc','/share/abc','/login','/recommend','/courses']) assert.equal(shouldShowTabBar({path}),false,path);
  assert.equal(activeTabId('/home/'),'home');assert.equal(activeTabId('/profile/trips?x=1'),'trips');assert.equal(activeTabId('/profile/security'),'profile');assert.equal(activeTabId('/profile/personal?tab=trips'),'profile');assert.equal(activeTabId('/plan'),null);assert.equal(shouldShowTabBar(),false);
});
