import { useActionState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../api'

interface LoginState {
  error: string
  identifier: string
}

function Login() {
  const navigate = useNavigate()

  const [state, formAction, isPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const identifier = String(formData.get('identifier'))
      const password = String(formData.get('password'))
      try {
        const res = await api.post<{ token: string }>('/auth/login', { identifier, password })
        localStorage.setItem('token', res.data.token)
        navigate('/notes')
        return { error: '', identifier }
      } catch (err) {
        // Return identifier so the field keeps its value after React resets the form
        return { error: getErrorMessage(err), identifier }
      }
    },
    { error: '', identifier: '' },
  )

  return (
    <form action={formAction}>
      <h1>Login</h1>
      <label>
        Username or Email
        <input name="identifier" defaultValue={state.identifier} required />
      </label>
      <label>
        Password
        <input name="password" type="password" required />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Logging in...' : 'Login'}
      </button>
      <p>
        No account? <Link to="/register">Register</Link>
      </p>
    </form>
  )
}

export default Login
