import * as core from '@actions/core'

import { run } from './run'

run().catch(error => {
  core.error(error)
  core.setFailed(error.message)
})
