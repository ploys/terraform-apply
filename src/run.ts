import * as fs from 'fs'
import * as path from 'path'

import extract from 'extract-zip'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { HttpClient } from '@actions/http-client'

import * as util from './util'
import { Stream } from './stream'

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

  const artifact = core.getInput('artifact')

  if (artifact && artifact !== '') {
    const tmp = util.tempdir()
    const regex = /^https:\/\/api\.github\.com\/repos\/.+\/.+\/actions\/artifacts\/.+\/zip$/gm
    const token = process.env.GITHUB_TOKEN

    if (!artifact.match(regex)) {
      throw new Error(`Unsupported artifact url ${artifact}`)
    }

    if (!token) {
      throw new Error("Expected environment variable 'GITHUB_TOKEN'")
    }

    const client = new HttpClient('http-client')
    const zip = path.join(tmp, 'artifact.zip')
    const file = fs.createWriteStream(zip)
    const res = await client.get(artifact, { authorization: `Bearer ${token}` })

    await new Promise(async (resolve, reject) => {
      const pipe = res.message.pipe(file)

      pipe.on('close', resolve)
      pipe.on('error', reject)
    })
    await extract(zip, { dir: path.dirname(source) })
    await fs.promises.unlink(zip)
  }

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
    if (artifact && artifact !== '') {
      throw new Error('Plan file from artifact not found at input path')
    }

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
    const stream = new Stream()

    await exec.exec('terraform', ['output', '-json'], {
      cwd,
      outStream: stream,
    })

    const c = stream.contents()
    throw new Error(c)
    const outputs = JSON.parse(c) as Outputs

    for (const [key, data] of Object.entries(outputs)) {
      if (data.sensitive) {
        core.setSecret(data.value)
      }

      core.setOutput(key, data.value)
    }
  }
}
