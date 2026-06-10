export const DEFAULT_PAGE  = 1
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT     = 100

export const NOTE_SORT_VALUES = [
  'createdAt_asc', 'createdAt_desc',
  'updatedAt_asc', 'updatedAt_desc',
  'title_asc',     'title_desc',
] as const

export type NoteSortValue = typeof NOTE_SORT_VALUES[number]
