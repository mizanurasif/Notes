import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api'

interface Note {
  _id: string
  title: string
  content: string
}

interface NoteDetailProps {
  // API to load the note from, e.g. "/notes/123" or "/admin/users/abc/notes/123"
  apiPath: string
  // Where the "back" link goes
  backTo: string
}

// Shows one note in full (no 3-line clamp)
function NoteDetail({ apiPath, backTo }: NoteDetailProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<{ note: Note }>(apiPath)
      .then((res) => setNote(res.data.note))
      .catch((err) => setError(getErrorMessage(err)))
  }, [apiPath])

  return (
    <div>
      <Link to={backTo}>← Back</Link>
      {error && <p className="error">{error}</p>}
      {!note && !error && <p>Loading...</p>}
      {note && (
        <article className="note-detail">
          <h1>{note.title}</h1>
          <p>{note.content || <em>No content</em>}</p>
        </article>
      )}
    </div>
  )
}

export default NoteDetail
