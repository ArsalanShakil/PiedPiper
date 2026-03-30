import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { MemorizationItem, DrillSubmission } from '../types/memorization'

export const fetchItems = (search?: string) =>
  apiGet<MemorizationItem[]>(`/api/memorization/${search ? `?search=${encodeURIComponent(search)}` : ''}`)

export const createItem = (data: { title: string; original_text: string }) =>
  apiPost<MemorizationItem>('/api/memorization/', data)

export const fetchItem = (id: number) =>
  apiGet<MemorizationItem>(`/api/memorization/${id}`)

export const updateItem = (id: number, data: Partial<{ title: string; original_text: string }>) =>
  apiPut<MemorizationItem>(`/api/memorization/${id}`, data)

export const deleteItem = (id: number) =>
  apiDelete(`/api/memorization/${id}`)

export const submitDrill = (id: number, data: DrillSubmission) =>
  apiPost<MemorizationItem>(`/api/memorization/${id}/drills`, data)

export const fetchDueItems = () =>
  apiGet<MemorizationItem[]>('/api/memorization/due')
