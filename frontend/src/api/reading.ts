import { apiGet, apiPost } from './client'
import type { ReadingExamData, PassageListItem } from '../types/exam'
import type { EvalResult } from '../types/api'

export const fetchPassages = () =>
  apiGet<PassageListItem[]>('/api/reading/passages')

export const fetchCategories = () =>
  apiGet<string[]>('/api/reading/categories')

export const fetchPassage = (index: number) =>
  apiPost<ReadingExamData>(`/api/reading/passage/${index}`, {})

export const generateReading = (category: string, num_passages: number) =>
  apiPost<ReadingExamData>('/api/reading/generate', { category, num_passages })

export const evaluateReading = (answers: string[], passages: ReadingExamData['passages']) =>
  apiPost<EvalResult>('/api/reading/evaluate', { answers, passages })
