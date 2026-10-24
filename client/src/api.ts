import axios, { type InternalAxiosRequestConfig } from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach the JWT to every request once the user is logged in
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function sentToken(config?: InternalAxiosRequestConfig) {
  return String(config?.headers?.Authorization ?? '').replace('Bearer ', '')
}

// Whether the request was sent with the token we still have stored.
// If another login happened while the request was in flight, its response must not
// touch the new token (otherwise one account's token could overwrite another's).
function sentWithCurrentToken(config?: InternalAxiosRequestConfig) {
  const sent = sentToken(config)
  return sent !== '' && sent === localStorage.getItem('token')
}

function readPayload(token: string): { id: string; exp: number } | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

// Only accept a renewed token for the SAME user that lasts LONGER than the one we sent.
// Guards against a stale X-New-Token (e.g. from a cached response) replacing a good token.
function isValidRenewal(newToken: string, config?: InternalAxiosRequestConfig) {
  const next = readPayload(newToken)
  const current = readPayload(sentToken(config))
  return !!next && !!current && next.id === current.id && next.exp > current.exp
}

api.interceptors.response.use(
  (res) => {
    // Sliding expiration: the server sends a fresh token when the current one is getting old
    const newToken = res.headers['x-new-token']
    if (newToken && sentWithCurrentToken(res.config) && isValidRenewal(newToken, res.config)) {
      localStorage.setItem('token', newToken)
    }
    return res
  },
  (err) => {
    // Token expired or invalid → log out and go to the login page.
    // Skipped for /auth requests so a wrong password on the login page just shows the error.
    const isAuthRequest = err.config?.url?.startsWith('/auth')
    if (err.response?.status === 401 && !isAuthRequest && sentWithCurrentToken(err.config)) {
      // Shown once on the login page, so it's clear WHY the user was logged out
      sessionStorage.setItem('logoutReason', err.response?.data?.message ?? 'Unauthorized')
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// localStorage is shared by every tab. If another tab logs in as someone else (or logs out),
// reload this tab so it never keeps showing one account while sending another account's token.
window.addEventListener('storage', (e) => {
  if (e.key === 'token' && e.oldValue !== e.newValue) window.location.reload()
})

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? err.message
  return 'Something went wrong'
}

export default api
