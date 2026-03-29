import { apiGet, apiPost } from './client'
import type { WritingTask, WritingMockData, WritingPrompts, WritingTaskType } from '../types/exam'
import type { EvalResult } from '../types/api'

export const fetchTaskTypes = () =>
  apiGet<WritingTaskType[]>('/api/writing/types')

export const fetchPrompts = () =>
  apiGet<WritingPrompts>('/api/writing/prompts')

export const generateMock = () =>
  apiPost<WritingMockData>('/api/writing/generate-mock', {})

export const generatePractice = (type?: string, index?: number) =>
  apiPost<WritingTask>('/api/writing/generate-practice', { type: type || '', index: index ?? -1 })

export const evaluateWriting = (tasks: WritingTask[], answers: string[]) =>
  apiPost<EvalResult>('/api/writing/evaluate', { tasks, answers })
