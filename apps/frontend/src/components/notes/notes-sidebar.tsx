import { cn } from '@/lib/utils'
import type { TagDTO } from '@note-app/shared'

interface NotesSidebarProps {
  tags: TagDTO[]
  activeTagId: string | undefined
  onSelectTag: (id: string | undefined) => void
  isLoading?: boolean
}

export function NotesSidebar({ tags, activeTagId, onSelectTag, isLoading }: NotesSidebarProps) {
  return (
    <nav className="space-y-1">
      <button
        className={cn(
          'w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent',
          activeTagId === undefined && 'bg-accent'
        )}
        onClick={() => onSelectTag(undefined)}
      >
        All Notes
      </button>

      {isLoading && (
        <div className="space-y-1 pt-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && tags.length > 0 && (
        <div className="pt-2">
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tags
          </p>
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={cn(
                'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                activeTagId === tag.id && 'bg-accent'
              )}
              onClick={() => onSelectTag(tag.id)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 truncate">{tag.name}</span>
              {tag.noteCount !== undefined && (
                <span className="text-xs text-muted-foreground">{tag.noteCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
