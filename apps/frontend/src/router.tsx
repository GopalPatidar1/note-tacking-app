import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { GuestRoute } from '@/components/auth/guest-route'
import { LoginPage } from '@/pages/auth/login.page'
import { RegisterPage } from '@/pages/auth/register.page'
import { ForgotPasswordPage } from '@/pages/auth/forgot-password.page'
import { ResetPasswordPage } from '@/pages/auth/reset-password.page'
import { NotesListPage } from '@/pages/notes/notes-list.page'
import { NoteEditorPage } from '@/pages/notes/note-editor.page'

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login',           element: <LoginPage /> },
      { path: '/register',        element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password',  element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/notes',     element: <NotesListPage /> },
      { path: '/notes/new', element: <NoteEditorPage /> },
      { path: '/notes/:id', element: <NoteEditorPage /> },
    ],
  },
  { path: '/', element: <Navigate to="/notes" replace /> },
])
