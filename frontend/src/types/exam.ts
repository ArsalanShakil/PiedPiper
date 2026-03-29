// Shared question type
export interface ExamQuestion {
  type: 'mc' | 'tf' | 'open'
  question: string
  options?: string[]
  correct?: string
}

// Reading
export interface ReadingPassage {
  title: string
  text: string
  source: string
  category?: string
  questions: ExamQuestion[]
}

export interface ReadingExamData {
  passages: ReadingPassage[]
}

export interface PassageListItem {
  title: string
  source: string
  category: string
  length: number
  index: number
  num_questions: number
}

// Writing
export interface WritingTask {
  type: string
  label: string
  prompt: string
  word_limit: number
  time_minutes: number
  template?: string
}

export interface WritingMockData {
  tasks: WritingTask[]
  total_minutes: number
}

export interface WritingPrompts {
  [type: string]: { index: number; title: string }[]
}

export interface WritingTaskType {
  type: string
  label: string
  word_limit: number
  time_minutes: number
}

// Listening
export interface ListeningClip {
  title: string
  text: string
  audio_url: string
  questions: ExamQuestion[]
}

export interface ListeningExamData {
  clips: ListeningClip[]
}

export interface ListeningPassageItem {
  title: string
  source: string
  category: string
  index: number
  has_audio: boolean
}

// Speaking
export interface SpeakingTest {
  number: number
  topic: string
  parts: SpeakingPart[]
}

export interface SpeakingPart {
  part: number
  type: 'dialogues' | 'react' | 'narrate' | 'opinion'
  title: string
  instructions: string
  prep_seconds: number
  answer_seconds: number
  items?: DialogueItem[] | ReactItem[]
  topic?: string
  prompts?: string[]
  test_topic?: string
  test_number?: number
  source_topic?: string
}

export interface DialogueItem {
  title: string
  situation: string
  lines: { prompt: string; instruction: string }[]
}

export interface ReactItem {
  situation: string
  instruction: string
}

export interface SpeakingResponse {
  id: string
  transcript: string
}

export interface SpeakingTestListItem {
  number: number
  topic: string
}

export interface SpeakingBrowseItem {
  id: string
  part_label: string
  part_type: string
  title: string
  preview: string
  test: number
  topic: string
  data: SpeakingPart
}

// Full Exam
export interface FullExamState {
  started: string
  currentSection: number
  sections: FullExamSection[]
  scores: Record<string, number>
}

export interface FullExamSection {
  type: string
  label: string
  icon: string
  time: string
  status: 'pending' | 'in_progress' | 'done'
  route: string
}
