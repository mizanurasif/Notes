import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api'

interface InterestGroup {
  interest: string
  count: number
  users: { _id: string; username: string }[]
}

interface GroupsResponse {
  groups: InterestGroup[]
  page: number
  totalPages: number
  total: number
}

const LIMIT = 5

function Interests() {
  const [groups, setGroups] = useState<InterestGroup[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  // Optional filter; empty = show every interest group (scenario 1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<GroupsResponse>('/users/by-interest', {
        params: { page, limit: LIMIT, ...(search && { interest: search }) },
      })
      .then((res) => {
        setGroups(res.data.groups)
        setTotalPages(Math.max(1, res.data.totalPages))
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [page, search])

  function handleSearch(formData: FormData) {
    setError('')
    setSearch(String(formData.get('interest') ?? '').trim().toLowerCase())
    setPage(1)
  }

  function clear() {
    setSearch('')
    setPage(1)
    setError('')
  }

  return (
    <div>
      <h1>Users by Interest</h1>

      {/* key: re-mount after Clear so the input empties too */}
      <form action={handleSearch} className="row" key={search}>
        <input name="interest" placeholder="Filter by interest, e.g. chess" defaultValue={search} required />
        <button type="submit">Search</button>
        {search && (
          <button type="button" onClick={clear}>
            Clear
          </button>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      {groups.length === 0 && !error && (
        <p>{search ? `No users interested in "${search}".` : 'No users have added interests yet.'}</p>
      )}

      <ul className="notes">
        {groups.map((group) => (
          <li key={group.interest}>
            <h3>
              {group.interest} <span className="badge">{group.count}</span>
            </h3>
            <p>{group.users.map((u) => u.username).join(', ')}</p>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
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
      )}
    </div>
  )
}

export default Interests
