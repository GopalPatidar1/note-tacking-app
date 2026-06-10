import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth.store'
import { useLogout } from '@/hooks/auth/use-logout'

interface AppLayoutProps {
  sidebar?: ReactNode
  children: ReactNode
}

export function AppLayout({ sidebar, children }: AppLayoutProps) {
  const user = useAuthStore((s) => s.user)
  const { mutate: logout, isPending } = useLogout()

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">NoteApp</span>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-muted-foreground">{user.name}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            disabled={isPending}
          >
            {isPending ? 'Logging out…' : 'Logout'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <aside className="w-56 shrink-0 overflow-y-auto border-r p-4">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
