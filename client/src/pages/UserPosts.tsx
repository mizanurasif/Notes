import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../api'

interface UserPost {
  _id: string
  title: string
  body: string
  createdAt: string
}

// Response of GET /api/posts/user/:userId (scenario 2: one aggregate with $lookup)
interface UserPostsResponse {
  user: { _id: string; username: string }
  posts: UserPost[]
  total: number
  page: number
  totalPages: number
}

const LIMIT = 5

function UserPosts() {
  const { userId } = useParams()
  const [data, setData] = useState<UserPostsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<UserPostsResponse>(`/posts/user/${userId}`, { params: { page, limit: LIMIT } })
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err)))
  }, [userId, page])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Loading...</p>

  const totalPages = Math.max(1, data.totalPages)

  return (
    <div>
      <Link to="/posts">← All posts</Link>
      <h1>{data.user.username}'s Posts</h1>
      <p>{data.total} post(s)</p>

      {data.posts.length === 0 && <p>No posts yet.</p>}

      <ul className="notes">
        {data.posts.map((post) => (
          <li key={post._id}>
            <h3>
              <Link to={`/posts/${post._id}`}>{post.title}</Link>
            </h3>
            <small>{new Date(post.createdAt).toLocaleString()}</small>
            <p>{post.body}</p>
          </li>
        ))}
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

export default UserPosts
