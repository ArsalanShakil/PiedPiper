import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'

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
          <Route path="/" element={<Placeholder name="Text to Speech" />} />
          <Route path="/editor" element={<Placeholder name="Writing Editor" />} />
          <Route path="/vocabulary" element={<Placeholder name="Vocabulary" />} />
          <Route path="/yki" element={<Placeholder name="YKI Dashboard" />} />
          <Route path="/yki/reading" element={<Placeholder name="Reading Exam" />} />
          <Route path="/yki/writing" element={<Placeholder name="Writing Exam" />} />
          <Route path="/yki/listening" element={<Placeholder name="Listening Exam" />} />
          <Route path="/yki/speaking" element={<Placeholder name="Speaking Exam" />} />
          <Route path="/knowledge" element={<Placeholder name="Knowledge Base" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
