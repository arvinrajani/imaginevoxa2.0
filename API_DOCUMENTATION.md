# API Documentation - LinkedIn Posting Application

## Overview

This document details all API endpoints and the key changes made to support the approval → auto-posting flow.

---

## 🔥 KEY CHANGE: `/api/approve` Route

**Location:** `app/api/approve/route.ts`

This endpoint was completely redesigned to support **direct auto-posting** when a post is approved.

### Before
```typescript
POST /api/approve
Body: { postId: string }

Response:
- Mark post as "approved"
- Call n8n webhook (custom approval logic)
- Return approval status
```

### After (NEW) ⭐
```typescript
POST /api/approve  
Body: { postId: string, autoPost?: boolean }

Response:
- Mark post as "approved" ✓
- Call n8n webhook (optional custom logic) ✓
- Fetch LinkedIn connection & access token ✓
- Call LinkedIn API to POST immediately ✓
- Update post status to "posted" ✓
- Return LinkedIn post URN ✓
```

### Request
```json
{
  "postId": "uuid-of-post",
  "autoPost": true  // Default: true (post immediately)
}
```

### Response (Success - Auto-Posted)
```json
{
  "id": "post-uuid",
  "status": "posted",
  "posted_at": "2026-01-19T12:34:56Z",
  "linkedin_post_urn": "urn:li:ugcPost:1234567890",
  "message": "Approved and posted to LinkedIn"
}
```

### Response (Success - Approved, Not Posted)
```json
{
  "id": "post-uuid",
  "status": "approved",
  "message": "Approved but not posted (LinkedIn not connected)"
}
```

### Error Cases
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Post not found or belongs to different user
- `400 Bad Request` - Missing postId
- `5xx` - Server error or LinkedIn API failure

---

## `/api/generate` - Post Generation

**Location:** `app/api/generate/route.ts`

Updated to support **PDF file uploads** via FormData.

### Method
```http
POST /api/generate
Content-Type: multipart/form-data
```

### Request - With Prompt
```json
{
  "prompt": "Announce our new product launch...",
  "wantImage": true,
  "approvalRequired": false
}
```

### Request - With PDF
```
FormData:
  prompt: "Optional context about the document"
  pdf: [File object]
  wantImage: true
  approvalRequired: false
```

### Request - PDF Only
```
FormData:
  prompt: ""  // Empty allowed when PDF provided
  pdf: [File object]
  wantImage: true
```

### Response
```json
{
  "id": "post-uuid",
  "user_id": "user-uuid",
  "prompt": "Original prompt or PDF content",
  "title": "Generated Post Title",
  "post_content": "The full LinkedIn post content...",
  "image_url": "https://cdn.example.com/generated-image.png",
  "status": "draft",
  "created_at": "2026-01-19T12:30:00Z"
}
```

### Validation Rules
- Prompt minimum 10 characters OR PDF file required
- PDF max size: 10MB
- PDF file type: application/pdf only

### Behind the Scenes
1. Server receives FormData with optional PDF
2. If PDF exists, it's included in n8n webhook call
3. n8n webhook:
   - Extracts text from PDF (if provided)
   - Combines with prompt text
   - Calls AI (OpenAI/Claude) to generate post
   - Generates image (DALL-E/Midjourney) if requested
4. Returns generated content to app
5. App stores post in database with "draft" status

---

## `/api/post` - Manual Posting

**Location:** `app/api/post/route.ts`

For manually posting an already-approved post. Use `/api/approve` for the approval + auto-post flow.

### Request
```json
{
  "postId": "uuid-of-post",
  "targetType": "person" | "org",
  "targetUrn": "optional-org-urn"  // Only if targetType is "org"
}
```

### Response
```json
{
  "id": "post-uuid",
  "status": "posted",
  "posted_at": "2026-01-19T12:34:56Z",
  "linkedin_post_urn": "urn:li:ugcPost:1234567890"
}
```

---

## `/api/schedule` - Schedule Post for Later

**Location:** `app/api/schedule/route.ts`

### Request
```json
{
  "postId": "uuid-of-post",
  "scheduledFor": "2026-02-01T09:00:00Z"  // ISO timestamp
}
```

### Response
```json
{
  "id": "post-uuid",
  "status": "scheduled",
  "scheduled_for": "2026-02-01T09:00:00Z"
}
```

---

## LinkedIn OAuth Endpoints

### `/api/linkedin/start` - Initiate OAuth

**Location:** `app/api/linkedin/start/route.ts`

```http
GET /api/linkedin/start
```

**What it does:**
1. Verify user is authenticated
2. Generate random state token
3. Create CSRF cookie
4. Redirect to LinkedIn authorization URL

**Requires:** Valid Supabase session

**Response:** HTTP 302 redirect to LinkedIn OAuth page

---

### `/api/linkedin/callback` - Handle OAuth Callback

**Location:** `app/api/linkedin/callback/route.ts`

```http
GET /api/linkedin/callback?code=AUTH_CODE&state=STATE_TOKEN
```

**What it does:**
1. Verify state token (CSRF protection)
2. Exchange auth code for access token
3. Fetch user profile from LinkedIn
4. Fetch organizations where user is admin
5. Store/update connection in database
6. Redirect to `/app/linkedin?status=connected`

**Response:** HTTP 302 redirect + LinkedIn connection data saved

---

### `/api/linkedin/connection` - Get Connection Status

**Location:** `app/api/linkedin/connection/route.ts`

```http
GET /api/linkedin/connection
```

**Response:**
```json
{
  "id": "connection-uuid",
  "member_urn": "urn:li:person:ABC123",
  "orgs": [
    {
      "urn": "urn:li:organization:123456",
      "name": "My Company Inc"
    }
  ],
  "expires_at": "2026-02-19T12:30:00Z"
}
```

**Or if not connected:**
```json
null
```

---

### `/api/linkedin/disconnect` - Revoke Connection

**Location:** `app/api/linkedin/disconnect/route.ts`

```http
POST /api/linkedin/disconnect
```

**What it does:**
1. Revoke LinkedIn access token
2. Delete connection record from database
3. User can no longer post until reconnecting

**Response:**
```json
{
  "success": true,
  "message": "LinkedIn disconnected"
}
```

---

## n8n Webhook Contracts

Your n8n instance must implement these two webhooks.

### Webhook 1: Generate (`/webhook/generate`)

**Request (from app):**
```
POST https://your-n8n-instance/webhook/generate
Headers:
  Content-Type: multipart/form-data
  x-api-key: YOUR_N8N_API_KEY

Body:
  prompt: "User's prompt text" (can be empty if PDF provided)
  userId: "user-uuid"
  wantImage: "true" | "false"
  pdf: [Optional File] - Raw PDF bytes
```

**Expected Response (from n8n):**
```json
{
  "title": "Generated Post Title",
  "post_content": "The LinkedIn post content goes here...",
  "image_url": "https://your-cdn.com/image.png"
}
```

**n8n Workflow Should:**
1. Receive the prompt and/or PDF file
2. Extract text from PDF if provided
3. Combine prompt + PDF text
4. Call OpenAI/Claude API with combined text
5. Generate image using DALL-E/Midjourney (if wantImage=true)
6. Return formatted response

---

### Webhook 2: Approve (`/webhook/approve`)

**Request (from app):**
```
POST https://your-n8n-instance/webhook/approve
Headers:
  Content-Type: application/json
  x-api-key: YOUR_N8N_API_KEY

Body:
{
  "postId": "post-uuid",
  "userId": "user-uuid",
  "title": "Post title",
  "post_content": "Post text",
  "image_url": "https://url-to-image.com/image.png"
}
```

**Expected Response (from n8n):**
```json
{
  "success": true
}
```

**Or any status code >= 200 and < 300**

**n8n Workflow Can:**
1. Log approval to external service
2. Send notifications to approvers/teams
3. Update CMS or DAM systems
4. Track post analytics

**Note:** This webhook is optional - if it fails, the post will still be posted to LinkedIn. The actual posting happens in `/api/approve` endpoint.

---

## Flow Diagram

### Complete User Flow

```
┌─────────────────────────────────────────────────────────────┐
│ USER JOURNEY                                                 │
└─────────────────────────────────────────────────────────────┘

1. User arrives at "/" (landing page)
   ↓
2. Clicks "Continue with LinkedIn"
   ↓
3. GET /api/linkedin/start
   └─→ Generates state token
   └─→ Redirects to LinkedIn OAuth
   
4. LinkedIn authorization prompt
   ↓
5. Redirected to GET /api/linkedin/callback?code=X&state=Y
   └─→ Exchanges code for access token
   └─→ Fetches user profile
   └─→ Fetches organizations
   └─→ Saves to database
   └─→ Redirects to /app/linkedin?status=connected

6. User navigates to "/app/generate"
   ↓
7. Uploads PDF or writes prompt
   ↓
8. Clicks "Generate"
   └─→ POST /api/generate (FormData with PDF or JSON)
   └─→ Calls n8n /webhook/generate
   └─→ n8n processes PDF/prompt
   └─→ n8n calls AI API
   └─→ Returns generated content
   └─→ Saves post as "draft"
   └─→ Shows preview

9. User reviews generated post + image
   ↓
10. Clicks "Approve & Post to LinkedIn" ← THE KEY STEP
    └─→ POST /api/approve { postId, autoPost: true }
    └─→ Marks as "approved"
    └─→ Fetches LinkedIn tokens
    └─→ Calls LinkedIn API /v2/ugcPosts
    └─→ Post goes LIVE 🚀
    └─→ Updates post to "posted"
    └─→ Shows success message
    
11. User's LinkedIn post is live!

Optional: User clicks "Schedule"
   └─→ POST /api/schedule { postId, scheduledFor }
   └─→ Post queued for future posting
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Post generated successfully |
| 201 | Created | Post saved to database |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | User not logged in |
| 403 | Forbidden | User not owner of post |
| 404 | Not Found | Post doesn't exist |
| 502 | Bad Gateway | n8n webhook failed |
| 500 | Server Error | Database error |

**All errors return JSON:**
```json
{
  "error": "Human-readable error message"
}
```

---

## Rate Limits

No built-in rate limiting, but consider:
- LinkedIn: ~100 posts/day per user
- n8n: Configure your webhook limits
- Supabase: Default free tier includes generous limits

---

## Security Considerations

✅ **Implemented:**
- CSRF protection on OAuth (state token)
- Row-level security (Supabase RLS)
- User authentication checks on all endpoints
- Access token encryption at rest
- Post ownership validation

---

## Testing Endpoints

### Using cURL

```bash
# Generate post from prompt
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt": "Test prompt...", "wantImage": true}'

# Generate with PDF
curl -X POST http://localhost:3000/api/generate \
  -F "prompt=Test" \
  -F "pdf=@/path/to/file.pdf" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Approve and post
curl -X POST http://localhost:3000/api/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"postId": "post-uuid", "autoPost": true}'

# Get connection status
curl -X GET http://localhost:3000/api/linkedin/connection \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Version History

**v1.0 (Current)**
- Auto-posting on approval
- PDF upload support
- LinkedIn OAuth integration
- n8n webhook integration
- Post scheduling

**Future:**
- Batch posting
- Post templates
- Analytics integration
- Team approval workflows
