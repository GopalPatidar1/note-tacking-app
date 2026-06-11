import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  editable?: boolean
}

type ToolbarButtonProps = {
  onClick: () => void
  active: boolean
  label: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, label, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn('h-8 w-8 p-0', active && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  )
}

export function TipTapEditor({ content, onChange, editable = true }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    onUpdate({ editor: e }) {
      onChange(e.getHTML())
    },
  })

  if (!editor) return null

  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1 bg-muted/40">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            label="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            label="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            label="Strikethrough"
          >
            <s>S</s>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            label="Inline code"
          >
            <span className="font-mono text-xs">{`<>`}</span>
          </ToolbarButton>

          <div className="w-px h-5 bg-border mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            label="Heading 1"
          >
            <span className="text-xs font-bold">H1</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            label="Heading 2"
          >
            <span className="text-xs font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            label="Heading 3"
          >
            <span className="text-xs font-bold">H3</span>
          </ToolbarButton>

          <div className="w-px h-5 bg-border mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            label="Bullet list"
          >
            <span className="text-xs">•≡</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            label="Ordered list"
          >
            <span className="text-xs">1≡</span>
          </ToolbarButton>
        </div>
      )}

      <EditorContent
        editor={editor}
        className={cn(
          'min-h-[400px] px-4 py-3 prose prose-sm max-w-none focus-within:outline-none',
          '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px]'
        )}
      />
    </div>
  )
}
