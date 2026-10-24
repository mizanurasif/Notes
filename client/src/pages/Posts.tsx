import { useActionState, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api'
import { getCurrentUser } from '../auth'
import { POST_BODY_MAX, POST_TITLE_MAX } from '../limits'

interface Post {
  _id: string
  title: string
  body: string
  createdAt: string
  author: { _id: string; username: string } | null
}

interface PostsResponse {
  posts: Post[]
  page: number
  totalPages: number
  total: number
}

interface CreateState {
  error: string
  title: string
  body: string
}

const LIMIT = 5

function Posts() {
  const me = getCurrentUser()
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState('')

  // Only one post is edited at a time
  const [editingId, setEditingId] = useState<string | null>(null)

  // Bumped to re-fetch the current page (e.g. after create or delete)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api
      .get<PostsResponse>('/posts', { params: { page, limit: LIMIT } })
      .then((res) => {
        setPosts(res.data.posts)
        setTotalPages(Math.max(1, res.data.totalPages))
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [page, reload])

  const [createState, createAction, isCreating] = useActionState(
    async (_prev: CreateState, formData: FormData): Promise<CreateState> => {
      const title = String(formData.get('title') ?? '').trim()
      const body = String(formData.get('body') ?? '').trim()
      if (!title || !body) return { error: 'Title and body are required', title, body }
      try {
        await api.post('/posts', { title, body })
        // New posts appear first, so show page 1
        if (page === 1) setReload((r) => r + 1)
        else setPage(1)
        return { error: '', title: '', body: '' }
      } catch (err) {
        return { error: getErrorMessage(err), title, body }
      }
    },
    { error: '', title: '', body: '' },
  )

  async function handleUpdate(formData: FormData) {
    setError('')
    const title = String(formData.get('title') ?? '').trim()
    const body = String(formData.get('body') ?? '').trim()
    if (!title || !body) return setError('Title and body are required')
    try {
      const res = await api.put<{ post: Omit<Post, 'author'> }>(`/posts/${editingId}`, { title, body })
      // The response has no author, so keep the one already in the list
      setPosts((prev) => prev.map((p) => (p._id === editingId ? { ...p, ...res.data.post } : p)))
      setEditingId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this post?')) return
    setError('')
    try {
      await api.delete(`/posts/${id}`)
      // Last post on this page → go back a page, otherwise re-fetch
      if (posts.length === 1 && page > 1) setPage(page - 1)
      else setReload((r) => r + 1)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <h1>Posts</h1>

      <form action={createAction} className="card">
        <input name="title" placeholder="Title" defaultValue={createState.title} maxLength={POST_TITLE_MAX} required />
        <textarea
          name="body"
          placeholder="What's on your mind?"
          defaultValue={createState.body}
          maxLength={POST_BODY_MAX}
          required
        />
        {createState.error && <p className="error">{createState.error}</p>}
        <button type="submit" disabled={isCreating}>
          {isCreating ? 'Posting...' : 'Post'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {posts.length === 0 && <p>No posts yet.</p>}

      <ul className="notes">
        {posts.map((post) =>
          editingId === post._id ? (
            <li key={post._id}>
              <form action={handleUpdate}>
                <input name="title" defaultValue={post.title} maxLength={POST_TITLE_MAX} required />
                <textarea name="body" defaultValue={post.body} maxLength={POST_BODY_MAX} required />
                <div className="row">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={post._id}>
              <h3>
                <Link to={`/posts/${post._id}`}>{post.title}</Link>
              </h3>
              <small>
                by{' '}
                {post.author ? <Link to={`/users/${post.author._id}/posts`}>{post.author.username}</Link> : 'deleted user'} ·{' '}
                {new Date(post.createdAt).toLocaleString()}
              </small>
              <p>{post.body}</p>
              {post.author?._id === me?.id && (
                <div className="row">
                  <button onClick={() => setEditingId(post._id)}>Edit</button>
                  <button onClick={() => handleDelete(post._id)}>Delete</button>
                </div>
              )}
            </li>
          ),
        )}
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

export default Posts
