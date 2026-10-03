import {seal, unb64} from './crypto.js'
type Result = Awaited<ReturnType<Awaited<ReturnType<typeof seal>>['open']>>
type Session = {endpoint: string; pem: string; session: string; expires: number; token: string}
let current: Session | null = null
let tail: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
export const onLogout = (callback: () => void) => {listeners.add(callback); return () => {listeners.delete(callback)}}
const clear = () => {current = null; listeners.forEach(callback => callback())}

async function rpc(endpoint: string, pem: string, password: string, operation: string, body: unknown, session = '') {
  const envelope = await seal(pem, password, operation, body, session)
  const response = await fetch(endpoint + '/rpc', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(envelope.envelope), credentials:'omit', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(60000)})
  if (!response.ok) {
    if (session && response.status === 400) clear()
    throw new Error(response.status === 400 ? 'Session expired or authentication rejected. Sign in again.' : `Gateway returned ${response.status}. Check the tunnel and gateway.`)
  }
  return envelope.open(await response.json())
}

export async function login(endpoint: string, pem: string, password: string, token: string) {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS tunnel URL')
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Enter only the gateway origin, without /rpc')
  const result = await rpc(url.origin, pem, password, 'login', null)
  if (result.status !== 200 || !result.session || !result.expires) throw new Error('This gateway needs the Comfy session update')
  current = {endpoint:url.origin, pem, session:result.session, expires:result.expires, token}
  return result.expires
}

export function logout() {
  const previous = current
  clear()
  if (previous) void tail.then(()=>rpc(previous.endpoint, previous.pem, '', 'logout', null, previous.session)).catch(()=>{})
}

async function request(body: unknown, signal?: AbortSignal | null): Promise<Result> {
  const session = current
  const work = async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!session || current !== session || Date.now() >= session.expires) {if(current === session) clear(); throw new Error('Sign in again')}
    const result = await rpc(session.endpoint, session.pem, '', 'studio', body, session.session)
    if (signal?.aborted || current !== session) throw new DOMException('Aborted', 'AbortError')
    return result
  }
  const next = tail.then(work, work)
  tail = next.catch(()=>{})
  return next
}

export async function studioResponse(path: string, init: RequestInit = {}, token = '') {
  const method = (init.method || 'GET').toUpperCase()
  if (init.body && typeof init.body !== 'string') throw new Error('Only JSON requests are supported')
  const body = init.body ? JSON.parse(init.body as string) : null
  const credential = token || current?.token || ''
  let offset = 0, total: number | undefined, etag: string | undefined
  const parts: Uint8Array<ArrayBuffer>[] = []
  while (true) {
    const result = await request({path, method, body, token:credential, offset, etag}, init.signal)
    const bytes = result.encoding === 'base64' ? new Uint8Array(unb64(result.body)) : new TextEncoder().encode(result.body)
    if (result.status >= 300) return new Response(bytes, {status:result.status, headers:{'Content-Type':result.contentType || 'text/plain'}})
    if (result.total !== undefined) {
      if (result.total > 256*1024*1024 || result.offset !== offset || (total !== undefined && total !== result.total) || (etag !== undefined && etag !== result.etag)) throw new Error('Media changed during download or exceeded 256 MiB')
      total = result.total; etag = result.etag
    }
    parts.push(bytes)
    if (result.nextOffset == null) return new Response(new Blob(parts, {type:result.contentType || 'application/json'}), {status:result.status})
    if (result.nextOffset !== offset + bytes.length || !bytes.length) throw new Error('Invalid media chunk')
    offset = result.nextOffset
  }
}
