import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, Box, Check, ChevronRight, CircleStop, Cloud, FolderOpen, Image, Layers3, Loader2, Play, Plus, Radio, RefreshCw, Settings2, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneratorAPI, outputPath } from '@/lib/api'
import { OutputThumbnail } from '@/components/OutputThumbnail'
import type { Job, Operation, Output, OutputPage, LogBatch, LogEntry } from '@/lib/api'

const names: Record<string, string> = { image: 'Image generation', environment: 'Environment images', video_tasks: 'Video from tasks', video_folder: 'Video from folder', upscale: 'Video upscale' }
const defaultOperations: Operation[] = [
  { operation: 'image', options: [] }, { operation: 'environment', options: [] },
  { operation: 'video_tasks', options: ['tasks_file'] },
  { operation: 'video_folder', options: ['source_folder', 'resize'] },
  { operation: 'upscale', options: ['source_folder', 'model_name', 'resize'] },
]
const optionLabels: Record<string, string> = { tasks_file: 'Tasks file', source_folder: 'Source folder', model_name: 'Upscale model', resize: 'Preprocessing' }
const optionHelp: Record<string, string> = {
  tasks_file: 'Optional path to a video tasks file. Leave empty to use VIDEO_TASKS_FILE.',
  source_folder: 'Optional input folder. Video uses VIDEO_SOURCE_DIR; upscale uses UPSCALE_SOURCE_DIR.',
  model_name: 'Optional ComfyUI upscale model name. Leave empty to use DEFAULT_UPSCALE_MODEL.',
  resize: 'Optional preprocessing override. Defaults to ENABLE_PREPROCESSING.',
}
const active = (job: Job) => ['running', 'queued'].includes(job.status)
const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
const bytes = (size: number) => size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function App() {
  const [page, setPage] = useState('jobs'), [remote, setRemote] = useState(false)
  const [token, setToken] = useState(''), [draftToken, setDraftToken] = useState('')
  const api = useMemo(() => new GeneratorAPI(token, remote), [token, remote])
  const [connected, setConnected] = useState(false), [operations, setOperations] = useState<Operation[]>(defaultOperations)
  const [jobs, setJobs] = useState<Job[]>([]), [selected, setSelected] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Output[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [outputOffset, setOutputOffset] = useState<number | null>(null)
  const [outputsLoading, setOutputsLoading] = useState(false)
  const outputOffsetRef = useRef<number | null>(null)
  const outputRequestRef = useRef(0)
  const [newJob, setNewJob] = useState(false), [operation, setOperation] = useState('image')
  const [fields, setFields] = useState<Record<string, string>>({}), [filter, setFilter] = useState('all'), [search, setSearch] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([]), [logMode, setLogMode] = useState('live'), [logError, setLogError] = useState('')
  const [preview, setPreview] = useState<{ output: Output; url: string } | null>(null), [follow, setFollow] = useState(true)
  const consoleRef = useRef<HTMLPreElement>(null), generation = useRef(0), requestBusy = useRef(false)
  const followRef = useRef(true)
  const changeFollow = useCallback((enabled: boolean) => {
    followRef.current = enabled
    setFollow(enabled)
    if (enabled && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [])
  const selectedJob = jobs.find(job => job.id === selected)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await Promise.all([api.json('/health', { signal }), api.json<Operation[]>('/operations', { signal }), api.json<Job[]>('/jobs', { signal })])
    if (signal?.aborted) return
    setConnected(true); setOperations(result[1]); setJobs(result[2]); setConnectionError('')
    setSelected(id => id && result[2].some(job => job.id === id) ? id : result[2][0]?.id ?? null)
  }, [api])
  useEffect(() => {
    const controller = new AbortController(); generation.current++
    setConnected(false); setJobs([]); setSelected(null); setOutputs([]); setOperations(defaultOperations)
    let pending = false
    const update = async () => {
      if (pending) return
      pending = true
      try { await refresh(controller.signal) } catch (error) { if (!controller.signal.aborted) { setConnected(false); setConnectionError(message(error)) } } finally { pending = false }
    }
    void update(); const timer = setInterval(update, 4000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [refresh])
  const loadOutputs = useCallback(async (signal?: AbortSignal, append = false, refresh = false) => {
    const offset = append ? outputOffsetRef.current : 0
    if (offset === null) return
    const current = generation.current
    const requestId = ++outputRequestRef.current
    setOutputsLoading(true)
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: '10', search, refresh: String(refresh) })
      const result = await api.json<OutputPage>(`/outputs?${params}`, { signal })
      if (signal?.aborted || current !== generation.current || requestId !== outputRequestRef.current) return
      setOutputs(previous => append ? [...previous, ...result.entries.filter(entry => !previous.some(item => item.path === entry.path))] : result.entries)
      outputOffsetRef.current = result.next_offset
      setOutputOffset(result.next_offset)
    } finally { if (!signal?.aborted && current === generation.current && requestId === outputRequestRef.current) setOutputsLoading(false) }
  }, [api, search])
  useEffect(() => {
    if (page !== 'outputs') return
    const controller = new AbortController()
    setOutputs([]); setOutputOffset(null); outputOffsetRef.current = null
    const timer = setTimeout(() => { void loadOutputs(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)) }) }, 250)
    return () => { controller.abort(); clearTimeout(timer); outputRequestRef.current++; setOutputsLoading(false) }
  }, [page, loadOutputs])
  useEffect(() => {
    const controller = new AbortController(); setLogs([]); setLogError('')
    if (!selected) return () => controller.abort()
    let cursor = 0
    const append = (entry: LogEntry) => {
      if (controller.signal.aborted || entry.sequence <= cursor) return
      cursor = entry.sequence; setLogs(previous => [...previous, entry].slice(-3000))
    }
    const poll = async () => {
      while (!controller.signal.aborted) {
        const batch = await api.json<LogBatch>(`/jobs/${selected}/logs?after=${cursor}&limit=500`, { signal: controller.signal })
        if (batch.oldest_available && cursor && batch.oldest_available > cursor + 1) setLogError('Earlier log chunks have expired on the server.')
        batch.entries.forEach(append)
        if (!['queued', 'running'].includes(batch.status) && !batch.entries.length) break
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    const run = logMode === 'live' ? api.stream(selected, 0, controller.signal, append, job => { if (!controller.signal.aborted) setJobs(previous => previous.map(item => item.id === job.id ? job : item)) }) : poll()
    void run.catch(error => { if (!controller.signal.aborted) setLogError(`${message(error)}. Switch to polling or reselect this job.`) })
    return () => controller.abort()
  }, [api, selected, logMode])
  useEffect(() => {
    const console = consoleRef.current
    if (followRef.current && console) console.scrollTop = console.scrollHeight
  }, [logs, follow, page])
  useEffect(() => {
    const console = consoleRef.current
    if (!console) return
    const onScroll = () => changeFollow(console.scrollHeight - console.scrollTop - console.clientHeight <= 8)
    // Pause immediately, before the next streamed chunk can move the scrollbar.
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) changeFollow(false) }
    console.addEventListener('scroll', onScroll, { passive: true })
    console.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      console.removeEventListener('scroll', onScroll)
      console.removeEventListener('wheel', onWheel)
    }
  }, [selectedJob?.id, page, changeFollow])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  useEffect(() => { setPreview(null) }, [api])
  async function perform(action: () => Promise<void>) {
    if (requestBusy.current) return
    requestBusy.current = true; setBusy(true); setError('')
    try { await action() } catch (error) { setError(message(error)) } finally { requestBusy.current = false; setBusy(false) }
  }
  async function submit() {
    const options: Record<string, string | boolean> = {}
    operations.find(item => item.operation === operation)?.options.forEach(key => { if (fields[key]?.trim()) options[key] = key === 'resize' ? fields[key] === 'true' : fields[key].trim() })
    const job = await api.json<Job>('/jobs', { method: 'POST', body: JSON.stringify({ operation, options }) })
    setJobs(previous => [job, ...previous]); setSelected(job.id); setNewJob(false); setPage('jobs')
  }
  async function showPreview(output: Output) {
    const current = generation.current; const blob = await (await api.response(outputPath(output.path))).blob()
    if (current === generation.current) setPreview({ output, url: URL.createObjectURL(blob) })
  }
  const visibleJobs = jobs.filter(job => (filter === 'all' || job.status === filter) && `${job.id} ${names[job.operation] ?? job.operation}`.toLowerCase().includes(search.toLowerCase()))
  const visibleOutputs = outputs.filter(output => output.path.toLowerCase().includes(search.toLowerCase()))
  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('jobs') }}><span className="brand-symbol"><Layers3 size={23}/></span><span>comfy<span className="brand-light"> / studio</span></span></a><div className="workspace-label">GENERATOR WORKSPACE</div><nav aria-label="Main navigation">{[{ id: 'jobs', label: 'Generation', icon: Activity }, { id: 'outputs', label: 'Output library', icon: FolderOpen }, { id: 'colab', label: 'Colab runtime', icon: Cloud }, { id: 'connection', label: 'Connection', icon: Settings2 }].map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'selected' : ''}`} onClick={() => { setPage(item.id); setSearch('') }}><item.icon size={18}/>{item.label}{page === item.id && <ChevronRight size={15} className="ml-auto"/>}</button>)}</nav><div className="sidebar-note"><Box size={20}/><strong>Your workflows. One workspace.</strong><p>Run locally or send your next batch to a Colab GPU.</p></div><div className="sidebar-footer"><span className={`status-dot ${connected ? 'online' : ''}`}/><span>{connected ? 'API connected' : 'API disconnected'}<small>{remote ? 'Colab via local relay' : 'Local machine'}</small></span></div></aside>
    <div className="main-shell"><header className="topbar"><span className="breadcrumb">Workspace <ChevronRight size={13}/><strong>{page === 'jobs' ? 'Generation' : page === 'outputs' ? 'Output library' : page === 'colab' ? 'Colab runtime' : 'Connection'}</strong></span><div className="topbar-actions"><Select value={remote ? 'remote' : 'local'} onValueChange={value => { setRemote(value === 'remote'); setSearch('') }} disabled={busy}><SelectTrigger className="target-select" aria-label="Execution target"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="local">Local machine</SelectItem><SelectItem value="remote">Colab GPU</SelectItem></SelectContent></Select><span className="avatar">CG</span></div></header><main>
      {(error || connectionError) && <div role="alert" className="error-banner"><span>{error || connectionError}</span><Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={() => { setError(''); setConnectionError('') }}><X size={16}/></Button></div>}
      <div className="page-heading"><div><div className="eyebrow">{remote ? 'CLOUD EXECUTION' : 'LOCAL EXECUTION'}</div><h1>{page === 'jobs' ? 'Generation studio' : page === 'outputs' ? 'Output library' : page === 'colab' ? 'Your Colab runtime' : 'Connect your workspace'}</h1><p>{page === 'jobs' ? 'Start a workflow. Follow every step. Keep creating.' : page === 'outputs' ? 'Browse and download media produced by your workflows.' : page === 'colab' ? 'Bring your Drive models and GPU into the same workflow.' : 'Choose where your jobs run and authenticate with your API.'}</p></div>{page === 'jobs' && <Button className="primary-action" disabled={busy} onClick={() => { setFields({}); setNewJob(true) }}><Plus size={17}/> New generation</Button>}{page === 'outputs' && <Button variant="outline" disabled={busy || outputsLoading} onClick={() => void perform(() => loadOutputs(undefined, false, true))}><RefreshCw size={16}/> Refresh library</Button>}</div>
      {page === 'jobs' && <><div className="stats-grid">{[{ label: 'Total generations', value: jobs.length, icon: Layers3, text: 'Jobs retained by the API' }, { label: 'In progress', value: jobs.filter(active).length, icon: Radio, text: remote ? 'Running on Colab' : 'Running on your machine' }, { label: 'Completed', value: jobs.filter(job => job.status === 'completed').length, icon: Check, text: 'Finished generation jobs' }, { label: 'Needs attention', value: jobs.filter(job => job.status === 'failed').length, icon: CircleStop, text: 'Check the logs for details' }].map(stat => <Card key={stat.label} className="stat-card"><CardContent><div><span>{stat.label}</span><stat.icon size={17}/></div><strong>{stat.value.toString().padStart(2, '0')}</strong><small>{stat.text}</small></CardContent></Card>)}</div><div className="section-heading"><div><h2>Recent generations <Badge variant="secondary">{jobs.length}</Badge></h2><p>Your generation history for this runtime.</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform(() => refresh())}><RefreshCw size={15}/> Refresh</Button></div><div className="job-layout"><section className="job-list-panel"><div className="list-toolbar"><Input aria-label="Search generations" placeholder="Search generations…" value={search} onChange={event => setSearch(event.target.value)}/><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter job status" className="filter-select"><SelectValue/></SelectTrigger><SelectContent>{['all', 'running', 'queued', 'completed', 'failed', 'cancelled'].map(value => <SelectItem key={value} value={value}>{value === 'all' ? 'All statuses' : value}</SelectItem>)}</SelectContent></Select></div><div className="job-list">{!visibleJobs.length ? <div className="empty-state"><Layers3 size={32}/><h3>{jobs.length ? 'No matching generations' : 'Ready for your first generation'}</h3><p>{jobs.length ? 'Try another search or status.' : 'Connect the API and start a workflow to see it here.'}</p></div> : visibleJobs.map(job => <button className={`job-row ${selected === job.id ? 'chosen' : ''}`} key={job.id} onClick={() => setSelected(job.id)}><span className={`job-icon ${job.operation.includes('video') ? 'violet' : ''}`}>{job.operation.includes('video') ? <Play size={18}/> : <Image size={18}/>}</span><span className="job-info"><strong>{names[job.operation] ?? job.operation}</strong><small>{job.id.slice(0, 8)} · {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><Badge className={`job-status ${job.status}`} variant="outline">{active(job) && <Loader2 size={11} className="animate-spin"/>}{job.status}</Badge></button>)}</div></section><section className="detail-panel">{selectedJob ? <><div className="detail-heading"><div><span className="eyebrow">GENERATION DETAILS</span><h3>{names[selectedJob.operation] ?? selectedJob.operation}</h3></div><Badge className={`job-status ${selectedJob.status}`} variant="outline">{selectedJob.status}</Badge></div><dl className="detail-grid"><div><dt>Job ID</dt><dd title={selectedJob.id}>{selectedJob.id.slice(0, 12)}</dd></div><div><dt>Target</dt><dd>{remote ? 'Colab GPU' : 'Local machine'}</dd></div><div><dt>Started</dt><dd>{date(selectedJob.started_at)}</dd></div><div><dt>Finished</dt><dd>{date(selectedJob.finished_at)}</dd></div><div><dt>Exit code</dt><dd>{selectedJob.returncode ?? '—'}</dd></div><div><dt>Error detected</dt><dd>{selectedJob.has_errors ? 'Yes' : 'No'}</dd></div></dl><div className="detail-actions"><Button variant="outline" size="sm" disabled={!active(selectedJob) || busy} onClick={() => void perform(async () => { const job = await api.json<Job>(`/jobs/${selectedJob.id}/cancel`, { method: 'POST' }); setJobs(previous => previous.map(item => item.id === job.id ? job : item)) })}><CircleStop size={14}/> Cancel job</Button><Button variant="ghost" size="sm" onClick={() => setPage('outputs')}>View outputs <ArrowUpRight size={14}/></Button></div>{active(selectedJob) && <p className="cancel-note">Submitted ComfyUI work may continue after worker cancellation.</p>}<div className="console-heading"><span><Terminal size={15}/> Execution log</span><div><Button size="sm" variant="ghost" onClick={() => changeFollow(!follow)} aria-pressed={follow}>{follow ? 'Following' : 'Follow'}</Button><Select value={logMode} onValueChange={setLogMode}><SelectTrigger className="log-select" aria-label="Log update mode"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="live">Encrypted polling</SelectItem><SelectItem value="poll">Polling</SelectItem></SelectContent></Select></div></div>{logError && <div className="log-warning" role="alert">{logError}</div>}<pre ref={consoleRef} className="console" aria-label="Generation console">{logs.length ? logs.map(entry => <span key={entry.sequence}>{entry.message.replace(/\r/g, '\n')}</span>) : <span className="console-empty">Waiting for output…</span>}</pre><div className="console-footer"><span className={`status-dot ${active(selectedJob) ? 'online' : ''}`}/>{active(selectedJob) ? 'Receiving generator output' : 'Execution ended'}<span className="ml-auto">{logs.length} chunks</span></div></> : <div className="empty-state detail-empty"><Terminal size={32}/><h3>A closer look at every run</h3><p>Select a generation to view its status and execution log.</p></div>}</section></div></>}
      {page === 'outputs' && <><div className="library-toolbar"><Input aria-label="Search outputs" placeholder="Search files…" value={search} onChange={event => setSearch(event.target.value)}/><span>{visibleOutputs.length} files · Newest first</span></div><div className="output-grid">{visibleOutputs.map(output => <Card key={output.path} className="output-card"><CardContent><OutputThumbnail api={api} output={output} onOpen={() => void perform(() => showPreview(output))}/><strong title={output.path}>{output.path}</strong><div><small>{bytes(output.size)}</small><Button size="icon" variant="ghost" aria-label={`Download ${output.path}`} disabled={busy} onClick={() => void perform(() => api.download(outputPath(output.path), output.path.split('/').pop()!))}><ArrowDownToLine size={16}/></Button></div></CardContent></Card>)}</div>{outputOffset !== null && <div className="load-more-row"><Button variant="outline" disabled={busy || outputsLoading} onClick={() => void perform(() => loadOutputs(undefined, true))}>{outputsLoading ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Load 10 more</Button></div>}{outputsLoading && !outputs.length && <p role="status">Loading outputs…</p>}{!outputsLoading && !visibleOutputs.length && <div className="empty-state"><FolderOpen size={35}/><h3>No outputs to display</h3><p>Refresh after a generation. Local browsing requires GENERATOR_OUTPUT_DIR.</p></div>}</>}
      {page === 'connection' && <div className="settings-layout"><Card><CardContent className="settings-card"><h2>API connection</h2><p>Connect through the dashboard server to your local API.</p><Label htmlFor="token">Local API Bearer token</Label><Input id="token" type="password" autoComplete="off" placeholder="Leave empty if authentication is disabled" value={draftToken} onChange={event => setDraftToken(event.target.value)}/><p className="field-help">Held in memory only. Re-enter after refreshing the browser.</p><Button disabled={busy} onClick={() => { if (token === draftToken.trim()) void perform(() => refresh()); else setToken(draftToken.trim()) }}><Activity size={16}/> Apply & test connection</Button><div className="connection-result"><span className={`status-dot ${connected ? 'online' : ''}`}/>{connected ? 'Connection healthy' : 'Waiting for a healthy API connection'}</div></CardContent></Card><div className="setup-guide"><h2>Connection checklist</h2><p>Start Uvicorn on port 8000. For another address, set GENERATOR_API_URL before starting the dashboard server.</p><pre>python -m uvicorn api:app<br/>  --host 127.0.0.1 --port 8000<br/>  --workers 1</pre><h3>Using Colab?</h3><p>Configure GENERATOR_REMOTE_URL and GENERATOR_REMOTE_TOKEN on your local API. Select Colab GPU in the top bar to send tasks through the relay.</p><p>The token field is for your local API; the Colab token stays on the server.</p></div></div>}
      {page === 'colab' && <><div className="colab-hero"><div className="colab-symbol"><Cloud size={44}/></div><div><Badge variant="secondary">DRIVE + COMFYUI + GENERATOR API</Badge><h2>Your models. A cloud GPU.</h2><p>Connect your Drive folders and run ComfyUI and the generator worker together in Colab.</p><Button disabled={busy} onClick={() => void perform(() => api.download('/colab/notebook', 'comfy_generator_colab.ipynb', true))}><ArrowDownToLine size={16}/> Download notebook</Button></div></div><Tabs defaultValue="setup"><TabsList><TabsTrigger value="setup">Setup guide</TabsTrigger><TabsTrigger value="requests">API reference</TabsTrigger></TabsList><TabsContent value="setup"><div className="steps-grid">{[{ title: 'Prepare your runtime', text: 'Upload the notebook to Colab and select a GPU runtime. Set your Drive project and model folders.' }, { title: 'Start your services', text: 'Run setup cells to configure model paths, custom nodes, ComfyUI, and the API. Add both tokens to Colab Secrets.' }, { title: 'Connect and create', text: 'Enable the remote endpoint. Set its HTTPS URL and matching token on your local API, then select Colab GPU here.' }].map((step, index) => <Card key={step.title}><CardContent className="step-card"><span>{String(index + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.text}</p></CardContent></Card>)}</div></TabsContent><TabsContent value="requests"><Card><CardContent className="reference-card"><h3>Available API actions</h3><p>Colab requests add /remote before these paths.</p>{['GET /health', 'GET /operations', 'POST /jobs', 'GET /jobs', 'GET /jobs/{id}', 'POST /jobs/{id}/cancel', 'GET /jobs/{id}/logs', 'GET /jobs/{id}/logs/stream', 'GET /outputs', 'GET /outputs/{path}', 'GET /colab/notebook (local only)'].map(path => <code key={path}>{path}</code>)}</CardContent></Card></TabsContent></Tabs><p className="colab-footnote">Sessions are temporary. Outputs are saved to your configured Drive folder. Your Colab plan must permit your usage.</p></>}
      <footer className="page-footer"><span>Comfy Generator Studio</span><span>Powered by your workflows</span></footer>
    </main></div>
    <Dialog open={newJob} onOpenChange={setNewJob}><DialogContent><DialogHeader><DialogTitle>Start a generation</DialogTitle><DialogDescription>Run a workflow on {remote ? 'Colab' : 'your local machine'}. Empty fields use configured defaults.</DialogDescription></DialogHeader><div className="generation-form"><Label>Workflow</Label><Select value={operation} onValueChange={value => { setOperation(value); setFields({}) }}><SelectTrigger aria-label="Workflow"><SelectValue/></SelectTrigger><SelectContent>{operations.map(item => <SelectItem key={item.operation} value={item.operation}>{names[item.operation] ?? item.operation}</SelectItem>)}</SelectContent></Select>{operations.find(item => item.operation === operation)?.options.map(key => <div className="form-field" key={key}><Label htmlFor={key}>{optionLabels[key] ?? key} <span className="optional-label">Optional</span></Label>{key === 'resize' ? <Select value={fields.resize || 'default'} onValueChange={value => setFields(previous => ({ ...previous, resize: value === 'default' ? '' : value }))}><SelectTrigger id={key}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Use config default</SelectItem><SelectItem value="true">Enable preprocessing</SelectItem><SelectItem value="false">Disable preprocessing</SelectItem></SelectContent></Select> : <Input id={key} aria-describedby={`${key}-help`} value={fields[key] || ''} placeholder="Leave empty to use config" onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}/>}<p id={`${key}-help`} className="option-help">{optionHelp[key]}</p></div>)}<div className="run-target"><span className="status-dot online"/>{remote ? 'Paths refer to the Colab filesystem' : 'Paths refer to your local filesystem'}</div>{!connected && <p className="form-error" role="status">Connect the API before running a generation. Check Connection for settings.</p>}{connected && jobs.some(active) && <p className="job-busy-note" role="status">A generation is already running. You can prepare this form now; run it when the current job finishes, or cancel the current job from its details.</p>}{error && <p role="alert" className="form-error">{error}</p>}<Button disabled={busy || !connected || jobs.some(active) || !operations.some(item => item.operation === operation)} onClick={() => void perform(submit)}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Play size={16}/>} Run generation</Button></div></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null) }}><DialogContent className="preview-dialog"><DialogHeader><DialogTitle>{preview?.output.path.split('/').pop()}</DialogTitle><DialogDescription>Authenticated output preview · {preview && bytes(preview.output.size)}</DialogDescription></DialogHeader>{preview && (/\.(mp4|webm|mov)$/i.test(preview.output.path) ? <video src={preview.url} controls className="preview-media"/> : <img src={preview.url} alt={preview.output.path} className="preview-media"/>)}<Button disabled={busy || !preview} onClick={() => preview && void perform(() => api.download(outputPath(preview.output.path), preview.output.path.split('/').pop()!))}><ArrowDownToLine size={16}/> Download original</Button></DialogContent></Dialog>
  </div>
}
