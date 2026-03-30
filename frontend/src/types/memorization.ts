export interface MemorizationItem {
  id: number
  title: string
  original_text: string
  chunks: string[]
  mastery_level: number
  highest_mode_completed: number
  total_drill_count: number
  last_drilled_at: string | null
  next_review_at: string | null
  created_at: string
  updated_at: string
}

export interface DrillResult {
  id: number
  item_id: number
  chunk_index: number
  mode: number
  score: number
  time_spent_seconds: number | null
  mistakes: DrillMistake[]
  drilled_at: string
}

export interface DrillMistake {
  position: number
  expected: string
  actual: string
}

export interface DrillSubmission {
  chunk_index: number
  mode: number
  score: number
  time_spent_seconds?: number
  mistakes?: DrillMistake[]
}

export const DRILL_MODES = [
  { id: 0, label: 'Read & Listen', icon: '📖' },
  { id: 1, label: 'Fill Blanks', icon: '🔲' },
  { id: 2, label: 'First Letters', icon: '🔤' },
  { id: 3, label: 'Recall & Write', icon: '✍️' },
  { id: 4, label: 'Speed Round', icon: '⚡' },
] as const
