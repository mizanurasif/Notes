import NoteList from '../components/NoteList'

function Notes() {
  return (
    <div>
      <h1>All Notes</h1>
      <NoteList basePath="/notes" />
    </div>
  )
}

export default Notes
