import { useParams } from 'react-router-dom'
import NoteDetail from '../components/NoteDetail'

// /notes/:noteId: one of your own notes
function NoteView() {
  const { noteId } = useParams()
  return <NoteDetail apiPath={`/notes/${noteId}`} backTo="/notes" />
}

export default NoteView
