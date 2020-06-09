import * as fs from 'fs'
import * as path from 'path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

/**
 * Runs the action.
 */
export async function run(): Promise<void> {
  const cwd = process.env.GITHUB_WORKSPACE as string
  const pth = path.resolve(cwd, core.getInput('path'))

  const stat = await fs.promises.stat(pth)

  if (stat.isFile()) {
    await exec.exec('terraform', ['apply', '-auto-approve', '-input=false', pth], {
      cwd: path.dirname(pth),
    })
  } else if (stat.isDirectory()) {
    await exec.exec('terraform', ['apply', '-auto-approve', '-input=false', pth], {
      cwd: pth,
    })
  } else {
    throw new Error(`Unrecognized file or directory at ${path}`)
  }
}
