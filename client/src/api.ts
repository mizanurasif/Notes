import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach the JWT to every request once the user is logged in
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Token expired or invalid → log out and go to the login page.
// Skipped for /auth requests so a wrong password on the login page just shows the error.
// Sliding expiration: the server sends a fresh token when the current one is getting old.
api.interceptors.response.use(
  (res) => {
    const newToken = res.headers['x-new-token']
    if (newToken) localStorage.setItem('token', newToken)
    return res
  },
  (err) => {
    const isAuthRequest = err.config?.url?.startsWith('/auth')
    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? err.message
  return 'Something went wrong'
}

export default api
