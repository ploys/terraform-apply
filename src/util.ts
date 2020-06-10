import * as crypto from 'crypto'

/**
 * Decrypts a plan file.
 *
 * @param buffer - The encrypted plan.
 * @param secret - The encryption passphrase.
 *
 * @returns The decrypted output.
 */
export function decrypt(buffer: Buffer, secret: string): Buffer {
  try {
    const key = Buffer.alloc(32, secret, 'utf-8')
    const [head, tail] = buffer.toString().split(':', 2)
    const iv = Buffer.from(head, 'hex')
    const encrypted = Buffer.from(tail, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const decrypted = decipher.update(encrypted)

    return Buffer.concat([decrypted, decipher.final()])
  } catch {
    throw new Error('Unable to decrypt plan file with given secret')
  }
}

/**
 * Gets the temporary directory.
 *
 * @returns The temporary directory.
 */
export function tempdir(): string {
  const temp = process.env['RUNNER_TEMP']

  if (temp) return temp

  throw new Error('Temporary directory not defined')
}
