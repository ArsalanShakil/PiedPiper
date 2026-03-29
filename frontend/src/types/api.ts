// TTS
export interface Voice {
  id: string
  name: string
  path: string
}

export interface BrowseResult {
  current: string
  parent: string | null
  directories: { name: string; path: string }[]
}

export interface RecentFolder {
  name: string
  path: string
}

export interface SynthesizeRequest {
  text: string
  voice_id: string
  format: string
  save_path: string
  filename: string
}

export interface SynthesizeResponse {
  filename: string
  folder: string
  path: string
  size: number
}

export interface AudioFile {
  name: string
  folder: string
  folder_short: string
  format: string
  size: number
  created: string
}

// Editor / Documents
export interface Document {
  id: number
  title: string
  folder: string
  content_html: string
  content_text: string
  word_count: number
  created_at: string
  updated_at: string
}

export interface DocumentListItem {
  id: number
  title: string
  folder: string
  word_count: number
  updated_at: string
}

export interface TranslationResult {
  translation: string
  word_by_word: { sv: string; en: string }[]
  grammar_notes: string
}

// Vocabulary
export interface VocabItem {
  id: number
  swedish_text: string
  translation: string
  context: string | null
  notes: string | null
  category: string | null
  difficulty: number
  review_count: number
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

// Knowledge Base
export interface KnowledgeFile {
  name: string
  folder: string
  path: string
  extension: string
  size: number
  bundled: boolean
}

export interface KnowledgeFileMap {
  [folder: string]: KnowledgeFile[]
}

export interface PreviewResult {
  name: string
  folder: string
  content: string
  truncated: boolean
  full_size: number
}

// Exam Sessions
export interface ExamSession {
  id: number
  exam_type: string
  topic: string | null
  status: string
  started_at: string
  completed_at: string | null
  total_score: number | null
  time_spent_seconds: number | null
}

export interface EvalResult {
  score: number
  feedback: string
  details?: { correct: boolean | null; your_answer: string; correct_answer: string }[]
  task_feedback?: { score: number; feedback: string }[]
}
