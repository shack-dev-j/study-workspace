// Talks to the local Python server. Every write sends X-Requested-By so
// other websites can't change your data.

const HDR = { 'X-Requested-By': 'study-workspace' };

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(method, url, body, extra = {}) {
  const opts = { method, headers: { ...HDR, ...extra } };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer) opts.body = body;
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let res;
  try { res = await fetch(url, opts); }
  catch (e) { throw new ApiError(0, 'The app server is not running. Start Study Workspace again.'); }
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || res.statusText);
  return data;
}

export const api = {
  get: url => call('GET', url),
  put: (url, body) => call('PUT', url, body),
  post: (url, body) => call('POST', url, body ?? {}),
  del: url => call('DELETE', url),
  /** Upload a raw body (zip restore etc.). */
  postRaw: (url, blob, type = 'application/octet-stream') => call('POST', url, blob, { 'Content-Type': type }),
};

/** Upload one File. onProgress(0..1). Resolves to file metadata {id, name, size, type}. */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/files');
    x.setRequestHeader('X-Requested-By', 'study-workspace');
    x.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'file'));
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = null;
      try { d = JSON.parse(x.responseText); } catch (e) { /* ignore */ }
      if (x.status === 201 && d) resolve(d);
      else reject(new ApiError(x.status, (d && d.error) || 'Upload failed'));
    };
    x.onerror = () => reject(new ApiError(0, 'Upload failed: server not reachable'));
    x.send(file);
  });
}

export const fileUrl = (f, download) => `/api/files/${f.id}${download ? '?download=1' : ''}`;
export const linkedUrl = (path, download) => `/api/linked?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`;
