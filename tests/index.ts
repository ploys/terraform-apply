import * as child from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as tmp from 'tmp-promise'

import { stdout } from 'stdout-stderr'
import { run } from '../src/run'

const exec = util.promisify(child.exec)

describe('Terraform Apply', () => {
  const sha = crypto.createHash('sha1').digest('hex')

  beforeAll(() => {
    process.env.GITHUB_ACTION = 'ploysterraformapply'
    process.env.GITHUB_ACTOR = 'ploys'
    process.env.GITHUB_EVENT_NAME = 'deployment'
    process.env.GITHUB_EVENT_PATH = path.join(__dirname, 'fixtures/payload.json')
    process.env.GITHUB_REF = sha
    process.env.GITHUB_REPOSITORY = 'ploys/tests'
    process.env.GITHUB_SHA = sha
    process.env.GITHUB_WORKFLOW = 'cd'
  })

  beforeEach(() => {
    delete process.env.GITHUB_WORKSPACE
    delete process.env.INPUT_PATH
  })

  test('applies the working directory', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')

    process.env.GITHUB_WORKSPACE = cwd

    stdout.start()

    try {
      await fs.promises.copyFile(src, dst)
      await exec('terraform init', { cwd })
      await run()
    } finally {
      await cleanup()
    }

    stdout.stop()

    expect(stdout.output).toMatch('Creation complete')
  }, 20000)

  test('applies a terraform directory', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')

    process.env.GITHUB_WORKSPACE = cwd
    process.env.INPUT_PATH = cwd

    stdout.start()

    try {
      await fs.promises.copyFile(src, dst)
      await exec('terraform init', { cwd })
      await run()
    } finally {
      await cleanup()
    }

    stdout.stop()

    expect(stdout.output).toMatch('Creation complete')
  }, 20000)

  test('applies a terraform plan', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')

    process.env.GITHUB_WORKSPACE = cwd
    process.env.INPUT_PATH = path.join(cwd, 'tfplan')

    stdout.start()

    try {
      await fs.promises.copyFile(src, dst)
      await exec('terraform init', { cwd })
      await exec('terraform plan -input=false -out=tfplan', { cwd })
      await fs.promises.stat(path.join(cwd, 'tfplan'))
      await run()
    } finally {
      await cleanup()
    }

    stdout.stop()

    expect(stdout.output).toMatch('Creation complete')
  }, 20000)
})
