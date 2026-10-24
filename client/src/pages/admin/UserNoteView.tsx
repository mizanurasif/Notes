import { useParams } from 'react-router-dom'
import NoteDetail from '../../components/NoteDetail'

// /admin/users/:userId/notes/:noteId: one note of any user (admin only)
function UserNoteView() {
  const { userId, noteId } = useParams()
  return <NoteDetail apiPath={`/admin/users/${userId}/notes/${noteId}`} backTo={`/admin/users/${userId}`} />
}

export default UserNoteView
