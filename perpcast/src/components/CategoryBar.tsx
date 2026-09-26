import { Link, useLocation } from 'react-router-dom'
import { BuildingIcon, CodeIcon, DropIcon, GalleryIcon, GemIcon, GlobeIcon, RocketIcon, SmileIcon } from './Icons'
import { cx } from '../lib/format'

export interface Category {
  id: string
  label: string
  to: string
  /** Gradient stops used for the pill's icon tile and active glow. */
  from: string
  toColor: string
  icon: (p: { size?: number }) => React.ReactElement
  /** Paths (prefix match) that light this pill up as active. */
  match: (pathname: string, search: string) => boolean
}

export const CATEGORY_LINKS: Category[] = [
  { id: 'memes', label: 'Memes', to: '/memes', from: '#f97a3a', toColor: '#e2552f', icon: SmileIcon, match: (p) => p.startsWith('/memes') },
  { id: 'stocks', label: 'Stocks', to: '/trade?cat=stocks', from: '#6ea8ff', toColor: '#3b7df0', icon: BuildingIcon, match: (p, s) => p.startsWith('/trade') && s.includes('cat=stocks') },
  { id: 'rwa', label: 'RWAs', to: '/trade?cat=rwa', from: '#ffd23f', toColor: '#f2b500', icon: GemIcon, match: (p, s) => p.startsWith('/trade') && s.includes('cat=rwa') },
  { id: 'nfts', label: 'NFTs', to: '/nfts', from: '#c4b5fd', toColor: '#a78bfa', icon: GalleryIcon, match: (p) => p.startsWith('/nfts') },
  { id: 'hyperliquid', label: 'Hyperliquid', to: '/trade', from: '#7fe0c4', toColor: '#2bbfa0', icon: DropIcon, match: (p, s) => p.startsWith('/trade') && !s.includes('cat=stocks') && !s.includes('cat=rwa') },
  { id: 'macro', label: 'Macro', to: '/channel/macro', from: '#8fe388', toColor: '#4fc16a', icon: GlobeIcon, match: (p) => p === '/channel/macro' },
  { id: 'dev', label: 'Dev', to: '/channel/dev', from: '#a98bff', toColor: '#7c5cf5', icon: CodeIcon, match: (p) => p === '/channel/dev' },
  { id: 'launch', label: 'Launch token', to: '/launch', from: '#ff8ab5', toColor: '#f2578f', icon: RocketIcon, match: (p) => p.startsWith('/launch') },
]

/** Horizontal strip of big obvious category buttons. Lives under the page header on Home / Explore / Channel. */
export function CategoryBar({ className, exclude = [] }: { className?: string; exclude?: string[] }) {
  const { pathname, search } = useLocation()
  return (
    <nav aria-label="Categories" className={cx('flex gap-3 overflow-x-auto no-scrollbar px-4 pt-3 pb-5', className)}>
      {CATEGORY_LINKS.filter((c) => !exclude.includes(c.id)).map((c) => {
        const active = c.match(pathname, search)
        return (
          <Link
            key={c.id}
            to={c.to}
            className="cat-pill"
            style={{ ['--cat' as string]: c.from, ['--cat2' as string]: c.toColor }}
            aria-current={active ? 'page' : undefined}
          >
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
