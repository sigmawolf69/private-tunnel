import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export default defineConfig({
  server: {fs: {deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/secrets/**', '**/.local-demo/**']}},
  plugins:[{
  name:'local-demo-public-key', apply:'serve',
  configureServer(server) {
    const root=process.env.LOCAL_DEMO_ROOT;
    if (!root) return;
    server.middlewares.use('/__local/public-key', (req,res)=>{
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type','application/json');
      if(req.method!=='GET'){res.statusCode=405;res.end();return;}
      try {
        const pem=readFileSync(resolve(root,'secrets/public.pem'),'utf8');
        res.end(JSON.stringify({pem,endpoint:'http://127.0.0.1:8787'}));
      } catch {res.statusCode=503;res.end(JSON.stringify({error:'Local setup unavailable'}));}
    });
  },
}]});
