# Product Requirements Document (PRD)

# Enterprise File Storage API

**Version:** 1.0

**Status:** Draft

**Project Duration:** 4–6 weeks

**Difficulty:** Intermediate → Advanced

**Primary Goal**

Build a production-ready backend service that enables organizations to securely store, organize, version, search, and manage files. The project should demonstrate modern backend engineering practices, cloud storage integration, authentication, authorization, database design, and production deployment.

---

# 1. Problem Statement

Companies often need a centralized system for managing documents across teams.

The system should support:

- Multiple organizations
- Multiple users
- Permission-based access
- File version history
- Secure cloud storage
- Audit logging
- Search
- High performance APIs

This project mimics the backend of products like:

- Google Drive
- Dropbox Business
- Box
- Notion attachments

---

# 2. Objectives

The project should demonstrate proficiency in:

- FastAPI
- PostgreSQL
- SQLAlchemy
- Docker
- Redis
- AWS S3
- Authentication
- RBAC
- Layered Architecture
- CI/CD
- Production Deployment

---

# 3. Users

## Admin

Can

- Create organization
- Invite users
- Manage roles
- View audit logs
- Delete projects

---

## Member

Can

- Upload files
- Download files
- Create folders
- Search
- View versions

Cannot

- Manage users
- Delete organization

---

## Read Only User

Can

- Browse folders
- Download files

Cannot

- Upload
- Delete
- Modify

---

# 4. Functional Requirements

## Authentication

### User Registration

- Email
- Password
- Name

Validation

- Unique email
- Strong password

---

### Login

Returns

```
Access Token (JWT)
Refresh Token
```

---

### Logout

Invalidate refresh token

---

### Password Reset

- Request reset
- Reset token
- New password

---

## Organizations

Users belong to organizations.

Organization contains

```
- Users
- Projects
- Storage Usage
- Settings
```

---

## Projects

Each organization contains projects.

Example

```
Organization
    ↓
 Project A
    ↓
 Folders
    ↓
  Files
```

---

## Folder Management

Operations

- Create
- Rename
- Move
- Delete
- Restore

Support nested folders.

---

## File Upload

Upload

- Images
- PDFs
- Videos
- ZIP
- Documents

Store

```
Metadata
   ↓
Database

Actual File
  ↓
  S3
```

Metadata includes

- filename
- mime type
- size
- uploader
- upload date
- checksum
- storage path

---

## File Versioning

Every upload of an existing file creates

```
Version 1
   ↓
Version 2
   ↓
Version 3
```

Users can

- View versions
- Download old versions
- Restore previous version

---

## Soft Delete

Deleting a file should

NOT remove it immediately.

Instead

```
deleted_at

deleted_by
```

Files remain recoverable for 30 days.

---

## Audit Logs

Track every important action.

Examples

```
LOGIN

UPLOAD

DOWNLOAD

DELETE

RESTORE

CREATE_FOLDER

MOVE_FILE

UPDATE_ROLE
```

Each log contains

```
User

Action

Timestamp

IP

Metadata
```

---

## Search

Search by

- filename
- tags
- uploader
- extension

Stretch Goal

PostgreSQL Full Text Search

---

## Pagination

All list endpoints support

```
page

page_size

sort

order
```

---

## Filtering

Examples

```
uploaded_after

uploaded_before

file_type

size

owner

folder
```

---

## Rate Limiting

Protect

```
Login

Upload

Search
```

Example

```
10 uploads/minute

50 searches/minute
```

---

## API Documentation

Swagger

Should include

- JWT Authentication
- Example requests
- Example responses
- Error schemas

---

# 5. Non Functional Requirements

### Performance

Upload API

< 500ms (excluding S3 transfer)

---

Download Metadata

< 100ms

---

Search

< 300ms

---

### Security

JWT Authentication

RBAC

Password hashing

HTTPS ready

Input validation

SQL Injection protection

XSS-safe responses

CORS configuration

Secure headers

---

### Reliability

Health endpoint

```
/health
```

Returns

```
Database
Redis
S3
Application
```

---

# 6. System Architecture

```
                Client
                   │
            REST API (HTTPS)
                   │
               FastAPI Router
                   │
          Authentication Middleware
                   │
            Dependency Injection
                   │
             Service Layer
                   │
           Repository Layer
        ┌──────────┼──────────┐
        │          │          │
   PostgreSQL    Redis        S3
```

---

# 7. Database Design

## User

```
id
organization_id
name
email
password_hash
role
created_at
updated_at
```

---

## Organization

```
id
name
slug
storage_limit
created_at
```

---

## Project

```
id
organization_id
name
description
```

---

## Folder

```
id
project_id
parent_folder_id
name
path
```

---

## File

```
id
folder_id
current_version
filename
extension
mime_type
size
checksum
storage_key
deleted_at
```

---

## FileVersion

```
id
file_id
version
storage_key
size
checksum
uploaded_by
```

---

## AuditLog

```
id
organization_id
user_id
action
entity
entity_id
ip_address
metadata (JSONB)
timestamp
```

---

## RefreshToken

```
id
user_id
token
expires_at
revoked
```

---

# 8. API Endpoints

## Auth

```
POST /auth/register

POST /auth/login

POST /auth/refresh

POST /auth/logout

POST /auth/reset-password
```

---

## Organizations

```
GET /organizations

POST /organizations

PATCH /organizations/{id}
```

---

## Users

```
GET /users

POST /users

PATCH /users/{id}

DELETE /users/{id}
```

---

## Projects

```
GET /projects

POST /projects

PATCH /projects/{id}

DELETE /projects/{id}
```

---

## Folders

```
POST /folders

GET /folders/{id}

PATCH /folders/{id}

DELETE /folders/{id}
```

---

## Files

```
POST /files/upload

GET /files/{id}

GET /files

DELETE /files/{id}

POST /files/{id}/restore
```

---

## File Versions

```
GET /files/{id}/versions

POST /files/{id}/restore-version/{version}
```

---

## Search

```
GET /search/files
```

---

## Audit

```
GET /audit-logs
```

---

# 9. Technology Stack


| Layer            | Technology           |
| ---------------- | -------------------- |
| API              | FastAPI              |
| ASGI Server      | Uvicorn              |
| ORM              | SQLAlchemy 2.0       |
| Database         | PostgreSQL           |
| Cache            | Redis                |
| Storage          | AWS S3               |
| Auth             | JWT                  |
| Migrations       | Alembic              |
| Validation       | Pydantic v2          |
| Containerization | Docker               |
| Reverse Proxy    | Nginx                |
| CI/CD            | GitHub Actions       |
| Testing          | Pytest               |
| Deployment       | EC2 + Docker Compose |
| Monitoring       | CloudWatch           |


---

# 10. Project Structure

```text
app/
├── api/
│   ├── v1/
│   ├── dependencies/
│   └── routers/
├── core/
├── config/
├── models/
├── schemas/
├── repositories/
├── services/
├── security/
├── middleware/
├── db/
├── storage/
├── cache/
├── audit/
├── utils/
├── tests/
└── main.py
```

---

# 11. Development Milestones

### Milestone 1 – Project Foundation

- FastAPI project setup
- Configuration management
- Docker & Docker Compose
- PostgreSQL
- Redis
- SQLAlchemy
- Alembic
- Health checks

### Milestone 2 – Authentication & Authorization

- JWT authentication
- Refresh tokens
- Password hashing
- RBAC
- Protected endpoints

### Milestone 3 – Core Domain

- Organizations
- Projects
- Folders
- CRUD APIs
- Soft delete

### Milestone 4 – File Storage

- S3 integration
- Presigned upload URLs
- Download API
- Metadata persistence
- File versioning

### Milestone 5 – Search & Performance

- Pagination
- Filtering
- Full-text search
- Redis caching
- Rate limiting

### Milestone 6 – Observability

- Audit logging
- Structured logging
- Exception handling
- Request ID middleware
- Metrics endpoint

### Milestone 7 – Testing

- Unit tests
- Integration tests
- API tests
- Test coverage >80%

### Milestone 8 – Production Deployment

- Nginx
- Docker Compose
- GitHub Actions
- EC2 deployment
- RDS PostgreSQL
- S3
- CloudWatch logs

---

# 12. Success Criteria

The project is considered complete when:

- 70+ REST endpoints are implemented and documented.
- Authentication, RBAC, and organization isolation are fully enforced.
- Files are stored in S3 with metadata in PostgreSQL.
- Version history and soft deletion work correctly.
- Search, pagination, and filtering perform efficiently.
- Audit logs capture all significant actions.
- The full stack runs locally with Docker Compose.
- CI runs linting, tests, and builds automatically.
- The application is deployed to AWS with GitHub Actions, Nginx, EC2, RDS, S3, Redis, and CloudWatch.
- A comprehensive README includes architecture diagrams, setup instructions, API documentation, and deployment steps.

## Scope Control

Avoid feature creep in v1. The following are **out of scope** and better suited for a future iteration:

- Real-time collaborative editing
- File sharing via public links
- Antivirus scanning
- Image/video thumbnail generation
- Multi-region replication
- End-to-end encryption
- Billing and subscription management
- Mobile-specific APIs

Keeping v1 focused ensures you complete a production-quality backend while covering the core concepts in your Phase 2 roadmap.