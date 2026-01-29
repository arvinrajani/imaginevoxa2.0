# 🔧 Troubleshooting Guide

## Common Issues & Solutions

### 1. Login Issues

#### "LinkedIn login failed" or redirect loop

**Problem:** User can't login with LinkedIn

**Solutions:**
1. **Check Supabase Configuration**
   ```
   Supabase → Authentication → Providers
   - Enable "LinkedIn (OIDC)" if not enabled
   - Verify Client ID matches LinkedIn app
   - Verify Client Secret matches LinkedIn app
   ```

2. **Check Redirect URLs in Supabase**
   ```
   Supabase → Authentication → URL Configuration
   - Add: http://localhost:3000/app (dev)
   - Add: http://localhost:3000/login
   - Add: http://localhost:3000/api/linkedin/callback
   ```

3. **Check LinkedIn Developer App**
   ```
   LinkedIn App Settings → Authorized Redirect URLs
   - Add: http://localhost:3000/api/linkedin/callback (dev)
   - Add: https://yourdomain.com/api/linkedin/callback (prod)
   ```

4. **Clear Cookies**
   - Clear all cookies for localhost:3000
   - Try login again

5. **Check Environment Variables**
   ```bash
   # Should be populated in .env.local
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

---

### 2. LinkedIn Connection Issues

#### "LinkedIn is not configured"

**Problem:** User sees "LinkedIn is not configured" message

**Solutions:**
1. **Check Environment Variables**
   ```bash
   # All three must be set in .env.local
   LINKEDIN_CLIENT_ID=your_id
   LINKEDIN_CLIENT_SECRET=your_secret
   LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
   ```

2. **Restart Development Server**
   ```bash
   # Stop npm run dev (Ctrl+C)
   npm run dev
   ```

3. **Verify LinkedIn App**
   - Check app is in "Live" status, not "Sandbox"
   - Check app is "Public" or added as authorized user
   - Generate new Client ID/Secret if very old

#### "LinkedIn connected but no organizations showing"

**Problem:** User connected but can't post to organizations

**Solutions:**
1. **User Must Be Admin**
   - User must be administrator on the LinkedIn organization page
   - Member role won't work

2. **Organization Not In LinkedIn Account**
   - Add the organization to LinkedIn account
   - Reconnect LinkedIn in app

3. **Refresh Connection**
   - Go to `/app/linkedin`
   - Click "Reconnect LinkedIn"
   - Authorize again

---

### 3. Post Generation Issues

#### "Generation failed" or n8n webhook error

**Problem:** Clicking "Generate" fails

**Solutions:**
1. **Check n8n Configuration**
   ```bash
   # Verify in .env.local
   N8N_GENERATE_WEBHOOK_URL=https://your-n8n-instance/webhook/generate
   N8N_X_API_KEY=your_api_key
   ```

2. **Test n8n Webhook**
   ```bash
   curl -X POST https://your-n8n-instance/webhook/generate \
     -H "Content-Type: application/json" \
     -H "x-api-key: your_api_key" \
     -d '{"prompt": "Test", "userId": "test", "wantImage": true}'
   ```

3. **Verify n8n Instance**
   - Is n8n running? `curl https://your-n8n-instance/health`
   - Is webhook URL correct?
   - Is webhook listening on correct port?

4. **Check n8n Logs**
   - Go to n8n instance
   - Check webhook execution logs
   - Look for error messages

5. **Test with Minimal Workflow**
   - Create simple test workflow in n8n
   - Return hardcoded response
   - Test app with this workflow

#### "Prompt is too short"

**Problem:** Error when trying to generate

**Solutions:**
1. **Add More Detail**
   - Minimum 10 characters required
   - Example: "Announce the new product launch to our followers"

2. **Or Upload PDF**
   - Use PDF instead of writing prompt
   - PDF doesn't have length requirement

#### "PDF not uploading" or "PDF too large"

**Problem:** Can't upload PDF file

**Solutions:**
1. **File Size**
   - Maximum size: 10MB
   - Check file size: `ls -lh file.pdf`
   - If too large, extract pages or compress

2. **File Format**
   - Must be .pdf file
   - Not .png, .doc, .txt, etc.
   - Try opening in Adobe Reader to verify

3. **Browser Limits**
   - Clear browser cache: `Ctrl+Shift+Delete`
   - Try different browser
   - Try incognito/private mode

4. **Network Issues**
   - Check internet connection
   - Check no proxy/firewall blocking
   - Try from different network

---

### 4. Posting Issues

#### "LinkedIn post failed" or post doesn't appear

**Problem:** Clicked "Approve & Post to LinkedIn" but post didn't appear

**Solutions:**
1. **Check LinkedIn Token**
   - Go to `/app/linkedin`
   - Check "Connected" status
   - If expired (> 60 days), reconnect

2. **Verify Scopes**
   - LinkedIn app must have `w_member_social` scope
   - Request scope if not approved
   - LinkedIn may have blocked scope, check app status

3. **Check Post Status**
   ```bash
   # In browser DevTools → Network tab
   # Look at POST /api/approve response
   # Check if status changed to "posted"
   ```

4. **Check LinkedIn API Status**
   - Is LinkedIn API up? https://developer.linkedin.com/support/faq
   - Check rate limits not exceeded
   - Check for LinkedIn maintenance

5. **Check Post Content**
   - Is post content valid?
   - Too long? (LinkedIn has character limits)
   - Contains blocked words?
   - Contains links? (LinkedIn restricts some link types)

#### "LinkedIn API rate limited"

**Problem:** Getting 429 Too Many Requests

**Solutions:**
1. **Wait**
   - LinkedIn rate limit resets daily
   - Try again after a few hours

2. **Check Limit**
   - ~100 posts per day per account
   - Check how many posted today
   - Space out posts throughout day

3. **Implement Backoff**
   - In n8n workflow, add delay between posts
   - Stagger posting times

---

### 5. Database Issues

#### Posts not saving

**Problem:** Generated post doesn't appear in database

**Solutions:**
1. **Check Supabase Connection**
   ```bash
   # In .env.local
   NEXT_PUBLIC_SUPABASE_URL=correct_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=correct_key
   ```

2. **Check RLS Policies**
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM posts LIMIT 1;
   
   -- Should show posts for current user
   ```

3. **Check User Authentication**
   - User must be logged in
   - Check `supabase.auth.getSession()` returns session

4. **Check Table Exists**
   - Run `supabase/schema.sql` if not done
   - Verify `posts` table exists in Supabase

---

### 6. Image Generation Issues

#### "Image not generated" or image_url is null

**Problem:** Post generated but no image

**Solutions:**
1. **Check "Include image" Setting**
   - In form, verify "Yes, generate image" selected
   - Not "Text only"

2. **Check n8n Workflow**
   - Verify image generation step in n8n
   - Check DALL-E/image API credentials
   - Check response includes `image_url`

3. **Check Image Service**
   - If using DALL-E: OpenAI quota sufficient?
   - If using Midjourney: Credits available?
   - Check API keys are valid

4. **Increase Timeout**
   - Image generation takes ~30-60 seconds
   - Increase webhook timeout in n8n if too low

---

### 7. Performance Issues

#### App runs slow or times out

**Solutions:**
1. **Check Database Performance**
   - Are there indexes on frequently queried columns?
   - Check slow query logs in Supabase

2. **Check n8n Performance**
   - Is n8n workflow optimized?
   - Check n8n resource usage
   - Increase n8n memory/CPU if needed

3. **Check Network**
   - Is internet connection stable?
   - Are you on VPN or corporate proxy?
   - Try from different network

4. **Increase Timeouts**
   - In Next.js: `const response = await Promise.race([...])`
   - In n8n: Set workflow timeout higher

---

### 8. Environment Variable Issues

#### "Variable not found" or undefined errors

**Solutions:**
1. **Check .env.local File**
   ```bash
   # File must exist in project root
   ls -la .env.local
   
   # Should show all variables populated
   cat .env.local
   ```

2. **Restart Dev Server**
   ```bash
   # Variables only loaded on startup
   Ctrl+C  # Stop npm run dev
   npm run dev  # Start again
   ```

3. **Check Variable Names**
   - Variable names are case-sensitive
   - Use exact names from .env.local.example
   - Example: `LINKEDIN_CLIENT_ID` not `linkedin_client_id`

4. **Check for Spaces**
   ```bash
   # ❌ Wrong: Has spaces
   LINKEDIN_CLIENT_ID = abc123
   
   # ✅ Correct: No spaces
   LINKEDIN_CLIENT_ID=abc123
   ```

5. **Check Build Environment**
   - Variables starting with `NEXT_PUBLIC_` visible in browser
   - Other variables only available on server
   - Don't expose secrets in client code

---

### 9. CORS Issues

#### "CORS error" in browser console

**Problem:** API calls blocked by CORS

**Solutions:**
1. **Verify API Endpoint**
   - All endpoints should be same domain
   - `/api/generate`, `/api/approve`, etc.
   - No CORS needed for same-domain requests

2. **Check n8n CORS**
   - If n8n on different domain, configure CORS
   - n8n Settings → CORS
   - Allow origin: `http://localhost:3000` (dev)

3. **Check Request Headers**
   - Should not have custom headers causing CORS preflight
   - Use standard headers when possible

---

### 10. Browser-Specific Issues

#### Issues only in specific browser

**Solutions:**
1. **Clear Cache**
   - Ctrl+Shift+Delete (Windows)
   - Cmd+Shift+Delete (Mac)
   - Clear all cache

2. **Try Incognito Mode**
   - Rules out extensions interfering
   - Rules out cached cookies

3. **Try Different Browser**
   - Chrome/Edge: Chromium-based
   - Firefox: Gecko engine
   - Safari: WebKit engine
   - Helps identify browser-specific issues

---

## Debugging Steps

### Enable Debug Logging

1. **Frontend Console**
   ```javascript
   // Browser DevTools → Console
   // Look for errors, warnings, or messages
   console.log('User data:', user);
   ```

2. **Network Tab**
   ```
   Browser DevTools → Network
   - Check all API requests
   - Look for 4xx/5xx errors
   - Check response body for errors
   ```

3. **Application Tab**
   ```
   Browser DevTools → Application
   - Check localStorage for Supabase session
   - Check cookies for auth tokens
   - Check IndexedDB for data
   ```

4. **Server Logs**
   ```bash
   # Terminal where npm run dev is running
   # Look for error stack traces
   # Check timestamps of requests
   ```

5. **Database Logs**
   ```
   Supabase → SQL Editor
   SELECT * FROM posts WHERE user_id = 'xxx';
   - Check if data is actually being stored
   ```

---

## Getting Help

### Information to Provide

When reporting issues, include:
1. Exact error message
2. Steps to reproduce
3. Browser & version
4. OS (Windows/Mac/Linux)
5. Screenshots if applicable
6. Console errors (DevTools)
7. Network requests (DevTools → Network)
8. Environment setup verification

### Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [LinkedIn API Docs](https://learn.microsoft.com/en-us/linkedin/marketing/apis)
- [n8n Docs](https://docs.n8n.io/)

---

## Status Page

Check these services if having issues:

- [LinkedIn Status](https://www.linkedin.com/help/linkedin)
- [Supabase Status](https://status.supabase.com/)
- [OpenAI Status](https://status.openai.com/) (if using for AI)

---

**Still stuck? Check the logs and error messages carefully - they usually tell you exactly what's wrong! 🔍**
