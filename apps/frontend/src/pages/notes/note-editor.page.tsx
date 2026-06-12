import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, AlertCircle, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TipTapEditor } from '@/components/notes/tiptap-editor'
import { TagSelector } from '@/components/notes/tag-selector'
import { ShareModal } from '@/components/sharing/share-modal'
import { useNote } from '@/hooks/notes/use-note'
import { useCreateNote } from '@/hooks/notes/use-create-note'
import { useUpdateNote } from '@/hooks/notes/use-update-note'
import { useTags } from '@/hooks/notes/use-tags'

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 1500
const SAVED_DISPLAY_MS  = 3000

export function NoteEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate  = useNavigate()
  const isEditMode = !!id

  const { data: note, isLoading: noteLoading } = useNote(id)
  const { data: allTags = [] } = useTags()

  const createNote = useCreateNote()
  const updateNote = useUpdateNote(id ?? '')

  const [title,     setTitle]     = useState('')
  const [content,   setContent]   = useState('')
  const [tagIds,    setTagIds]     = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [initialised, setInitialised] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const autosaveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedDisplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef       = useRef(false)

  useEffect(() => {
    if (note && !initialised) {
      setTitle(note.title)
      setContent(note.content)
      setTagIds(note.tags.map((t) => t.id))
      setInitialised(true)
    }
  }, [note, initialised])

  useEffect(() => {
    if (!isEditMode || !initialised) return

    setSaveStatus('unsaved')

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)

    autosaveTimer.current = setTimeout(() => {
      if (isSavingRef.current) return
      isSavingRef.current = true
      setSaveStatus('saving')
      updateNote.mutate(
        { title, content, tagIds },
        {
          onSuccess: () => {
            isSavingRef.current = false
            setSaveStatus('saved')
            if (savedDisplayTimer.current) clearTimeout(savedDisplayTimer.current)
            savedDisplayTimer.current = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_MS)
          },
          onError: () => {
            isSavingRef.current = false
            setSaveStatus('error')
            toast.error('Failed to save note')
          },
        }
      )
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tagIds])

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      if (savedDisplayTimer.current) clearTimeout(savedDisplayTimer.current)
    }
  }, [])

  function handleCreate() {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    createNote.mutate(
      { title, content, tagIds },
      {
        onSuccess: (newNote) => {
          navigate(`/notes/${newNote.id}`, { replace: true })
        },
      }
    )
  }

  function handleRetry() {
    if (isSavingRef.current) return
    isSavingRef.current = true
    setSaveStatus('saving')
    updateNote.mutate(
      { title, content, tagIds },
      {
        onSuccess: () => {
          isSavingRef.current = false
          setSaveStatus('saved')
          if (savedDisplayTimer.current) clearTimeout(savedDisplayTimer.current)
          savedDisplayTimer.current = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_MS)
        },
        onError: () => {
          isSavingRef.current = false
          setSaveStatus('error')
          toast.error('Failed to save note')
        },
      }
    )
  }

  if (isEditMode && noteLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading note" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/notes')}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Notes
        </Button>

        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <SaveIndicator status={saveStatus} onRetry={handleRetry} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="gap-1"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
              <ShareModal noteId={id!} open={shareOpen} onOpenChange={setShareOpen} />
            </>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={createNote.isPending || !title.trim()}
              size="sm"
            >
              {createNote.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating…</>
              ) : (
                'Create Note'
              )}
            </Button>
          )}
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        className="text-2xl font-semibold h-auto py-2 border-none shadow-none focus-visible:ring-0 px-0 placeholder:text-muted-foreground/50"
        aria-label="Note title"
      />

      {allTags.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</span>
          <TagSelector
            tags={allTags}
            selectedTagIds={tagIds}
            onChange={setTagIds}
          />
        </div>
      )}

      {(!isEditMode || initialised) && (
        <TipTapEditor
          content={content}
          onChange={setContent}
        />
      )}
    </div>
  )
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'idle') return null

  if (status === 'unsaved') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-600">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Unsaved changes
      </span>
    )
  }

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    )
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-600">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-3.5 w-3.5" />
      Save failed —{' '}
      <button
        type="button"
        onClick={onRetry}
        className="underline hover:no-underline focus:outline-none"
      >
        retry?
      </button>
    </span>
  )
}
