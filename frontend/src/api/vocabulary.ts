import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { VocabItem } from '../types/api'

export const fetchVocabulary = (search?: string, category?: string) => {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  const qs = params.toString()
  return apiGet<VocabItem[]>(`/api/vocabulary/${qs ? `?${qs}` : ''}`)
}

export const addVocab = (data: {
  swedish_text: string
  translation: string
  context?: string
  notes?: string
  category?: string
}) => apiPost<VocabItem>('/api/vocabulary/', data)

export const updateVocab = (id: number, data: Partial<VocabItem>) =>
  apiPut<VocabItem>(`/api/vocabulary/${id}`, data)

export const deleteVocab = (id: number) =>
  apiDelete(`/api/vocabulary/${id}`)

export const fetchReviewItems = (limit = 10) =>
  apiGet<VocabItem[]>(`/api/vocabulary/review?limit=${limit}`)

export const submitReview = (id: number, knew_it: boolean) =>
  apiPost<{ ok: boolean; new_difficulty: number }>(`/api/vocabulary/review/${id}`, { knew_it })

export const fetchCategories = () =>
  apiGet<string[]>('/api/vocabulary/categories')

export const getExportUrl = () => '/api/vocabulary/export'
