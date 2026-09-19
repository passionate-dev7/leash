const now = Math.floor(Date.now()/1000)
const body = {
  jsonrpc:'2.0', id:1, method:'eth_estimateGas',
  params:[{
    from:'0x171062b563f575ac87c42D597c331b0D05a72605',
    nonce:'0x0', type:'0x76', chainId:'0xa5bf',
    calls:[{to:'0x20c0000000000000000000000000000000000000', value:'0x',
      data:'0x95777d590000000000000000000000003ea86ae0b21c583772514e98dcd0943c19d4daf400000000000000000000000000000000000000000000000000000000000f424070726f6265000000000000000000000000000000000000000000000000000000'}],
    validBefore:'0x'+(now+240).toString(16),
    validAfter:'0x'+(now-3600).toString(16),
    nonceKey:'0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    keyId:'0xb7e42cb9e53ba0d813e4c7ec04d123e7936cedcd',
    keyType:'secp256k1', feePayer:true,
  }],
}
const res = await fetch('https://rpc.moderato.tempo.xyz',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
console.log('REVOKED KEY  ->', await res.text())

// control: the live key from the earlier verification run
const body2 = JSON.parse(JSON.stringify(body))
body2.params[0].keyId = '0x64eb6C85AEbb09C57ab46Bd1dE6AE1Ef20063281'
const res2 = await fetch('https://rpc.moderato.tempo.xyz',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body2)})
console.log('LIVE KEY     ->', await res2.text())
