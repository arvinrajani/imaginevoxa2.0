# ⚠️ n8n Configuration Required

## Issue
When you try to generate a post, n8n is trying to query Supabase but the connection isn't configured properly. The error shows:
```
Invalid URL: <__PLACEHOLDER_VALUE__Supabase_Project_URL__>/rest/v1/drafts...
```

This means the n8n Supabase connection is using a placeholder instead of your actual Supabase URL.

---

## Solution: Configure n8n Supabase Connection

### Step 1: Go to n8n
Visit: https://arvinssssss.app.n8n.cloud

### Step 2: Set Up Supabase Credentials
1. Click **Credentials** (left sidebar)
2. Click **New** → **Supabase**
3. Fill in these values from your `.env.local`:
   ```
   Host/URL: https://xtgwntfwaijeaxkrmmor.supabase.co
   API Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z3dudGZ3YWlqZWF4a3JtbW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NjQ1MDIsImV4cCI6MjA4NDE0MDUwMn0.INcS1kB9FWgntR5PKOnnWc3NavPorLfiAUtDRYZjHU8
   ```
4. Click **Save**

### Step 3: Update n8n Workflows
1. Open your **Generate** workflow
2. Find any Supabase nodes (Query, Insert, Update, Delete)
3. For each node, click the **Credentials** dropdown
4. Select the newly created Supabase credentials
5. If there's a "drafts" reference, change it to "posts"

### Step 4: Test
1. Go back to http://localhost:3000
2. Try generating a post again
3. It should work now!

---

## What n8n Does

Your n8n workflows handle:
1. **Generate**: Takes prompt + PDF → Calls AI → Returns post content + image URL
2. **Approve**: (Optional) Custom approval workflow

The app calls n8n webhooks at:
- `https://arvinssssss.app.n8n.cloud/webhook-test/webhook-test/generate`
- `https://arvinssssss.app.n8n.cloud/webhook-test/webhook-test/approve`

---

## Quick Checklist

- [ ] n8n Supabase credentials created
- [ ] All n8n nodes using correct credentials
- [ ] No "drafts" table references (should be "posts")
- [ ] Webhook URLs match above
- [ ] n8n workflows have "Execute" button clicked (if needed)

If you need help configuring n8n, let me know and I can guide you through it step by step!
