import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedLayout from './components/ProtectedLayout'
import CreateNote from './pages/CreateNote'
import Login from './pages/Login'
import Notes from './pages/Notes'
import Register from './pages/Register'

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
        </Route>

        <Route path="*" element={<Navigate to="/notes" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
