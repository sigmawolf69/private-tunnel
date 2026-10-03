import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync, privateDecrypt, constants, createDecipheriv, createCipheriv, randomBytes} from 'node:crypto'
import {login, logout, studioResponse} from '../src/transport.ts'

test('Web Crypto transport logs in, serializes requests, assembles encrypted media and logs out', async () => {
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength:3072, publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
  const original = globalThis.fetch
  let active=0, peak=0, authenticated=false
  const seen=[]
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://gateway.example/rpc')
    active++;peak=Math.max(peak,active)
    try {
      await new Promise(r=>setTimeout(r,5))
      const envelope=JSON.parse(init.body)
      assert.ok(!init.body.includes('test-password'))
      const keys=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.key,'base64'))
      const ciphertext=Buffer.from(envelope.data,'base64')
      const decipher=createDecipheriv('aes-256-gcm',keys.subarray(0,32),Buffer.from(envelope.nonce,'base64'))
      decipher.setAuthTag(ciphertext.subarray(-16));decipher.setAAD(Buffer.from('private-tunnel/v1/request'))
      const request=JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]))
      seen.push(request)
      let result={id:request.id,status:200,body:'ok'}
      if(request.operation==='login'){
        assert.equal(request.password,'test-password');authenticated=true
        result={...result,session:'test-session',expires:Date.now()+1800000}
      }else{
        assert.ok(authenticated);assert.equal(request.session,'test-session');assert.equal(request.password,undefined)
        if(request.operation==='logout') authenticated=false
        else if(request.body.path==='/outputs/test.mp4') {
          const offset=request.body.offset
          result={...result,encoding:'base64',contentType:'video/mp4',body:Buffer.from(offset===0?'abc':'def').toString('base64'),offset,total:6,nextOffset:offset===0?3:null,etag:'stable'}
        }else result={...result,encoding:'base64',contentType:'application/json',body:Buffer.from('{"status":"ok"}').toString('base64')}
      }
      const nonce=randomBytes(12), cipher=createCipheriv('aes-256-gcm',keys.subarray(32),nonce)
      cipher.setAAD(Buffer.from('private-tunnel/v1/response/'+request.id))
      const data=Buffer.concat([cipher.update(JSON.stringify(result)),cipher.final(),cipher.getAuthTag()])
      return new Response(JSON.stringify({nonce:nonce.toString('base64'),data:data.toString('base64')}),{status:200})
    } finally {active--}
  }
  try {
    await login('https://gateway.example',publicKey,'test-password','upstream-token')
    const responses=await Promise.all([studioResponse('/health'),studioResponse('/operations'),studioResponse('/jobs')])
    for(const response of responses) assert.deepEqual(await response.json(),{status:'ok'})
    assert.equal(peak,1)
    assert.equal(seen[1].body.token,'upstream-token')
    const media=await studioResponse('/outputs/test.mp4')
    assert.equal(await media.text(),'abcdef')
    assert.equal(media.headers.get('content-type'),'video/mp4')
    const controller=new AbortController();controller.abort()
    await assert.rejects(()=>studioResponse('/health',{signal:controller.signal}),{name:'AbortError'})
    logout()
    await new Promise(r=>setTimeout(r,50))
    assert.equal(authenticated,false)
    await assert.rejects(()=>studioResponse('/health'),/Sign in/)
  } finally {globalThis.fetch=original;logout()}
})
