// Runs from release-it's after:bump hook. Renames each released package's
// "## Unreleased" section to the new version, so the changelog committed with
// the release says which version shipped each change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const version = process.argv[2]
if (!version) {
  console.error('Usage: bun scripts/stamp-changelogs.ts <version>')
  process.exit(1)
}

const root = join(import.meta.dir, '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const workspaces: string[] =
  manifest['release-it'].plugins['@release-it-plugins/workspaces'].workspaces

const date = new Date().toISOString().slice(0, 10)
const heading = `## ${version} (${date})`

for (const workspace of workspaces) {
  const file = join(root, workspace, 'CHANGELOG.md')
  if (!existsSync(file)) {
    console.error(`${workspace} has no CHANGELOG.md`)
    process.exit(1)
  }

  const changelog = readFileSync(file, 'utf8')
  const stamped = changelog.includes('\n## Unreleased\n')
    ? changelog.replace('\n## Unreleased\n', `\n${heading}\n`)
    : changelog.replace(
        /\n## /,
        `\n${heading}\n\nNo changes. Released to keep package versions in sync.\n\n## `
      )

  if (stamped === changelog) {
    console.error(`Could not stamp ${workspace}/CHANGELOG.md`)
    process.exit(1)
  }

  writeFileSync(file, stamped)
  console.log(`${workspace}/CHANGELOG.md: ${heading}`)
}
