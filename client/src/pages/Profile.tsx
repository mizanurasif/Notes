import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api'
import { INTEREST_MAX_LENGTH, MAX_INTERESTS } from '../limits'

interface Profile {
  _id: string
  username: string
  email: string
  role: 'user' | 'admin'
  interests: string[]
}

function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<{ user: Profile }>('/users/me')
      .then((res) => setProfile(res.data.user))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  // Adds ONE interest; the form clears itself after the action finishes
  async function handleAdd(formData: FormData) {
    setError('')
    // Same normalising as the server: "  Chess " → "chess"
    const interest = String(formData.get('interest') ?? '').trim().toLowerCase()
    if (!interest) return

    // Check the current list first so we don't send a request we know will fail
    if (profile?.interests.includes(interest)) {
      return setError(`You already have "${interest}"`)
    }

    // The server checks again (another tab may have added it), and its message is shown below
    try {
      const res = await api.post<{ user: Profile }>('/users/me/interests', { interest })
      setProfile(res.data.user)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleRemove(interest: string) {
    setError('')
    try {
      const res = await api.delete<{ user: Profile }>(`/users/me/interests/${encodeURIComponent(interest)}`) //An interest with special characters (c++ & go) (the URL is encoded)
      setProfile(res.data.user)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!profile) return error ? <p className="error">{error}</p> : <p>Loading...</p>

  const isFull = profile.interests.length >= MAX_INTERESTS

  return (
    <div>
      <h1>Profile</h1>
      <p>
        <strong>{profile.username}</strong> · {profile.email} · {profile.role}
      </p>

      <h3>
        Interests ({profile.interests.length}/{MAX_INTERESTS})
      </h3>
      {profile.interests.length === 0 ? (
        <p>No interests yet.</p>
      ) : (
        <ul className="chips">
          {profile.interests.map((interest) => (
            <li key={interest}>
              {interest}
              <button onClick={() => handleRemove(interest)} aria-label={`Remove ${interest}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={handleAdd} className="row">
        <input
          name="interest"
          placeholder={isFull ? 'Maximum reached' : 'Add an interest, e.g. chess'}
          maxLength={INTEREST_MAX_LENGTH}
          disabled={isFull}
          required
        />
        <button type="submit" disabled={isFull}>
          Add
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default Profile
