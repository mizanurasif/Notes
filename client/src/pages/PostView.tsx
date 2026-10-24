import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../api'

interface Post {
  _id: string
  title: string
  body: string
  createdAt: string
  author: { _id: string; username: string } | null
}

// /posts/:postId: one post in full (no 3-line clamp)
function PostView() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<{ post: Post }>(`/posts/${postId}`)
      .then((res) => setPost(res.data.post))
      .catch((err) => setError(getErrorMessage(err)))
  }, [postId])

  return (
    <div>
      {/* Back to wherever the user came from (the feed or someone's posts) */}
      <button onClick={() => navigate(-1)}>← Back</button>
      {error && <p className="error">{error}</p>}
      {!post && !error && <p>Loading...</p>}
      {post && (
        <article className="note-detail">
          <h1>{post.title}</h1>
          <small>
            by{' '}
            {post.author ? <Link to={`/users/${post.author._id}/posts`}>{post.author.username}</Link> : 'deleted user'} ·{' '}
            {new Date(post.createdAt).toLocaleString()}
          </small>
          <p>{post.body}</p>
        </article>
      )}
    </div>
  )
}

export default PostView
