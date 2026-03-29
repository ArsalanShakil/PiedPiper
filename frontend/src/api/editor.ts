import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { Document, DocumentListItem, TranslationResult } from '../types/api'

export const fetchDocuments = () =>
  apiGet<DocumentListItem[]>('/api/editor/documents')

export const createDocument = (title: string, folder: string) =>
  apiPost<Document>('/api/editor/documents', { title, folder })

export const fetchDocument = (id: number) =>
  apiGet<Document>(`/api/editor/documents/${id}`)

export const updateDocument = (id: number, data: Partial<Pick<Document, 'title' | 'folder' | 'content_html' | 'content_text'>>) =>
  apiPut<Document>(`/api/editor/documents/${id}`, data)

export const deleteDocument = (id: number) =>
  apiDelete(`/api/editor/documents/${id}`)

export const fetchFolders = () =>
  apiGet<string[]>('/api/editor/folders')

export const translate = (text: string, context?: string, source = 'sv', target = 'en') =>
  apiPost<TranslationResult>('/api/editor/translate', { text, context, source, target })
