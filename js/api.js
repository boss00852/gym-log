// เรียก Apps Script Web App: POST body เป็น text/plain (ไม่มี custom header, ไม่ส่ง credentials → ไม่มี CORS preflight)
export const KEY_URL = 'gl_api_url';
export const KEY_TOKEN = 'gl_token';

export class ApiError extends Error {
  constructor(code, msg) {
    super(msg || code);
    this.code = code; // not-configured | network | unauthorized | server | bad-response
  }
}

export function validApiUrl(u) {
  return /^https:\/\/[^\s]+$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/.test(u);
}

export function createApi({ storage, fetchFn, defaultUrl = '' }) {
  const api = {
    getUrl: () => storage.get(KEY_URL, '') || defaultUrl || '',
    hasToken: () => !!storage.get(KEY_TOKEN, ''),
    configured: () => !!(api.getUrl() && api.hasToken()),
    save(url, token) {
      if (url !== undefined) storage.set(KEY_URL, String(url).trim());
      if (token) storage.set(KEY_TOKEN, String(token).trim());
    },
    async call(action, args = [], opId, override) {
      const url = (override && override.url) || api.getUrl();
      const token = (override && override.token) || storage.get(KEY_TOKEN, '');
      if (!url || !token) throw new ApiError('not-configured');
      let res;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          body: JSON.stringify({ token, action, args, opId }),
          redirect: 'follow',
          credentials: 'omit'
        });
      } catch (e) {
        throw new ApiError('network', String(e && e.message));
      }
      let j;
      try {
        j = await res.json();
      } catch (e) {
        throw new ApiError('bad-response');
      }
      if (!j || typeof j !== 'object') throw new ApiError('bad-response');
      if (j.ok) return j.data;
      if (j.error === 'unauthorized') throw new ApiError('unauthorized');
      throw new ApiError('server', j.error);
    },
    // ทดสอบการเชื่อมต่อด้วยค่าที่ยังไม่บันทึก
    async test(url, token) {
      const d = await api.call('sessions', [0, 1], undefined, { url, token });
      return { total: d.total };
    }
  };
  return api;
}
