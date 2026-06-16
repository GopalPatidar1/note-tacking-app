# Note Taking Application

## Software Design Specification (SDS)

### Technology Stack

Frontend:

* React 19
* TypeScript
* Vite
* TanStack Query
* Zustand
* TipTap
* shadcn/ui

Backend:

* Node.js 22
* Express 5
* TypeScript

Database:

* PostgreSQL 16
* Prisma ORM

Testing:

* Vitest
* Supertest
* Playwright

Monorepo:

* pnpm workspaces

---

# System Architecture

Client
↓
React Application
↓
Express API
↓
Service Layer
↓
Repository Layer
↓
Prisma ORM
↓
PostgreSQL

---

# Monorepo Structure

/apps
/frontend
/backend

/packages
/shared

/openspec

---

# Shared Package

Contains:

* Zod Schemas
* DTOs
* API Types
* Enums
* Constants

Rule:
No type duplication allowed.

---

# Database Design

## Users

users

* id
* name
* email
* passwordHash
* createdAt
* updatedAt

---

## Refresh Tokens

refresh_tokens

* id
* userId
* token
* expiresAt
* createdAt

---

## Password OTP

password_reset_otps

* id
* userId
* otp
* expiresAt
* usedAt

---

## Notes

notes

* id
* userId
* title
* content
* deletedAt
* createdAt
* updatedAt

---

## Tags

tags

* id
* userId
* name
* color

---

## Note Tags

note_tags

* noteId
* tagId

---

## Share Links

share_links

* id
* noteId
* token
* expiresAt
* revokedAt
* viewCount

---

## Note Versions

note_versions

* id
* noteId
* title
* content
* versionNumber
* createdAt

---

# API Design

## Auth

POST /auth/register

POST /auth/login

POST /auth/logout

POST /auth/refresh

POST /auth/forgot-password

POST /auth/reset-password

---

## Notes

GET /notes

GET /notes/:id

POST /notes

PATCH /notes/:id

DELETE /notes/:id

---

## Tags

GET /tags

POST /tags

PATCH /tags/:id

DELETE /tags/:id

---

## Search

GET /search

Parameters:

* q
* page
* limit

---

## Sharing

POST /notes/:id/share

GET /public/:token

DELETE /share/:id

---

## Version History

GET /notes/:id/versions

GET /notes/:id/versions/:versionId

POST /notes/:id/versions/:versionId/restore

---

# Security Design

Authentication:

* JWT Access Token
* Refresh Token

Authorization:

* User-scoped resources

Validation:

* Zod

Password:

* bcrypt hashing

Rate Limiting:

* Auth endpoints

---

# Search Design

PostgreSQL Full Text Search

Indexes:

* tsvector(title || content)

Functions:

* to_tsvector()
* plainto_tsquery()
* ts_headline()

---

# Testing Strategy

Unit Tests:

* Services

Integration Tests:

* Controllers
* Repositories

E2E Tests:

* Complete user journey

Coverage:

> = 80%

---

# Deployment Constraints

* Node.js 22
* PostgreSQL 16
* Environment-based configuration
* No external search service

---

# Ticket Mapping

AB-1001 → Setup

AB-1002 → Auth Login/Register

AB-1003 → Password Reset

AB-1004 → Notes CRUD

AB-1005 → Pagination & Filters

AB-1006 → Tags

AB-1007 → Search

AB-1008 → Sharing

AB-1009 → Version History

AB-1010  Frontend — Auth pages
AB-1011  Frontend — Notes list page
AB-1012  Frontend — Note editor with TipTap + autosave
AB-1013  Frontend — Search UI with highlights
AB-1014  Frontend — Share modal + active links
AB-1015  Frontend — Version history drawer + restore

AB-1016 → Playwright E2E

AB-1017 Generate Comprehensive README for AI-Powered Notes Application