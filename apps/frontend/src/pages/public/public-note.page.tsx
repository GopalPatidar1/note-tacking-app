import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { usePublicNote } from '@/hooks/sharing/use-public-note'

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = usePublicNote(token!)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-label="Loading note"
        />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Link invalid or expired</p>
          <p className="text-sm text-muted-foreground">
            This shared note link is no longer available.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3">
        <span className="font-semibold">NoteApp</span>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <span
                key={tag.name}
                style={{ backgroundColor: tag.color }}
                className="text-xs px-2 py-0.5 rounded-full text-white"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        <footer className="border-t pt-4 text-xs text-muted-foreground">
          Shared note — view only
        </footer>
      </main>
    </div>
  )
}
