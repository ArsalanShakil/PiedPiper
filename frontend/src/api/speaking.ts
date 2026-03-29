import { apiGet, apiPost } from './client'
import type { SpeakingTest, SpeakingTestListItem, SpeakingPart, SpeakingBrowseItem } from '../types/exam'

export const fetchTests = () =>
  apiGet<SpeakingTestListItem[]>('/api/speaking/tests')

export const fetchTopics = () =>
  apiGet<string[]>('/api/speaking/topics')

export const fetchTest = (num: number) =>
  apiGet<SpeakingTest>(`/api/speaking/test/${num}`)

export const fetchRandom = (topic?: string) => {
  const qs = topic ? `?topic=${encodeURIComponent(topic)}` : ''
  return apiGet<SpeakingTest>(`/api/speaking/random${qs}`)
}

export const fetchMix = () =>
  apiGet<SpeakingTest>('/api/speaking/mix')

export const fetchPractice = (type?: string, topic?: string) => {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (topic) params.set('topic', topic)
  const qs = params.toString()
  return apiGet<SpeakingPart>(`/api/speaking/practice${qs ? `?${qs}` : ''}`)
}

export const browseSpeaking = (type?: string, topic?: string) => {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (topic) params.set('topic', topic)
  const qs = params.toString()
  return apiGet<SpeakingBrowseItem[]>(`/api/speaking/browse${qs ? `?${qs}` : ''}`)
}

export const synthesizePrompt = (text: string) =>
  apiPost<{ url: string }>('/api/speaking/tts', { text })

export const getAudioUrl = (hashId: string) =>
  `/api/speaking/audio/${hashId}`

export const getBeepUrl = () => '/api/speaking/beep'
