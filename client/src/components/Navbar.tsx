import { NavLink, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../auth'

function Navbar() {
  const navigate = useNavigate()
  const isAdmin = getCurrentUser()?.role === 'admin'

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <NavLink to="/notes" end>
        All Notes
      </NavLink>
      <NavLink to="/notes/new">Create</NavLink>
      <NavLink to="/posts">Posts</NavLink>
      <NavLink to="/interests">Interests</NavLink>
      <NavLink to="/profile">Profile</NavLink>
      {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
      <button onClick={logout}>Logout</button>
    </nav>
  )
}

export default Navbar
