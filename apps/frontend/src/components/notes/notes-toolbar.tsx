import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { NOTE_SORT_VALUES, type NoteSortValue } from '@note-app/shared'

const SORT_LABELS: Record<NoteSortValue, string> = {
  updatedAt_desc: 'Last updated',
  updatedAt_asc:  'Oldest update',
  createdAt_desc: 'Newest first',
  createdAt_asc:  'Oldest first',
  title_asc:      'Title A–Z',
  title_desc:     'Title Z–A',
}

interface NotesToolbarProps {
  sort: NoteSortValue
  onSortChange: (value: NoteSortValue) => void
}

export function NotesToolbar({ sort, onSortChange }: NotesToolbarProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between gap-4">
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as NoteSortValue)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {NOTE_SORT_VALUES.map((val) => (
          <option key={val} value={val}>
            {SORT_LABELS[val]}
          </option>
        ))}
      </select>

      <Button onClick={() => navigate('/notes/new')}>+ New Note</Button>
    </div>
  )
}
