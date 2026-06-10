import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { stripHtml } from '@/lib/utils'
import type { NoteDTO } from '@note-app/shared'

interface NoteCardProps {
  note: NoteDTO
  onDelete: (id: string) => void
}

export function NoteCard({ note, onDelete }: NoteCardProps) {
  const navigate = useNavigate()
  const rawPreview = stripHtml(note.content)
  const preview = rawPreview.length > 120 ? rawPreview.slice(0, 120) + '…' : rawPreview

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(note.updatedAt))

  return (
    <Card
      className="group relative cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/notes/${note.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 truncate font-semibold">{note.title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(note.id)
            }}
            aria-label="Delete note"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {preview && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formattedDate}</span>
        </div>
      </CardContent>
    </Card>
  )
}
