export interface NoteVersionDTO {
  id:            string
  noteId:        string
  title:         string
  content:       string
  versionNumber: number
  createdAt:     string
}

export interface PaginatedVersionsDTO {
  items: NoteVersionDTO[]
  total: number
  page:  number
  limit: number
}
