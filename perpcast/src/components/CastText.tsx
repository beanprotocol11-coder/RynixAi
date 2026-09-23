import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CHANNELS } from '../lib/farcaster'

const TOKEN_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[a-z0-9][a-z0-9\-_.]*[a-z0-9])|(\$[A-Za-z]{2,10}\b)|(\/[a-z0-9\-]{2,32}\b)/gi

export function CastText({ text, className, clamp }: { text: string; className?: string; clamp?: boolean }) {
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(TOKEN_RE.source, 'gi')
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>)
    const [tok] = m
    if (m[1]) {
      let label = tok.replace(/^https?:\/\//, '').replace(/^www\./, '')
      if (label.length > 42) label = label.slice(0, 40) + '…'
      parts.push(
        <a key={k++} href={tok} target="_blank" rel="noreferrer noopener" className="text-info hover:underline break-all" onClick={(e) => e.stopPropagation()}>
          {label}
        </a>,
      )
    } else if (m[2]) {
      parts.push(
        <Link key={k++} to={`/u/${tok.slice(1)}`} className="text-accent font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {tok}
        </Link>,
      )
    } else if (m[3]) {
      parts.push(
        <Link key={k++} to={`/trade/${tok.slice(1).toUpperCase()}`} className="text-accent font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
          {tok}
        </Link>,
      )
    } else if (m[4]) {
      const id = tok.slice(1).toLowerCase()
      const prevChar = m.index > 0 ? text[m.index - 1] : ' '
      const known = CHANNELS.some((c) => c.id === id)
      if (known && /\s|^/.test(prevChar) && (m.index === 0 || /\s/.test(prevChar))) {
        parts.push(
          <Link key={k++} to={`/channel/${id}`} className="text-accent font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {tok}
          </Link>,
        )
      } else parts.push(<Fragment key={k++}>{tok}</Fragment>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(<Fragment key={k++}>{text.slice(last)}</Fragment>)
  return <div className={['whitespace-pre-wrap break-words text-[15px] leading-[1.45]', clamp ? 'line-clamp-6' : '', className ?? ''].join(' ')}>{parts}</div>
}
