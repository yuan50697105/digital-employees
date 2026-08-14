/** API 封装 */
const BASE = '/api';

async function request(path, options = {}) {
  const resp = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败 (${resp.status})`);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  patch: (p, body) => request(p, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (p) => request(p, { method: 'DELETE' }),

  dashboard: () => request('/dashboard'),
  employees: () => request('/employees'),
  createEmployee: (b) => request('/employees', { method: 'POST', body: JSON.stringify(b) }),
  updateEmployee: (id, b) => request(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),

  tasks: (params = '') => request('/tasks' + params),
  task: (id) => request(`/tasks/${id}`),
  createTask: (b) => request('/tasks', { method: 'POST', body: JSON.stringify(b) }),
  retryTask: (id) => request(`/tasks/${id}/retry`, { method: 'POST' }),
  cancelTask: (id) => request(`/tasks/${id}/cancel`, { method: 'POST' }),

  conversations: () => request('/conversations'),
  conversation: (id) => request(`/conversations/${id}`),
  createConversation: (b) => request('/conversations', { method: 'POST', body: JSON.stringify(b) }),
  sendMessage: (id, content) =>
    request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  schedules: () => request('/schedules'),
  createSchedule: (b) => request('/schedules', { method: 'POST', body: JSON.stringify(b) }),
  updateSchedule: (id, b) => request(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),
  skills: () => request('/schedules/skills/list'),

  settings: () => request('/settings'),
  saveSettings: (b) => request('/settings', { method: 'PUT', body: JSON.stringify(b) }),
  logs: (limit = 100) => request(`/logs?limit=${limit}`),

  upload: (name, data) => request('/uploads', { method: 'POST', body: JSON.stringify({ name, data }) }),
  uploads: () => request('/uploads'),
};

export function fmtTime(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').slice(0, 19);
}
