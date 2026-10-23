import { NavLink, useNavigate } from 'react-router-dom'

function Navbar() {
  const navigate = useNavigate()

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
      <button onClick={logout}>Logout</button>
    </nav>
  )
}

export default Navbar
