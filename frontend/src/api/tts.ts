import { apiGet, apiPost } from './client'
import type { Voice, SynthesizeRequest, SynthesizeResponse, AudioFile, BrowseResult, RecentFolder } from '../types/api'

export const fetchVoices = () => apiGet<Voice[]>('/api/voices')

export const fetchRecentFolders = () => apiGet<RecentFolder[]>('/api/recent-folders')

export const browse = (path?: string) =>
  apiGet<BrowseResult>(path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse')

export const synthesize = (req: SynthesizeRequest) =>
  apiPost<SynthesizeResponse>('/api/synthesize', req)

export const fetchFiles = (folder?: string) =>
  apiGet<AudioFile[]>(folder ? `/api/files?folder=${encodeURIComponent(folder)}` : '/api/files')

export const deleteFile = (folder: string, name: string) =>
  apiPost<{ ok: boolean }>('/api/files/delete', { folder, name })

export const getPlayUrl = (folder: string, name: string) =>
  `/api/files/play?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`
