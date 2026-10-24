import { Navigate, Outlet } from 'react-router-dom'
import Navbar from './Navbar'

// Wraps every logged-in page: redirects to /login without a token, otherwise shows the navbar
function ProtectedLayout() {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />

  return (
    <>
      <Navbar />
      <Outlet />
    </>
  )
}

export default ProtectedLayout
