import RNBlobUtil from 'react-native-blob-util'

export const CORE_AI_STORAGE_PATH = `${RNBlobUtil.fs.dirs.DocumentDir}/coreai-models`

type HubFile = { type: string; path: string; size: number }

// Downloads every file under `folder` of a Hugging Face repo into `destPath`.
// Files land in a .partial directory that is moved into place once complete,
// so a model directory that exists is always whole
export async function downloadHubFolder(
  repo: string,
  folder: string,
  destPath: string,
  onProgress?: (percentage: number) => void
) {
  const response = await fetch(
    `https://huggingface.co/api/models/${repo}/tree/main/${folder}?recursive=true`
  )
  if (!response.ok) {
    throw new Error(`Failed to list ${repo}/${folder}: ${response.status}`)
  }
  const files = ((await response.json()) as HubFile[]).filter(
    (file) => file.type === 'file'
  )
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const partialPath = `${destPath}.partial`
  let done = 0
  for (const file of files) {
    const relativePath = file.path.slice(folder.length + 1)
    await RNBlobUtil.config({ path: `${partialPath}/${relativePath}` })
      .fetch(
        'GET',
        `https://huggingface.co/${repo}/resolve/main/${file.path}?download=true`
      )
      .progress((received) => {
        onProgress?.(Math.round(((done + Number(received)) / total) * 100))
      })
    done += file.size
  }
  await RNBlobUtil.fs.mv(partialPath, destPath)
}
