import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useNoteVersions } from '@/hooks/versions/use-note-versions'
import { useNoteVersion } from '@/hooks/versions/use-note-version'
import { useRestoreVersion } from '@/hooks/versions/use-restore-version'
import type { NoteVersionDTO } from '@note-app/shared'

interface VersionHistorySheetProps {
  noteId:       string
  open:         boolean
  onOpenChange: (open: boolean) => void
}

function formatVersionDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

export function VersionHistorySheet({ noteId, open, onOpenChange }: VersionHistorySheetProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen]             = useState(false)
  const [page, setPage]                           = useState(1)
  const [accumulated, setAccumulated]             = useState<NoteVersionDTO[]>([])

  const { data: versionsPage, isLoading: listLoading } = useNoteVersions(noteId, page)
  const { data: versionData,  isLoading: previewLoading } = useNoteVersion(noteId, selectedVersionId)
  const restoreVersion = useRestoreVersion(noteId)

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null)
      setConfirmOpen(false)
      setPage(1)
      setAccumulated([])
    }
  }, [open])

  // Accumulate pages as they load
  useEffect(() => {
    if (!versionsPage) return
    setAccumulated((prev) => {
      const existingIds = new Set(prev.map((v) => v.id))
      const fresh = versionsPage.items.filter((v) => !existingIds.has(v.id))
      return [...prev, ...fresh]
    })
  }, [versionsPage])

  // Auto-select first version when list first loads
  useEffect(() => {
    if (accumulated.length > 0 && selectedVersionId === null) {
      setSelectedVersionId(accumulated[0].id)
    }
  }, [accumulated, selectedVersionId])

  const isLatest = selectedVersionId === accumulated[0]?.id
  const hasMore  = versionsPage ? versionsPage.total > accumulated.length : false

  const selectedVersion = accumulated.find((v) => v.id === selectedVersionId) ?? null

  function handleRestore() {
    if (!selectedVersionId || !selectedVersion) return
    restoreVersion.mutate(selectedVersionId, {
      onSuccess: () => {
        toast.success(`Note restored to version ${selectedVersion.versionNumber}`)
        onOpenChange(false)
      },
      onError: () => {
        toast.error('Failed to restore version')
      },
    })
    setConfirmOpen(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[700px] sm:max-w-[700px] flex flex-col p-0"
        >
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <SheetTitle>Version History</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: version list */}
            <div className="w-52 shrink-0 border-r flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {listLoading && accumulated.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading versions" />
                  </div>
                ) : accumulated.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-4">No versions found.</p>
                ) : (
                  accumulated.map((v, idx) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVersionId(v.id)}
                      className={`w-full text-left px-3 py-3 border-b text-sm transition-colors hover:bg-accent/50 focus:outline-none focus:bg-accent/50 ${
                        selectedVersionId === v.id ? 'bg-accent' : ''
                      }`}
                      aria-selected={selectedVersionId === v.id}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>v{v.versionNumber}</span>
                        {idx === 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {formatVersionDate(v.createdAt)}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {hasMore && (
                <div className="shrink-0 p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={listLoading}
                  >
                    {listLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Load more'}
                  </Button>
                </div>
              )}
            </div>

            {/* Right: preview */}
            <div className="flex-1 overflow-y-auto flex flex-col p-4">
              {!selectedVersionId ? (
                <p className="text-sm text-muted-foreground">Select a version to preview.</p>
              ) : previewLoading ? (
                <div className="space-y-3">
                  <div className="h-6 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                </div>
              ) : versionData ? (
                <>
                  <h2 className="text-lg font-semibold mb-3">{versionData.title}</h2>
                  <div
                    className="prose prose-sm max-w-none flex-1"
                    dangerouslySetInnerHTML={{ __html: versionData.content }}
                  />
                  <div className="shrink-0 pt-4 mt-4 border-t flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLatest || restoreVersion.isPending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      {restoreVersion.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Restoring…</>
                      ) : isLatest ? (
                        'Current version'
                      ) : (
                        `Restore version ${versionData.versionNumber}`
                      )}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore to version {selectedVersion?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current note content with the version from{' '}
              {selectedVersion ? formatVersionDate(selectedVersion.createdAt) : ''}.
              Your current content will be saved as a new version first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
