import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api'
import { CONTENT_MAX, TITLE_MAX } from '../limits'

interface Note {
  _id: string
  title: string
  content: string
}

interface NotesResponse {
  notes: Note[]
  page: number
  totalPages: number
  total: number
}

const LIMIT = 5

function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState('')

  // Only one note is edited at a time
  const [editingId, setEditingId] = useState<string | null>(null)

  // Bumped to re-fetch the current page (e.g. after a delete)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api
      .get<NotesResponse>('/notes', { params: { page, limit: LIMIT } })
      .then((res) => {
        setNotes(res.data.notes)
        setTotalPages(Math.max(1, res.data.totalPages))
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [page, reload])

  async function handleUpdate(formData: FormData) {
    setError('')
    const title = String(formData.get('title') ?? '').trim()
    if (!title) return setError('Title cannot be only spaces')
    try {
      const res = await api.put<{ note: Note }>(`/notes/${editingId}`, {
        title,
        content: formData.get('content'),
      })
      setNotes((prev) => prev.map((n) => (n._id === editingId ? res.data.note : n)))
      setEditingId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this note?')) return
    setError('')
    try {
      await api.delete(`/notes/${id}`)
      // Last note on this page → go back a page, otherwise re-fetch so the next note moves up
      if (notes.length === 1 && page > 1) setPage(page - 1)
      else setReload((r) => r + 1)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <h1>All Notes</h1>

      {error && <p className="error">{error}</p>}

      {notes.length === 0 && <p>No notes yet.</p>}

      <ul className="notes">
        {notes.map((note) =>
          editingId === note._id ? (
            <li key={note._id}>
              <form action={handleUpdate}>
                <input name="title" defaultValue={note.title} maxLength={TITLE_MAX} required />
                <textarea name="content" defaultValue={note.content} maxLength={CONTENT_MAX} />
                <div className="row">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={note._id}>
              <h3>{note.title}</h3>
              <p>{note.content}</p>
              <div className="row">
                <button onClick={() => setEditingId(note._id)}>Edit</button>
                <button onClick={() => handleDelete(note._id)}>Delete</button>
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

export default Notes
