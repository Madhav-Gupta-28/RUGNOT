const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function withBase(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(withBase(path));
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const adminToken = localStorage.getItem('RUGNOT_ADMIN_TOKEN') || 'local-test-token';
  const response = await fetch(withBase(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
