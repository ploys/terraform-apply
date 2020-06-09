import * as fs from 'fs'
import * as path from 'path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

import * as util from './util'

type Outputs = {
  [key: string]: {
    sensitive: boolean
    type: string
    value: any
  }
}

/**
 * Runs the action.
 */
export async function run(): Promise<void> {
  const cwd = process.env.GITHUB_WORKSPACE as string

  const decrypt = core.getInput('decrypt')
  const source = path.resolve(cwd, core.getInput('path'))
  const stat = await fs.promises.stat(source)

  if (stat.isFile()) {
    if (decrypt && (decrypt === 'true' || decrypt === 'on')) {
      const secret = process.env.SECRET

      if (!secret) {
        throw new Error("Expected environment variable 'SECRET' with utf-8 encoding")
      }

      const buffer = await fs.promises.readFile(source)
      const output = util.decrypt(buffer, secret)
      const target = `${source}.decrypted`

      await fs.promises.writeFile(target, output)
      await exec.exec('terraform', ['apply', '-auto-approve', '-input=false', target], {
        cwd: path.dirname(source),
      })
      await fs.promises.unlink(target)
    } else {
      await exec.exec('terraform', ['apply', '-auto-approve', '-input=false', source], {
        cwd: path.dirname(source),
      })
    }
  } else if (stat.isDirectory()) {
    if (decrypt && (decrypt === 'true' || decrypt === 'on')) {
      throw new Error('Decryption expects a plan file as input path')
    }

    await exec.exec('terraform', ['apply', '-auto-approve', '-input=false', source], {
      cwd: source,
    })
  } else {
    throw new Error(`Unrecognized file or directory at ${path}`)
  }

  const output = core.getInput('outputs')

  if (output && (output === 'true' || output === 'on')) {
    let stdout = ''

    await exec.exec('terraform', ['output', '-json'], {
      cwd,
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString()
        },
      },
    })

    const outputs = JSON.parse(stdout) as Outputs

    for (const [key, data] of Object.entries(outputs)) {
      core.setOutput(key, data.value)
    }
  }
}
