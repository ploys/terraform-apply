import * as child from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as tmp from 'tmp-promise'

import nock from 'nock'
import { ZipFile } from 'yazl'
import { stdout } from 'stdout-stderr'
import { run } from '../src/run'

const exec = util.promisify(child.exec)

function encrypt(buffer: Buffer, secret: string) {
  const key = Buffer.alloc(32, secret, 'utf-8')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const result = Buffer.concat([cipher.update(buffer), cipher.final()])
  const output = `${iv.toString('hex')}:${result.toString('hex')}`

  return output
}

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
    nock.disableNetConnect()

    delete process.env.GITHUB_WORKSPACE
    delete process.env.INPUT_PATH
    delete process.env.INPUT_DECRYPT
    delete process.env.INPUT_OUTPUTS
    delete process.env.SECRET
    delete process.env.RUNNER_TEMP
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
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

  test('applies an encrypted terraform plan', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')

    const source = path.join(cwd, 'tfplan')
    const target = path.join(cwd, 'tfplan.encrypted')

    process.env.GITHUB_WORKSPACE = cwd
    process.env.INPUT_PATH = target
    process.env.INPUT_DECRYPT = 'true'
    process.env.SECRET = 'secret'

    stdout.start()

    try {
      await fs.promises.copyFile(src, dst)
      await exec('terraform init', { cwd })
      await exec('terraform plan -input=false -out=tfplan', { cwd })
      const buffer = await fs.promises.readFile(source)
      await fs.promises.writeFile(target, encrypt(buffer, 'secret'))
      await fs.promises.unlink(source)
      await fs.promises.unlink(dst)
      await run()
    } finally {
      await cleanup()
    }

    stdout.stop()

    expect(stdout.output).toMatch('Creation complete')
  }, 20000)

  test('includes outputs', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')

    process.env.GITHUB_WORKSPACE = cwd
    process.env.INPUT_OUTPUTS = 'true'

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
    expect(stdout.output).toMatch('::set-output name=output::')
  }, 20000)

  test('downloads and extracts artifact', async () => {
    const { path: cwd, cleanup } = await tmp.dir({ unsafeCleanup: true })

    const src = path.join(__dirname, 'fixtures/terraform.tf')
    const dst = path.join(cwd, 'terraform.tf')
    const plan = path.join(cwd, 'tfplan')

    process.env.RUNNER_TEMP = cwd
    process.env.GITHUB_WORKSPACE = cwd
    process.env.GITHUB_TOKEN = 'testing'
    process.env.INPUT_ARTIFACT = 'https://api.github.com/repos/ploys/tests/actions/artifacts/1/zip'
    process.env.INPUT_PATH = 'tfplan-zipped'

    stdout.start()

    try {
      await fs.promises.copyFile(src, dst)
      await exec('terraform init', { cwd })
      await exec('terraform plan -input=false -out=tfplan', { cwd })

      const zip = new ZipFile()
      const out = path.join(cwd, 'tfplan.zip')
      zip.addFile(plan, 'tfplan-zipped')
      zip.end()

      await new Promise(async (resolve, reject) => {
        const pipe = zip.outputStream.pipe(fs.createWriteStream(out))

        pipe.on('close', resolve)
        pipe.on('error', reject)
      })

      await fs.promises.unlink(plan)

      nock('https://api.github.com')
        .get('/repos/ploys/tests/actions/artifacts/1/zip')
        .matchHeader('authorization', `Bearer ${process.env.GITHUB_TOKEN}`)
        .reply(302, undefined, {
          location:
            'https://pipelines.actions.githubusercontent.com/a/_apis/pipelines/1/runs/1/signedlogcontent',
        })

      nock('https://pipelines.actions.githubusercontent.com')
        .get('/a/_apis/pipelines/1/runs/1/signedlogcontent')
        .replyWithFile(200, out)

      await run()
    } finally {
      await cleanup()
    }

    stdout.stop()

    expect(stdout.output).toMatch('Creation complete')
  })
})
