/** A model on the Hugging Face Hub. */
export interface HuggingFaceRef {
  repo: string
  revision: string
  /** The file in the repo. When missing, the file is chosen from the repo's top level. */
  path?: string
}

const BARE_REPO = /^[\w.-]+\/[\w.-]+$/

/**
 * Read `hf://<org>/<repo>[@<revision>][/<path>]`, or a bare `<org>/<repo>`.
 * Returns undefined for anything else: a URL or a local path.
 */
export function parseHuggingFaceId(
  modelId: string
): HuggingFaceRef | undefined {
  let rest: string
  if (modelId.startsWith('hf://')) rest = modelId.slice('hf://'.length)
  else if (BARE_REPO.test(modelId) && !modelId.endsWith('.litertlm'))
    rest = modelId
  else return undefined

  const [org, repoAndRevision, ...path] = rest.split('/')
  if (!org || !repoAndRevision) return undefined
  const [repo, revision] = repoAndRevision.split('@')
  if (!repo) return undefined
  return {
    repo: `${org}/${repo}`,
    revision: revision !== undefined ? decodeURIComponent(revision) : 'main',
    path: path.length > 0 ? path.join('/') : undefined,
  }
}

export interface RepoFile {
  path: string
  size?: number
  /** SHA-256 of a file stored with Git LFS. */
  sha256?: string
}

/** Bundles compiled for one chip, or the browser's copy: never the default on a phone. */
const NOT_FOR_ANY_PHONE =
  /(^|[-_.])(google_tensor|intel|qualcomm|mediatek|npu|web|mt\d{4}|sm\d{4}|qcs\d{4})([-_.]|$)/i
/** A GPU-only bundle: smaller, but it has no CPU path. */
const GPU_FILE = /[-_]gpu\.litertlm$/i
/** Suffixes of repo names that aren't part of their models' names. */
const REPO_NAME_SUFFIX = /[-_](litert[-_]?lm|litert)$/i
const INT4 = /int4/i

function repoBaseName(repo: string): string {
  return repo.slice(repo.indexOf('/') + 1).replace(REPO_NAME_SUFFIX, '')
}

/**
 * Choose the `.litertlm` file a phone should load from a repo. A repo can hold a GPU-only
 * bundle next to a full one, and which of them comes first differs by platform:
 *
 * - iOS: the GPU file. On an iPhone 18 Pro the full bundle with its drafter declined a long
 *   prompt on the GPU.
 * - Android: the full bundle. With LiteRT-LM 0.18.1 the GPU file gave wrong text, and no
 *   error, on a Pixel 11 Pro (PowerVR). The full bundle answered on every phone tried, and
 *   it can fall back to the CPU.
 *
 * Among those, the order follows `@litert-lm/core` in the browser, without its first step (a
 * file with a GPU-only twin): the file named after the repo, then `model`, then the smallest
 * quantization, then the shortest name.
 */
export function selectRepoFile(
  files: RepoFile[],
  repo: string,
  backend: 'gpu' | 'cpu' | 'npu' | undefined,
  platform: 'android' | 'ios'
): RepoFile | undefined {
  const candidates = files.filter(
    (file) =>
      file.path.toLowerCase().endsWith('.litertlm') &&
      !NOT_FOR_ANY_PHONE.test(file.path)
  )
  const gpuFiles = candidates.filter((file) => GPU_FILE.test(file.path))
  const otherFiles = candidates.filter((file) => !GPU_FILE.test(file.path))
  let matching: RepoFile[]
  if (backend === 'cpu') matching = otherFiles
  else if (platform === 'ios')
    matching = gpuFiles.length > 0 ? gpuFiles : otherFiles
  else matching = otherFiles.length > 0 ? otherFiles : gpuFiles

  const repoName = repoBaseName(repo).toLowerCase()
  const score = (file: RepoFile): number[] => {
    const path = file.path.toLowerCase()
    const name = path.replace(GPU_FILE, '').replace(/\.litertlm$/, '')
    return [
      name === repoName ? 0 : 1,
      name === 'model' ? 0 : 1,
      INT4.test(name) ? 0 : 1,
      path.length,
    ]
  }
  return [...matching].sort((a, b) => {
    const [sa, sb] = [score(a), score(b)]
    const at = sa.findIndex((value, i) => value !== sb[i])
    if (at !== -1) return (sa[at] as number) - (sb[at] as number)
    return a.path < b.path ? -1 : 1
  })[0]
}

/** Letters and digits only: `Qwen3-0.6B`, `qwen3_0_6b` and `Qwen3_0.6B` read the same. */
const plainName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** What follows a model's name in a file name when it says how the file was built. */
const BUILD_SUFFIX =
  /^(gpu|cpu|mixed|dynamic|int\d|q\d|fp\d|f\d|multi|fixed|seq|ekv)/

/**
 * The file already on the phone for a repo, when the Hub can't say which it is. The phone's
 * cache holds file names, not repos, so this goes by name: the repo's name, then nothing or
 * how the file was built. Anything else may be another model (`Qwen3` and `Qwen3-8B`).
 */
export function selectKeptFile(
  fileNames: string[],
  repo: string,
  backend: 'gpu' | 'cpu' | 'npu' | undefined,
  platform: 'android' | 'ios'
): RepoFile | undefined {
  const repoName = plainName(repoBaseName(repo))
  const fromRepo = fileNames
    .filter((name) => {
      const plain = plainName(name.replace(/\.litertlm$/i, ''))
      if (!plain.startsWith(repoName)) return false
      const rest = plain.slice(repoName.length)
      return rest === '' || BUILD_SUFFIX.test(rest)
    })
    .map((path) => ({ path }))
  return selectRepoFile(fromRepo, repo, backend, platform)
}

export function resolveUrl(ref: HuggingFaceRef, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `https://huggingface.co/${ref.repo}/resolve/${encodeURIComponent(ref.revision)}/${encodedPath}`
}

/** The Hub's list of a folder in a repo: its top level, when no folder is given. */
export function treeUrl(ref: HuggingFaceRef, folder?: string): string {
  const url = `https://huggingface.co/api/models/${ref.repo}/tree/${encodeURIComponent(ref.revision)}`
  return folder !== undefined
    ? `${url}/${folder.split('/').map(encodeURIComponent).join('/')}`
    : url
}

/** Read the Hub's tree listing into the fields needed to choose and check a file. */
export function parseTree(body: unknown): RepoFile[] {
  if (!Array.isArray(body)) return []
  return body.flatMap((item): RepoFile[] => {
    if (typeof item !== 'object' || item === null) return []
    const entry = item as {
      type?: unknown
      path?: unknown
      size?: unknown
      lfs?: { oid?: unknown }
    }
    if (entry.type !== 'file' || typeof entry.path !== 'string') return []
    return [
      {
        path: entry.path,
        size: typeof entry.size === 'number' ? entry.size : undefined,
        sha256: typeof entry.lfs?.oid === 'string' ? entry.lfs.oid : undefined,
      },
    ]
  })
}
