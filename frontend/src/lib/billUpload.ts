/**
 * Prepare a photo or PDF of a bill for scanning.
 *
 * Photos are shrunk in the browser before upload: phone cameras produce
 * 5–12 MB images, far more than is needed to read a bill, and smaller files
 * are quicker on a mobile connection. PDFs are sent as they are.
 */
import type { BillMediaType } from './api'

const MAX_PDF_BYTES   = 5 * 1024 * 1024
const MAX_IMAGE_SIDE  = 1800   // px, longest side — plenty to read small print
const JPEG_QUALITY    = 0.85

export class BillUploadError extends Error {}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new BillUploadError('We couldn\u2019t open that file.'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))   // drop the "data:...;base64," prefix
    }
    reader.readAsDataURL(blob)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new BillUploadError('We couldn\u2019t open that photo. Try a JPG or PNG, or a PDF.'))
    }
    img.src = url
  })
}

export async function prepareBillUpload(file: File): Promise<{ mediaType: BillMediaType; data: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new BillUploadError('That PDF is too large. Please use one under 5 MB, or take a photo of the bill instead.')
    }
    return { mediaType: 'application/pdf', data: await blobToBase64(file) }
  }

  if (!file.type.startsWith('image/')) {
    throw new BillUploadError('Please choose a photo or a PDF of your bill.')
  }

  const img = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new BillUploadError('We couldn\u2019t open that photo.')
  // White background so transparent PNGs do not turn black as JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new BillUploadError('We couldn\u2019t open that photo.')

  return { mediaType: 'image/jpeg', data: await blobToBase64(blob) }
}
