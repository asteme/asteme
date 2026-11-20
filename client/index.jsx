import React from 'react';
import { AstemePage, AstemeNavIcon, AstemeIcon, AstemeSettingsSection } from './page.jsx';
import { AstemeComposerSwitch } from './composer.jsx';
import { AstemePageModel } from './model.mjs';
import * as copy from './copy.mjs';
import tokens from './tokens.css';
import stylesheet from './styles.css';

export const name = 'asteme-panel';
// uiWorkspace, DSH's own navigation, is asked for when it is used: a DSH without it still gets the panel.
export const inject = ['slots', 'locale', 'connection'];

export function apply(ctx) {
  const namespace = 'asteme';
  // Every language the panel has. A key missing from a language falls back to English.
  const locales = Object.fromEntries(['en', 'ja', 'zh', 'de', 'es', 'fr', 'pt', 'ru'].filter(key => copy[key]).map(key => [key, copy[key]]));
  ctx.effect(() => ctx.locale.register(namespace, locales), 'asteme: settings copy');
  const t = ctx.locale.bind(namespace);
  const model = new AstemePageModel(async (action, payload = {}) => {
    // Writing or reading a complete copy can take longer than a click.
    // So can choosing a file: the chooser stays open until the user answers it.
    const limit = action === 'pick' ? 900000 : ['export', 'import', 'backup', 'reset', 'reclaim'].includes(action) ? 180000 : 15000;
    const result = await ctx.connection.rpc.call('/api', `asteme.${action}`, payload, AbortSignal.timeout(limit));
    if (!result.ok) {
      const error = new Error(result.error.message);
      error.code = result.error.code;
      throw error;
    }
    return result.value;
  });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-asteme';
    // Tokens first: the theme, then the styles that read it.
    style.textContent = tokens + '\n' + stylesheet;
    document.head.append(style);
    return () => { style.remove(); model.dispose(); };
  }, 'asteme: settings lifecycle');
  ctx.on('connection/reset', () => {
    if (model.getSnapshot().snapshot) void model.refresh(model.getSnapshot().snapshot.projectId);
  });
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'asteme', locale: namespace,
    // Opening a DSH session from Asteme's conversation uses DSH's own navigation, when this DSH has it.
    inject: () => ({ model, t, openSession: (id) => { try { const ui = ctx.get('uiWorkspace'); if (!ui?.openSession) return false; ui.openSession(id); return true; } catch { return false; } } }),
  }, AstemePage));
  // Asteme's settings also stand in DSH's own settings, where a person looks for settings: the same view and the same model as in the panel, not a second one to keep in step.
  // Asked for where this DSH has that place; nothing else depends on it.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'asteme', order: 60, label: () => 'Asteme', locale: namespace,
    inject: () => ({ model, t }),
  }, AstemeSettingsSection));
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'asteme', locale: namespace,
  }, ({ size = 16 }) => React.createElement(AstemeIcon, { size })));
  // A small control in the composer: whether this conversation is remembered.
  // It appears only where the host has that place; nothing else depends on it.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'asteme', order: 60, locale: namespace,
    inject: sessionId => ({
      label: key => t(key),
      read: () => model.request('session', { session: String(sessionId) }),
      set: on => model.request('session', { session: String(sessionId), remember: on }),
    }),
  }, AstemeComposerSwitch));
  // The icon in the side bar carries a mark while Asteme has said something unseen.
  const unseen = () => model.request('unseen'), unseenLabel = n => t(n === 1 ? 'navUnseenOne' : 'navUnseen').replace('{n}', String(n));
  const NavIcon = props => React.createElement(AstemeNavIcon, { ...props, ask: unseen, label: unseenLabel });
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'asteme', order: 18,
    label: () => t('nav'), locale: namespace,
  }, NavIcon));
}
