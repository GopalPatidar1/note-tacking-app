import { cn } from '@/lib/utils'
import type { TagDTO } from '@note-app/shared'

interface TagSelectorProps {
  tags: TagDTO[]
  selectedTagIds: string[]
  onChange: (ids: string[]) => void
}

export function TagSelector({ tags, selectedTagIds, onChange }: TagSelectorProps) {
  if (tags.length === 0) return null

  function toggle(id: string) {
    if (selectedTagIds.includes(id)) {
      onChange(selectedTagIds.filter((t) => t !== id))
    } else {
      onChange([...selectedTagIds, id])
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
      {tags.map((tag) => {
        const selected = selectedTagIds.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            aria-pressed={selected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all',
              'border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'text-white border-transparent'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
            style={
              selected
                ? { backgroundColor: tag.color, borderColor: tag.color }
                : { borderColor: tag.color, color: tag.color }
            }
          >
            {selected && <span aria-hidden>●</span>}
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
