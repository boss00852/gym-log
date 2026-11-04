import { createApp } from './app.js';
import { createApi } from './api.js';
import { createStorage } from './store.js';

let ls = null;
try { ls = window.localStorage; } catch (e) {}
const storage = createStorage(ls);
const cfg = window.GYMLOG_CONFIG || {};
const api = createApi({ storage, fetchFn: (...a) => window.fetch(...a), defaultUrl: cfg.apiUrl || '' });
const app = createApp({ win: window, api, storage, opts: { googleClientId: cfg.googleClientId || '' } });
window.__gl = app;
app.start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
