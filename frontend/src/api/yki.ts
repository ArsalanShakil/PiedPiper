import { apiGet, apiPost } from './client'
import type { ExamSession, EvalResult } from '../types/api'

export const fetchTopics = () =>
  apiGet<string[]>('/api/yki/topics')

export const generateExam = (exam_type: string, topic?: string) =>
  apiPost<{ session_id: number; exam_type: string; data: unknown; error?: string }>(
    '/api/yki/generate',
    { exam_type, topic }
  )

export const submitExam = (session_id: number, answers: Record<string, string>, time_spent_seconds: number) =>
  apiPost<{ ok: boolean }>('/api/yki/submit', { session_id, answers, time_spent_seconds })

export const evaluateExam = (exam_type: string, answers: unknown[], exam_data: unknown) =>
  apiPost<EvalResult>('/api/yki/evaluate', { exam_type, answers, exam_data })

export const synthesizeScript = (text: string) =>
  apiPost<{ audio_path: string; cached: boolean }>('/api/yki/synthesize-script', { text })

export const fetchSessions = () =>
  apiGet<ExamSession[]>('/api/yki/sessions')

export const getAudioCachePlayUrl = (path: string) =>
  `/api/yki/audio-cache/play?path=${encodeURIComponent(path)}`
