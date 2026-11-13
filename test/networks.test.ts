import { describe, expect, it } from 'vitest'
import { ipInAny, parseCidr, parseIp, parseNetworks } from '../lib/guide/networks'
import { clientIp } from '../lib/web/client-ip'

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

describe('networks', () => {
  it('matches IPv4 and IPv6 CIDRs, including IPv4-mapped addresses', () => {
    expect(ipInAny('192.168.1.40', ['192.168.1.0/24'])).toBe(true)
    expect(ipInAny('192.168.2.40', ['192.168.1.0/24'])).toBe(false)
    expect(ipInAny('::ffff:192.168.1.40', ['192.168.1.0/24'])).toBe(true)
    expect(ipInAny('2001:db8::5', ['2001:db8::/32'])).toBe(true)
    expect(ipInAny('2001:db9::5', ['2001:db8::/32'])).toBe(false)
    expect(ipInAny('203.0.113.9', ['203.0.113.9'])).toBe(true)
    expect(ipInAny('10.0.0.1', ['0.0.0.0/0'])).toBe(true)
  })

  it('rejects junk', () => {
    expect(parseIp('999.1.1.1')).toBeNull()
    expect(parseCidr('10.0.0.0/33')).toBeNull()
    expect(ipInAny('not-an-ip', ['10.0.0.0/8'])).toBe(false)
    expect(parseNetworks('10.0.0.0/8, 192.168.1.0/24\nbogus')).toEqual({
      networks: ['10.0.0.0/8', '192.168.1.0/24'],
      invalid: ['bogus'],
    })
  })
})

describe('client address', () => {
  it('takes the entry the trusted proxy appended, not what the client sent', () => {
    // The client forged "10.0.0.5"; the proxy appended the real peer.
    const h = headers({ 'x-forwarded-for': '10.0.0.5, 198.51.100.7' })
    expect(clientIp(h, { TRUSTED_PROXY_HOPS: '1' })).toBe('198.51.100.7')
    expect(clientIp(h, { TRUSTED_PROXY_HOPS: '2' })).toBe('10.0.0.5')
  })

  it('reads only the configured header when CLIENT_IP_HEADER is set', () => {
    const h = headers({ 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '203.0.113.4' })
    expect(clientIp(h, { CLIENT_IP_HEADER: 'cf-connecting-ip' })).toBe('203.0.113.4')
  })
})
