import { useActionState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../api'
import { CONTENT_MAX, TITLE_MAX } from '../limits'

interface CreateNoteState {
  error: string
  title: string
  content: string
}

function CreateNote() {
  const navigate = useNavigate()

  const [state, formAction, isPending] = useActionState(
    async (_prev: CreateNoteState, formData: FormData): Promise<CreateNoteState> => {
      const title = String(formData.get('title') ?? '').trim()
      const content = String(formData.get('content') ?? '')
      try {
        if (!title) return { error: 'Title cannot be only spaces', title, content } //requre allow only space" "
        await api.post('/notes', { title, content })
        navigate('/notes')
        return { error: '', title: '', content: '' }
      } catch (err) {
        // Return the typed values so the fields keep them after React resets the form
        return { error: getErrorMessage(err), title, content }
      }
    },
    { error: '', title: '', content: '' },
  )

  return (
    <form action={formAction}>
      <h1>Create Note</h1>
      <input name="title" placeholder="Title" defaultValue={state.title} maxLength={TITLE_MAX} required />
      <textarea
        name="content"
        placeholder="Content"
        defaultValue={state.content}
        maxLength={CONTENT_MAX}
      />
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Add Note'}
      </button>
    </form>
  )
}

export default CreateNote
