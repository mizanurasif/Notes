import { useActionState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../api'

interface RegisterState {
  error: string
  username: string
  email: string
}

function Register() {
  const navigate = useNavigate()

  const [state, formAction, isPending] = useActionState(
    async (_prev: RegisterState, formData: FormData): Promise<RegisterState> => {
      const username = String(formData.get('username'))
      const email = String(formData.get('email'))
      const password = String(formData.get('password'))
      try {
        await api.post('/auth/register', { username, email, password })
        // Drop any previous session so the next screen can't show the old account
        localStorage.removeItem('token')
        navigate('/login')
        return { error: '', username, email }
      } catch (err) {
        // Return the typed values so the fields keep them after React resets the form
        return { error: getErrorMessage(err), username, email }
      }
    },
    { error: '', username: '', email: '' },
  )

  return (
    <form action={formAction}>
      <h1>Register</h1>
      <label>
        Username
        <input name="username" defaultValue={state.username} required />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={state.email} required />
      </label>
      <label>
        Password
        <input name="password" type="password" minLength={6} required />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Registering...' : 'Register'}
      </button>
      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </form>
  )
}

export default Register
