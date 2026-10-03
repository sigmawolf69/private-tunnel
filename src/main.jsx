import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {seal, unb64} from './crypto.js';
import './style.css';

function App() {
  const [endpoint,setEndpoint] = useState('http://127.0.0.1:8787');
  const [pem,setPem] = useState('');
  const [password,setPassword] = useState('');
  const [operation,setOperation] = useState('status');
  const [body,setBody] = useState('{"message":"Hello from my trusted client"}');
  const [state,setState] = useState('Locked');
  const [result,setResult] = useState('No private data requested.');
  const [busy,setBusy] = useState(false);
  const [localDemo,setLocalDemo] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    fetch('/__local/public-key', {cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
      if (active && data?.pem) {setPem(data.pem);setEndpoint(data.endpoint);setLocalDemo(true);}
    }).catch(()=>{});
    return ()=>{active=false;};
  }, []);
  async function run(e) {
    e.preventDefault(); setBusy(true); setState('Connecting'); setResult('');
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('Remote gateways require HTTPS.');
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only the gateway origin.');
      const request = await seal(pem,password,operation,operation === 'echo' ? JSON.parse(body) : null);
      setPassword('');
      const response = await fetch(url.origin+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.envelope),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error(`Gateway rejected request (${response.status}). Check password, clock, or rate limit.`);
      const data = await request.open(await response.json());
      const text = data.encoding === 'base64' ? new TextDecoder().decode(unb64(data.body)) : data.body;
      setResult(`Local API status: ${data.status}\n\n${text}`); setState('Response decrypted');
    } catch (error) { setState('Request failed'); setResult(error.message); }
    finally { setBusy(false); setPassword(''); }
  }
  return <main><header><span className="eyebrow">PERSONAL PC / PRIVATE ACCESS</span><h1>Your data.<br/>Your keys.</h1><p>Encrypted access to your local Python services.</p></header><div className="notice">Trusted client required. Install this UI independently of Cloudflare and copy your public key directly from your PC. Never paste your private key here.</div><section><form onSubmit={run}><h2>Connect securely</h2>{localDemo && <p className="local-demo">Local demo: public key loaded. Paste the password shown in your terminal or .local-demo/password.txt.</p>}<label>Gateway URL<input value={endpoint} onChange={e=>setEndpoint(e.target.value)} required/></label><label>Server public key (.pem)<input type="file" accept=".pem" onChange={async e=>{const file=e.target.files?.[0]; if(file) setPem(await file.text());}} required={!pem}/></label><label>Password<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={1024}/></label><label>Operation<select value={operation} onChange={e=>setOperation(e.target.value)}><option value="status">Read service status</option><option value="echo">Send encrypted message</option></select></label>{operation==='echo' && <label>JSON payload<textarea value={body} onChange={e=>setBody(e.target.value)}/></label>}<button disabled={busy || !pem}>{busy?'Encrypting / waiting…':'Send encrypted request'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setPassword('');setPem('');setResult('Private data cleared.');setState('Locked');}}>Lock & clear</button></form><article><div className="status" role="status">● {state}</div><h2>Response</h2><pre aria-live="polite">{result}</pre><p className="muted">AES-256-GCM · RSA-OAEP SHA-256<br/>Passwords stay in memory and clear after each request.</p></article></section><footer>Cloudflare can still observe timing, IP addresses, and ciphertext sizes.</footer></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
