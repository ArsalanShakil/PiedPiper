import { apiGet, apiPost } from './client'
import type { ListeningExamData, ListeningPassageItem } from '../types/exam'
import type { EvalResult } from '../types/api'

export const fetchPassages = () =>
  apiGet<ListeningPassageItem[]>('/api/listening/passages')

export const fetchCategories = () =>
  apiGet<string[]>('/api/listening/categories')

export const fetchClip = (index: number) =>
  apiPost<ListeningExamData>(`/api/listening/clip/${index}`, {})

export const generateListening = (category: string, num_clips: number) =>
  apiPost<ListeningExamData>('/api/listening/generate', { category, num_clips })

export const evaluateListening = (answers: string[], clips: ListeningExamData['clips']) =>
  apiPost<EvalResult>('/api/listening/evaluate', { answers, clips })

export const getAudioUrl = (hashId: string) =>
  `/api/listening/audio/${hashId}`
