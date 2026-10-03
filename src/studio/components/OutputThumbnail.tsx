import { useEffect, useRef, useState } from 'react'
import { Image, Loader2, Play } from 'lucide-react'
import { GeneratorAPI } from '@/lib/api'
import type { Output } from '@/lib/api'

export function OutputThumbnail({ api, output, onOpen }: { api: GeneratorAPI; output: Output; onOpen: () => void }) {
  const element = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const video = /\.(mp4|webm|mov)$/i.test(output.path)
  useEffect(() => {
    const controller = new AbortController()
    let blobUrl = '', started = false
    setUrl(''); setFailed(false)
    const load = async () => {
      if (started) return
      started = true
      try {
        const path = output.path.split('/').map(encodeURIComponent).join('/')
        const response = await api.response(`/outputs/thumbnail/${path}?v=${output.modified_at ?? 0}`, { signal: controller.signal })
        const blob = await response.blob()
        if (controller.signal.aborted) return
        blobUrl = URL.createObjectURL(blob); setUrl(blobUrl)
      } catch { if (!controller.signal.aborted) setFailed(true) }
    }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load() } }, { rootMargin: '150px' })
    if (element.current) observer.observe(element.current)
    return () => { controller.abort(); observer.disconnect(); if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [api, output.path, output.modified_at])
  return <button ref={element} className="media-placeholder media-thumbnail" onClick={onOpen} aria-label={`Preview ${output.path}`}>
    {url ? <img src={url} alt={output.path} loading="lazy"/> : failed ? <><Image size={30}/><span>Open preview</span></> : <Loader2 size={24} className="animate-spin"/>}
    {video && <span className="video-preview-badge"><Play size={13}/> Video</span>}
  </button>
}
