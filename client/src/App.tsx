import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedLayout from './components/ProtectedLayout'
import CreateNote from './pages/CreateNote'
import Interests from './pages/Interests'
import Login from './pages/Login'
import Notes from './pages/Notes'
import NoteView from './pages/NoteView'
import Posts from './pages/Posts'
import PostView from './pages/PostView'
import Profile from './pages/Profile'
import Register from './pages/Register'
import UserPosts from './pages/UserPosts'
import UserNoteView from './pages/admin/UserNoteView'
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
          <Route path="/notes/:noteId" element={<NoteView />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/interests" element={<Interests />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/posts/:postId" element={<PostView />} />
          <Route path="/users/:userId/posts" element={<UserPosts />} />

          {/* Admin only */}
          <Route element={<AdminRoute />}>
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/users/:userId" element={<UserNotes />} />
            <Route path="/admin/users/:userId/notes/:noteId" element={<UserNoteView />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/notes" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
