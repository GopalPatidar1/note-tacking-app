# Note Taking Application

## Functional Requirement Specification (FRS)

### Version

1.0

### Project

Note Taking Application

### Objective

Develop a secure note-taking platform that allows authenticated users to create, organize, search, share, and manage notes with version history.

---

# 1. Functional Requirements

## FR-1 User Authentication

### FR-1.1 Registration

Users shall be able to register using:

* Name
* Email
* Password

Acceptance Criteria:

* Email must be unique.
* Password must be hashed before storage.
* Successful registration returns JWT tokens.

---

### FR-1.2 Login

Users shall be able to log in using:

* Email
* Password

Acceptance Criteria:

* Valid credentials generate:

  * Access Token (15 minutes)
  * Refresh Token (7 days)
* Invalid credentials return 401.

---

### FR-1.3 Logout

Users shall be able to logout.

Acceptance Criteria:

* Refresh token removed from database.
* Access token becomes unusable after expiration.

---

### FR-1.4 Forgot Password

Users shall request password reset.

Acceptance Criteria:

* OTP generated.
* OTP logged to console.
* OTP expires after 10 minutes.

---

### FR-1.5 Reset Password

Users shall reset password using:

* Email
* OTP
* New Password

Acceptance Criteria:

* OTP validation required.
* Password updated successfully.

---

# FR-2 Notes Management

### FR-2.1 Create Note

Users shall create notes with:

* Title
* Content
* Tags

Acceptance Criteria:

* Note saved successfully.
* Initial version snapshot created.

---

### FR-2.2 View Notes

Users shall view notes.

Features:

* Pagination
* Sorting
* Filtering

---

### FR-2.3 Update Note

Users shall edit notes.

Acceptance Criteria:

* New version snapshot created.
* Latest content returned.

---

### FR-2.4 Soft Delete Note

Users shall delete notes.

Acceptance Criteria:

* deletedAt timestamp populated.
* Record retained for 30 days.

---

# FR-3 Tags

### FR-3.1 Create Tag

Users shall create personal tags.

Attributes:

* Name
* Color

---

### FR-3.2 Update Tag

Users shall modify tag information.

---

### FR-3.3 Delete Tag

Users shall remove tags.

---

### FR-3.4 Tag Counts

System shall display:

* Total notes per tag.

---

# FR-4 Search

Users shall search notes.

Acceptance Criteria:

* PostgreSQL Full Text Search used.
* Search supports pagination.
* Search highlights matching keywords.

---

# FR-5 Sharing

Users shall share notes using public links.

### Generate Link

Users can:

* Generate link
* Set expiry date

---

### Revoke Link

Users can revoke active links.

---

### Public Access

Anonymous users can:

* Read note content

Anonymous users cannot:

* Edit
* Delete
* Create versions

---

### View Count

System shall:

* Track view count atomically.

---

# FR-6 Version History

### Snapshot Creation

System shall create snapshot:

* Every note save

---

### Version List

Users shall view:

* All versions

---

### Version View

Users shall inspect:

* Historical versions

---

### Restore Version

Users shall restore historical versions.

Acceptance Criteria:

* Restore creates a new version.
* Original versions remain unchanged.

---

### Auto Purge

System shall purge versions according to retention policy.

---

# Non Functional Requirements

## Security

* JWT Authentication
* Password Hashing (bcrypt)
* Refresh Token Rotation
* Rate Limiting
* Input Validation

## Performance

* Search response < 500ms
* CRUD response < 300ms
* Pagination supported

## Reliability

* Soft Delete Recovery Window = 30 days
* Transactional operations where required

## Testing

* Unit Tests
* Integration Tests
* E2E Tests
* Coverage >= 80%

---

# Out of Scope

* Real-time collaboration
* File uploads
* Mobile application
* OAuth login
* Nested folders
* Email delivery service
