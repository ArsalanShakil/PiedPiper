export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (body as Record<string, string>).error || `GET ${url} failed`)
  }
  return res.json() as Promise<T>
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  })
  const json = await res.json() as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json.error || 'Request failed')
  return json
}

export async function apiPut<T>(url: string, data: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json() as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json.error || 'Request failed')
  return json
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, 'Delete failed')
}

export async function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: formData })
  const json = await res.json() as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json.error || 'Upload failed')
  return json
}

export function keepalivePut(url: string, data: unknown): void {
  fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    keepalive: true,
  }).catch(() => {})
}
