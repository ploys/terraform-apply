import { Writable } from 'stream'

/**
 * A stream that writes to a string.
 */
export class Stream extends Writable {
  private inner = ''

  _write(
    data: string | Buffer | Uint8Array,
    _encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    this.inner += data
    callback()
  }

  contents(): string {
    const split = this.inner.split('\n')
    split.shift()
    return split.join('\n')
  }
}
