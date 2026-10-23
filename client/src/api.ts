import axios from 'axios'

const api = axios.create({ baseURL: 'api'})

// Attach the JWT to every request once the user is logged in
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? err.message
  return 'Something went wrong'
}

export default api
