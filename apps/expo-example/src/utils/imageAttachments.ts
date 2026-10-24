import { Directory, File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

export type ImageAttachment = {
  // Name inside the attachments directory. The full URI is resolved at runtime
  // because the app container path can change between installs on iOS
  fileName: string
  mediaType: string
}

export type ImageSource = 'camera' | 'library'

const attachmentsDirectory = new Directory(Paths.document, 'attachments')

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

export const getAttachmentUri = (attachment: ImageAttachment) =>
  new File(attachmentsDirectory, attachment.fileName).uri

export const deleteAttachment = (attachment: ImageAttachment) => {
  const file = new File(attachmentsDirectory, attachment.fileName)
  if (file.exists) file.delete()
}

// Picks images and copies them into the document directory, so they
// outlive the picker's cache files
export async function pickImages(
  source: ImageSource
): Promise<ImageAttachment[]> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Below 1 the picker re-encodes HEIC photos as JPEG, which llama.cpp can decode
    quality: 0.8,
  }

  let result: ImagePicker.ImagePickerResult
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      throw new Error('Camera access is required to take a photo.')
    }
    result = await ImagePicker.launchCameraAsync(options)
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      ...options,
      allowsMultipleSelection: true,
    })
  }
  if (result.canceled) return []

  attachmentsDirectory.create({ idempotent: true })
  return Promise.all(
    result.assets.map(async (asset) => {
      const extension = asset.uri.split('.').pop() ?? 'jpg'
      const fileName = `${createId()}.${extension}`
      await new File(asset.uri).copy(new File(attachmentsDirectory, fileName))
      return {
        fileName,
        mediaType: asset.mimeType ?? 'image/jpeg',
      }
    })
  )
}
