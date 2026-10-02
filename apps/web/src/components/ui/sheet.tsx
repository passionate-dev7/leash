import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-xl flex-col bg-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex min-h-12 items-center justify-between border-b border-hairline pl-6 pr-1">
          <h2 className="text-body font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-12 place-items-center hover:bg-surface-1">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex gap-0 border-t border-hairline">{footer}</footer>}
      </aside>
    </div>
  )
}
