import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedLayout from './components/ProtectedLayout'
import CreateNote from './pages/CreateNote'
import Interests from './pages/Interests'
import Login from './pages/Login'
import Notes from './pages/Notes'
import Profile from './pages/Profile'
import Register from './pages/Register'
import UserNotes from './pages/admin/UserNotes'
import Users from './pages/admin/Users'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Logged-in pages share the navbar */}
        <Route element={<ProtectedLayout />}>
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/new" element={<CreateNote />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/interests" element={<Interests />} />

          {/* Admin only */}
          <Route element={<AdminRoute />}>
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/users/:userId" element={<UserNotes />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/notes" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
