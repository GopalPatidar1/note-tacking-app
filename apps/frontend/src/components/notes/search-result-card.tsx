import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import type { SearchResultDTO } from '@note-app/shared'

interface SearchResultCardProps {
  result: SearchResultDTO
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate()

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  }).format(new Date(result.updatedAt))

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/notes/${result.id}`)}
    >
      <CardContent className="p-4">
        <h3 className="truncate font-semibold">{result.title}</h3>
        {/* ts_headline produces only <b> tags on the user's own content — safe to render */}
        <p
          className="mt-1 line-clamp-3 text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
          dangerouslySetInnerHTML={{ __html: result.headline }}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {result.tags.map((tag) => (
              <span
                key={tag.name}
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
