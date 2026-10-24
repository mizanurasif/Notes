import { useActionState, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../../api'
import { getCurrentUser } from '../../auth'
import { USERLIST_LIMIT } from '../../limits'

interface User {
  _id: string
  username: string
  email: string
  role: 'user' | 'admin'
}

interface UsersResponse {
  users: User[]
  page: number
  totalPages: number
  total: number
}

interface CreateState {
  error: string
  username: string
  email: string
  role: string
}

const LIMIT = USERLIST_LIMIT

function Users() {
  const me = getCurrentUser()
  const [users, setUsers] = useState<User[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Bumped to re-fetch the current page (e.g. after add or delete)
  const [reload, setReload] = useState(true)

  useEffect(() => {
    api
      .get<UsersResponse>('/admin/users', { params: { page, limit: LIMIT } })
      .then((res) => {
        setUsers(res.data.users)
        setTotalPages(Math.max(1, res.data.totalPages))
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [page, reload])

  const [createState, createAction, isCreating] = useActionState(
    async (_prev: CreateState, formData: FormData): Promise<CreateState> => {
      const username = String(formData.get('username') ?? '').trim()
      const email = String(formData.get('email') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      const role = String(formData.get('role') ?? 'user')
      try {
        await api.post('/admin/users', { username, email, password, role })
        setShowAdd(false)
        // New users appear first, so show page 1
        if (page === 1) setReload((r) => !r)
        else setPage(1)
        return { error: '', username: '', email: '', role: 'user' }
      } catch (err) {
        return { error: getErrorMessage(err), username, email, role }
      }
    },
    { error: '', username: '', email: '', role: 'user' },
  )

  async function handleUpdate(formData: FormData) {
    setError('')
    const password = String(formData.get('password') ?? '')
    // A disabled <select> (your own role) isn't in formData, so role is only sent when present
    const role = formData.get('role')
    try {
      const res = await api.put<{ user: User }>(`/admin/users/${editingId}`, {
        username: String(formData.get('username') ?? '').trim(),
        email: String(formData.get('email') ?? '').trim(),
        ...(role && { role }),
        // Empty = keep the current password
        ...(password && { password }),
      })
      setUsers((prev) => prev.map((u) => (u._id === editingId ? res.data.user : u)))
      setEditingId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleDelete(user: User) {
    if (!window.confirm(`Delete ${user.username} and all their notes?`)) return
    setError('')
    try {
      await api.delete(`/admin/users/${user._id}`)
      // Last user on this page → go back a page, otherwise re-fetch
      if (users.length === 1 && page > 1) setPage(page - 1)
      else setReload((r) => !r)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <div className="row">
        <h1>Users</h1>
        <button onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Close' : 'Add User'}</button>
      </div>

      {showAdd && (
        <form action={createAction} className="card">
          <input name="username" placeholder="Username" defaultValue={createState.username} required />
          <input name="email" type="email" placeholder="Email" defaultValue={createState.email} required />
          <input name="password" type="password" placeholder="Password" minLength={6} required />
          <select name="role" defaultValue={createState.role}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          {createState.error && <p className="error">{createState.error}</p>}
          <button type="submit" disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <ul className="notes">
        {users.map((user) =>
          editingId === user._id ? (
            <li key={user._id}>
              <form action={handleUpdate}>
                <input name="username" defaultValue={user.username} required />
                <input name="email" type="email" defaultValue={user.email} required />
                <input name="password" type="password" placeholder="New password (optional)" minLength={6} />
                <select name="role" defaultValue={user.role} disabled={user._id === me?.id}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <div className="row">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={user._id}>
              <h3>
                <Link to={`/admin/users/${user._id}`}>{user.username}</Link>
                {user.role === 'admin' && <span className="badge">admin</span>}
              </h3>
              <p>{user.email}</p>
              <div className="row">
                <button onClick={() => setEditingId(user._id)}>Edit</button>
                {/* The server also blocks deleting yourself */}
                {user._id !== me?.id && <button onClick={() => handleDelete(user)}>Delete</button>}
              </div>
            </li>
          ),
        )}
      </ul>

      <div className="row">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}

export default Users
