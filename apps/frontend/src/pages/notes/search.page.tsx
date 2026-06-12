import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Input } from '@/components/ui/input'
import { NotesPagination } from '@/components/notes/notes-pagination'
import { SearchResultCard } from '@/components/notes/search-result-card'
import { useSearch } from '@/hooks/notes/use-search'
import { DEFAULT_LIMIT } from '@note-app/shared'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q    = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const [inputValue, setInputValue] = useState(q)

  // Keep input in sync when URL changes externally (back/forward navigation)
  useEffect(() => {
    setInputValue(q)
  }, [q])

  // Debounce: commit inputValue to URL 400ms after typing stops.
  // Guard: if input already matches URL, skip — avoids spurious timer on initial render.
  useEffect(() => {
    if (inputValue === q) return
    if (inputValue.length < 2) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('q')
          next.delete('page')
          return next
        },
        { replace: true },
      )
      return
    }
    const id = setTimeout(() => {
      setSearchParams({ q: inputValue, page: '1' }, { replace: true })
    }, 400)
    return () => clearTimeout(id)
  }, [inputValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError } = useSearch({ q, page, limit: DEFAULT_LIMIT })

  function handlePageChange(p: number) {
    // No replace — intentional history entry so user can go back between result pages
    setSearchParams({ q, page: String(p) })
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* Search input */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search notes…"
            className="pl-10"
            autoFocus
          />
        </div>

        {/* Idle — query too short */}
        {q.length < 2 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        )}

        {/* Loading */}
        {isLoading && q.length >= 2 && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="py-16 text-center text-destructive">
            Search failed. Please try again.
          </p>
        )}

        {/* Results */}
        {!isLoading && !isError && data && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {data.total} result{data.total !== 1 ? 's' : ''} for &ldquo;{data.query}&rdquo;
            </p>

            {data.items.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">
                No notes found for &ldquo;{data.query}&rdquo;.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {data.items.map((result) => (
                    <SearchResultCard key={result.id} result={result} />
                  ))}
                </div>
                {data.total > data.limit && (
                  <div className="mt-8">
                    <NotesPagination
                      page={data.page}
                      total={data.total}
                      limit={data.limit}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
