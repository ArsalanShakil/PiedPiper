import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import TtsView from './components/tts/TtsView'
import VocabularyView from './components/vocabulary/VocabularyView'
import KnowledgeView from './components/knowledge/KnowledgeView'
import SettingsView from './components/settings/SettingsView'

function Placeholder({ name }: { name: string }) {
  return (
    <div className="placeholder-page">
      <h2>{name}</h2>
      <p>Coming soon...</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<TtsView />} />
          <Route path="/editor" element={<Placeholder name="Writing Editor" />} />
          <Route path="/vocabulary" element={<VocabularyView />} />
          <Route path="/yki" element={<Placeholder name="YKI Dashboard" />} />
          <Route path="/yki/reading" element={<Placeholder name="Reading Exam" />} />
          <Route path="/yki/writing" element={<Placeholder name="Writing Exam" />} />
          <Route path="/yki/listening" element={<Placeholder name="Listening Exam" />} />
          <Route path="/yki/speaking" element={<Placeholder name="Speaking Exam" />} />
          <Route path="/knowledge" element={<KnowledgeView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
