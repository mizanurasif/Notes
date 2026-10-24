import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../api'
import NoteList from '../../components/NoteList'

interface User {
  _id: string
  username: string
  email: string
}

function UserNotes() {
  const { userId } = useParams()
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<{ user: User }>(`/admin/users/${userId}`)
      .then((res) => setUser(res.data.user))
      .catch((err) => setError(getErrorMessage(err)))
  }, [userId])

  if (error) return <p className="error">{error}</p>
  if (!user) return <p>Loading...</p>

  return (
    <div>
      <Link to="/admin/users">← Back to users</Link>
      <h1>{user.username}'s Notes</h1>
      <p>{user.email}</p>
      {/* key resets the list when switching between users */}
      <NoteList key={user._id} basePath={`/admin/users/${user._id}/notes`} showCreate={true} />
    </div>
  )
}

export default UserNotes
