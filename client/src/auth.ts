export interface CurrentUser {
  id: string
  role: 'user' | 'admin'
}

// Reads { id, role } from the JWT payload (the middle part, base64url-encoded JSON).
// Only used to decide what to SHOW; the server still checks the role on every admin request.
export function getCurrentUser(): CurrentUser | null {
  const token = localStorage.getItem('token')
  if (!token) return null
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    return { id: payload.id, role: payload.role }
  } catch {
    return null
  }
}
