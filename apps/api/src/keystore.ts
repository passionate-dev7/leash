import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Agent keys at rest: AES-256-GCM under a master key that lives outside the repo and outside the
 * data dir, so a copy of the database (or of the data dir) holds nothing spendable.
 * Stored form: `enc1:<iv>:<tag>:<ciphertext>`, base64url. The key id is bound in as additional
 * authenticated data, so a ciphertext moved onto another agent row fails to open.
 */

const PREFIX = 'enc1'
export const MASTER_KEY_PATH = join(homedir(), '.config', 'leash-api', 'master.key')

export type Cipher = {
  seal(plaintext: string, binding: string): string
  open(stored: string, binding: string): string
}

export const isSealed = (stored: string): boolean => stored.startsWith(`${PREFIX}:`)

/** Reads the master key, creating it (mode 600, directory 700) on first use. */
export function loadMasterKey(path = MASTER_KEY_PATH): Buffer {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    chmodSync(dirname(path), 0o700)
    writeFileSync(path, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' })
  }
  chmodSync(path, 0o600)
  const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64')
  if (key.length !== 32) throw new Error(`${path} must hold a base64 encoded 32 byte key`)
  return key
}

export function createCipher(key: Buffer): Cipher {
  if (key.length !== 32) throw new Error('the master key must be 32 bytes')
  const b64 = (b: Buffer) => b.toString('base64url')
  return {
    seal(plaintext, binding) {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      c.setAAD(Buffer.from(binding.toLowerCase()))
      const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
      return [PREFIX, b64(iv), b64(c.getAuthTag()), b64(ct)].join(':')
    },
    open(stored, binding) {
      const [prefix, iv, tag, ct] = stored.split(':')
      if (prefix !== PREFIX || !iv || !tag || !ct) throw new Error('stored key is not in the sealed format')
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      d.setAAD(Buffer.from(binding.toLowerCase()))
      d.setAuthTag(Buffer.from(tag, 'base64url'))
      try {
        return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
      } catch {
        throw new Error('stored key failed authentication: wrong master key or the row was altered')
      }
    },
  }
}
