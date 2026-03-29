import { apiGet, apiPost, apiUpload } from './client'
import type { KnowledgeFile, KnowledgeFileMap, PreviewResult } from '../types/api'

export const fetchFolders = () =>
  apiGet<string[]>('/api/knowledge/folders')

export const fetchFiles = () =>
  apiGet<KnowledgeFileMap>('/api/knowledge/')

export const previewFile = (folder: string, name: string) =>
  apiGet<PreviewResult>(`/api/knowledge/preview?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`)

export const uploadFile = (file: File, folder: string) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)
  return apiUpload<KnowledgeFile>('/api/knowledge/upload', formData)
}

export const deleteFile = (folder: string, name: string) =>
  apiPost<{ ok: boolean }>('/api/knowledge/delete', { folder, name })
