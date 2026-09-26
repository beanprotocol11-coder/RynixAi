/** Minimal Cloudflare Workers/D1 typings used by the Perpcast Pages Functions (kept local to avoid a runtime-types dependency). */

export interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: { changes?: number; last_row_id?: number }
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}

export interface Env {
  DB?: D1Database
  ASSETS?: { fetch: (req: Request) => Promise<Response> }
  PINATA_JWT?: string
  RESEND_API_KEY?: string
  GOOGLE_CLIENT_ID?: string
  EMAIL_FROM?: string
  IPFS_GATEWAY?: string
}

export interface EventContext<Params extends Record<string, string | string[]> = Record<string, string | string[]>> {
  request: Request
  env: Env
  params: Params
  waitUntil(promise: Promise<unknown>): void
  next(): Promise<Response>
}

export type PagesFunction<Params extends Record<string, string | string[]> = Record<string, string | string[]>> = (ctx: EventContext<Params>) => Response | Promise<Response>
