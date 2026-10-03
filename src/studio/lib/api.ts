import {studioResponse} from '../../transport'
export type Job = { id: string; operation: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; created_at: string; started_at: string | null; finished_at: string | null; returncode: number | null; has_errors: boolean }
export type Operation = { operation: string; options: string[] }
export type Output = { path: string; size: number; modified_at?: number }
export type OutputPage = { entries: Output[]; next_offset: number | null; has_more: boolean }
export type LogEntry = { sequence: number; timestamp: string; message: string }
export type LogBatch = { status: Job['status']; entries: LogEntry[]; next_after: number; oldest_available: number | null }

export class GeneratorAPI {
  constructor(readonly token: string, readonly remote: boolean) {}
  path(path: string) { return `/api${this.remote ? '/remote' : ''}${path}` }
  async response(path: string, init: RequestInit = {}, local = false) {
    const target = `${!local && this.remote ? '/remote' : ''}${path}`
    const response = await studioResponse(target, init, this.token)
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body) } catch { /* response was not JSON */ }
      throw new Error(message)
    }
    return response
  }
  async json<T>(path: string, init?: RequestInit): Promise<T> { return (await this.response(path, init)).json() }
  async download(path: string, filename: string, local = false) {
    const blob = await (await this.response(path, {}, local)).blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async stream(jobId: string, after: number, signal: AbortSignal, onLog: (entry: LogEntry) => void, onDone: (job: Job) => void) {
    // Encrypted request/response polling replaces plaintext SSE transport.
    let cursor = after
    while (!signal.aborted) {
      const batch = await this.json<LogBatch>(`/jobs/${jobId}/logs?after=${cursor}&limit=500`, {signal})
      for (const entry of batch.entries) {onLog(entry); cursor = Math.max(cursor, entry.sequence)}
      if (!['queued', 'running'].includes(batch.status) && !batch.entries.length) {
        onDone(await this.json<Job>(`/jobs/${jobId}`, {signal})); return
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }
}

export const outputPath = (path: string) => `/outputs/${path.split('/').map(encodeURIComponent).join('/')}`
