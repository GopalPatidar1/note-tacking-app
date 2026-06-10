import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { NoteCard } from '@/components/notes/note-card'
import { NotesSidebar } from '@/components/notes/notes-sidebar'
import { NotesToolbar } from '@/components/notes/notes-toolbar'
import { NotesPagination } from '@/components/notes/notes-pagination'
import { useNotes } from '@/hooks/notes/use-notes'
import { useTags } from '@/hooks/notes/use-tags'
import { useDeleteNote } from '@/hooks/notes/use-delete-note'
import { DEFAULT_LIMIT, type NoteSortValue } from '@note-app/shared'

export function NotesListPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page  = Number(searchParams.get('page') ?? 1)
  const sort  = (searchParams.get('sort') ?? 'updatedAt_desc') as NoteSortValue
  const tagId = searchParams.get('tagId') ?? undefined

  const { data: notesData, isLoading: notesLoading, isError: notesError } = useNotes({
    page,
    limit: DEFAULT_LIMIT,
    sort,
    tagId,
  })

  const { data: tags = [], isLoading: tagsLoading } = useTags()
  const { mutate: deleteNote } = useDeleteNote()

  function setFilter(key: string, value: string | undefined) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === undefined) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      next.set('page', '1')
      return next
    })
  }

  function handlePageChange(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(p))
      return next
    })
  }

  const sidebar = (
    <NotesSidebar
      tags={tags}
      activeTagId={tagId}
      onSelectTag={(id) => setFilter('tagId', id)}
      isLoading={tagsLoading}
    />
  )

  return (
    <AppLayout sidebar={sidebar}>
      <div className="p-6">
        <div className="mb-6">
          <NotesToolbar
            sort={sort}
            onSortChange={(val) => setFilter('sort', val)}
          />
        </div>

        {notesLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        )}

        {notesError && (
          <div className="py-16 text-center">
            <p className="text-destructive">Failed to load notes.</p>
            <button
              className="mt-2 text-sm text-primary underline"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        )}

        {!notesLoading && !notesError && notesData && (
          <>
            {notesData.items.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                {tagId ? (
                  <p>
                    No notes with this tag.{' '}
                    <button
                      className="text-primary underline"
                      onClick={() => setFilter('tagId', undefined)}
                    >
                      Clear filter
                    </button>
                  </p>
                ) : (
                  <p>You have no notes yet. Create your first one!</p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notesData.items.map((note) => (
                  <NoteCard key={note.id} note={note} onDelete={deleteNote} />
                ))}
              </div>
            )}

            <div className="mt-8">
              <NotesPagination
                page={notesData.page}
                total={notesData.total}
                limit={notesData.limit}
                onPageChange={handlePageChange}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
