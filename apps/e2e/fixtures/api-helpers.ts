import type { Page } from '@playwright/test'

const API = 'http://localhost:3000/api'

export async function getToken(page: Page): Promise<string> {
  // localStorage is only accessible on the app origin, not on about:blank
  if (!page.url().startsWith('http://localhost:5173')) {
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  }
  const token = await page.evaluate(() => localStorage.getItem('auth.accessToken'))
  if (!token) throw new Error('No access token in localStorage')
  return token
}

export async function createNote(
  token: string,
  title: string,
  content = '<p></p>',
): Promise<{ id: string; title: string }> {
  const res = await fetch(`${API}/notes`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ title, content, tagIds: [] }),
  })
  const json = await res.json() as { data: { id: string; title: string } }
  return json.data
}

export async function updateNote(
  token: string,
  id: string,
  title: string,
  content: string,
): Promise<void> {
  await fetch(`${API}/notes/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ title, content }),
  })
}

export async function deleteNote(token: string, id: string): Promise<void> {
  await fetch(`${API}/notes/${id}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function createTag(
  token: string,
  name: string,
  color = '#3b82f6',
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${API}/tags`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ name, color }),
  })
  const json = await res.json() as { data: { id: string; name: string } }
  return json.data
}

export async function deleteTag(token: string, id: string): Promise<void> {
  await fetch(`${API}/tags/${id}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function assignTagToNote(
  token: string,
  noteId: string,
  tagIds: string[],
): Promise<void> {
  await fetch(`${API}/notes/${noteId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ tagIds }),
  })
}
