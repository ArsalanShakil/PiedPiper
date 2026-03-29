import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { FullExamProvider } from './context/FullExamContext'
import { VocabProvider } from './context/VocabContext'
import AppLayout from './components/layout/AppLayout'
import TtsView from './components/tts/TtsView'
import VocabularyView from './components/vocabulary/VocabularyView'
import KnowledgeView from './components/knowledge/KnowledgeView'
import SettingsView from './components/settings/SettingsView'
import YkiDashboardView from './components/yki/YkiDashboardView'
import ReadingView from './components/reading/ReadingView'
import WritingView from './components/writing/WritingView'
import ListeningView from './components/listening/ListeningView'
import SpeakingView from './components/speaking/SpeakingView'
import EditorView from './components/editor/EditorView'
import TranslateWidget from './components/common/TranslateWidget'
import GlobalVocab from './components/common/GlobalVocab'

export default function App() {
  return (
    <BrowserRouter>
      <VocabProvider>
        <FullExamProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TtsView />} />
              <Route path="/editor" element={<EditorView />} />
              <Route path="/vocabulary" element={<VocabularyView />} />
              <Route path="/yki" element={<YkiDashboardView />} />
              <Route path="/yki/reading" element={<ReadingView />} />
              <Route path="/yki/writing" element={<WritingView />} />
              <Route path="/yki/listening" element={<ListeningView />} />
              <Route path="/yki/speaking" element={<SpeakingView />} />
              <Route path="/knowledge" element={<KnowledgeView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <GlobalVocab />
          <TranslateWidget />
        </FullExamProvider>
      </VocabProvider>
    </BrowserRouter>
  )
}
