import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

function Home() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    api
      .get<{ message: string }>('/hello')
      .then((res) => setMessage(res.data.message))
      .catch(() => setMessage('Could not reach server'))
  }, [])

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div>
      <h1>{message}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

export default Home
