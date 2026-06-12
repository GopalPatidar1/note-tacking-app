import { useState } from 'react'
import { Copy, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateShareLink } from '@/hooks/sharing/use-create-share-link'
import { useRevokeShareLink } from '@/hooks/sharing/use-revoke-share-link'
import type { ShareLinkResponseDTO } from '@note-app/shared'

type ExpiryPreset = 'none' | '1d' | '7d' | '30d'

const EXPIRY_LABELS: Record<ExpiryPreset, string> = {
  none: 'No expiry',
  '1d':  '1 day',
  '7d':  '7 days',
  '30d': '30 days',
}

function toExpiresAt(preset: ExpiryPreset): string | null {
  if (preset === 'none') return null
  const days = preset === '1d' ? 1 : preset === '7d' ? 7 : 30
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function buildShareUrl(token: string): string {
  return `${window.location.origin}/public/${token}`
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry'
  return `Expires ${new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

interface ShareModalProps {
  noteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareModal({ noteId, open, onOpenChange }: ShareModalProps) {
  const [links, setLinks] = useState<ShareLinkResponseDTO[]>([])
  const [preset, setPreset] = useState<ExpiryPreset>('none')

  const createShareLink = useCreateShareLink(noteId)
  const revokeShareLink = useRevokeShareLink()

  async function handleGenerate() {
    try {
      const link = await createShareLink.mutateAsync({ expiresAt: toExpiresAt(preset) })
      setLinks((prev) => [link, ...prev])
    } catch {
      // error state rendered inline via createShareLink.isError
    }
  }

  async function handleRevoke(linkId: string) {
    try {
      await revokeShareLink.mutateAsync(linkId)
      setLinks((prev) => prev.filter((l) => l.id !== linkId))
    } catch {
      toast.error('Failed to revoke link')
    }
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(buildShareUrl(token)).then(
      () => toast.success('Link copied to clipboard'),
      () => toast.error('Failed to copy link'),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Note</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Expiry presets */}
          <fieldset>
            <legend className="text-sm font-medium mb-2">Link expiry</legend>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(EXPIRY_LABELS) as ExpiryPreset[]).map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="expiry"
                    value={p}
                    checked={preset === p}
                    onChange={() => setPreset(p)}
                    className="accent-primary"
                  />
                  {EXPIRY_LABELS[p]}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={createShareLink.isPending}
            className="w-full"
          >
            {createShareLink.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Generating…
              </>
            ) : (
              'Generate Link'
            )}
          </Button>

          {createShareLink.isError && (
            <p className="text-sm text-destructive">
              Failed to generate link. Please try again.
            </p>
          )}

          {/* Active links */}
          {links.length > 0 ? (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Active links — this session
              </p>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {links.map((link) => (
                <div key={link.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <code className="flex-1 min-w-0 break-all text-xs bg-muted px-2 py-1 rounded">
                      {buildShareUrl(link.token)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(link.token)}
                      aria-label="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {link.viewCount} view{link.viewCount !== 1 ? 's' : ''}
                      </span>
                      <span>{formatExpiry(link.expiresAt)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 text-xs"
                      onClick={() => handleRevoke(link.id)}
                      disabled={revokeShareLink.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              No links generated yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
