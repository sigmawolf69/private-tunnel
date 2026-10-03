import {useEffect, useState, type FormEvent} from 'react'
import {createRoot} from 'react-dom/client'
import Studio from './studio/App'
import {login, logout, onLogout} from './transport'
import './studio/index.css'
import './login.css'

function App() {
  const [expires, setExpires] = useState(0)
  const [endpoint, setEndpoint] = useState('')
  const [pem, setPem] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(()=>onLogout(()=>{setExpires(0);setPassword('');setToken('')}), [])
  useEffect(()=>{if (!expires) return; const timer=setTimeout(logout, Math.max(0,expires-Date.now())); return ()=>clearTimeout(timer)}, [expires])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('')
    try {setExpires(await login(endpoint,pem,password,token))}
    catch(error){setError(error instanceof Error ? error.message : 'Unable to connect')}
    finally{setBusy(false);setPassword('');setToken('')}
  }
  if (expires) return <><div className="secure-session"><span>Encrypted connection · Session ends {new Date(expires).toLocaleTimeString()}</span><button onClick={logout}>Lock & sign out</button></div><Studio/></>
  return <main className="gateway-login"><form onSubmit={submit}><span className="login-eyebrow">PRIVATE ACCESS</span><h1>Comfy Generator Studio</h1><p>Sign in to your PC through the encrypted gateway.</p><label>Gateway URL<input type="url" placeholder="https://your-tunnel.trycloudflare.com" value={endpoint} onChange={e=>setEndpoint(e.target.value)} required/></label><label>Server public key<input type="file" accept=".pem" required onChange={async e=>{setPem(''); const file=e.target.files?.[0];if(file) try{setPem(await file.text())}catch{setError('Cannot read public key')}}}/></label><label>Gateway password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="off"/></label><label>Comfy API token (only if your API requires one)<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label>{error && <p role="alert">{error}</p>}<button disabled={busy || !pem}>{busy?'Connecting…':'Unlock studio'}</button><small>Credentials stay in memory. Refreshing signs you out. Use your trusted public key; never upload the private key.</small></form></main>
}
const root=document.getElementById('root')
if(!root) throw new Error('Missing root')
createRoot(root).render(<App/>);
