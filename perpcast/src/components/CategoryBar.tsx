import { Link, useLocation } from 'react-router-dom'
import { BuildingIcon, CodeIcon, DropIcon, GemIcon, GlobeIcon, RocketIcon, SmileIcon } from './Icons'
import { cx } from '../lib/format'

export interface Category {
  id: string
  label: string
  to: string
  color: string
  icon: (p: { size?: number }) => React.ReactElement
  /** Paths (prefix match) that light this pill up as active. */
  match: (pathname: string, search: string) => boolean
}

export const CATEGORY_LINKS: Category[] = [
  { id: 'memes', label: 'Memes', to: '/memes', color: '#e15ef2', icon: SmileIcon, match: (p) => p.startsWith('/memes') },
  { id: 'stocks', label: 'Stocks', to: '/trade?cat=stocks', color: '#4f8df7', icon: BuildingIcon, match: (p, s) => p.startsWith('/trade') && s.includes('cat=stocks') },
  { id: 'rwa', label: 'RWAs', to: '/trade?cat=rwa', color: '#f0a13a', icon: GemIcon, match: (p, s) => p.startsWith('/trade') && s.includes('cat=rwa') },
  { id: 'hyperliquid', label: 'Hyperliquid', to: '/trade', color: '#3fc6b8', icon: DropIcon, match: (p, s) => p.startsWith('/trade') && !s.includes('cat=stocks') && !s.includes('cat=rwa') },
  { id: 'macro', label: 'Macro', to: '/channel/macro', color: '#7fa11a', icon: GlobeIcon, match: (p) => p === '/channel/macro' },
  { id: 'dev', label: 'Dev', to: '/channel/dev', color: '#9b7dff', icon: CodeIcon, match: (p) => p === '/channel/dev' },
  { id: 'launch', label: 'Launch token', to: '/launch', color: '#ff7a59', icon: RocketIcon, match: (p) => p.startsWith('/launch') },
]

/** Horizontal strip of big obvious category buttons. Lives under the page header on Home / Explore / Channel. */
export function CategoryBar({ className, exclude = [] }: { className?: string; exclude?: string[] }) {
  const { pathname, search } = useLocation()
  return (
    <nav aria-label="Categories" className={cx('flex gap-2 overflow-x-auto no-scrollbar px-4 py-3', className)}>
      {CATEGORY_LINKS.filter((c) => !exclude.includes(c.id)).map((c) => {
        const active = c.match(pathname, search)
        return (
          <Link key={c.id} to={c.to} className="cat-pill" style={{ ['--cat' as string]: c.color }} aria-current={active ? 'page' : undefined}>
            <span className="cat-dot">
              <c.icon size={15} />
            </span>
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}
