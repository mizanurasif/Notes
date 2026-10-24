import { Navigate, Outlet } from 'react-router-dom'
import { getCurrentUser } from '../auth'

// Hides admin pages from normal users (the server also returns 403 for them)
function AdminRoute() {
  if (getCurrentUser()?.role !== 'admin') return <Navigate to="/notes" replace />
  return <Outlet />
}

export default AdminRoute
