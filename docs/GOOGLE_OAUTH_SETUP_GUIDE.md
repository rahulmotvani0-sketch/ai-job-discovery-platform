# Step-by-Step Google Cloud OAuth 2.0 Setup Guide
**For Personal AI Job Search & Application Workstation**

This guide provides instructions to connect your personal Google accounts (`motvanirahul98@gmail.com` and recruitment inboxes) directly to your job platform for:
1. **Gmail API**: Creating application drafts and sending user-approved applications.
2. **Google Drive API**: Backing up and storing tailored markdown/PDF resumes.
3. **Google Sheets API**: Live synchronization of applications to a spreadsheet tracker.

> [!IMPORTANT]
> **Zero Third-Party Intermediaries**: Your tokens are stored strictly on your local machine (`data/job_platform.db` and `data/google_tokens.json`). No SaaS intermediaries (like Composio) touch your credentials or emails.

---

## Step 1: Create a Google Cloud Project (2 minutes)

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **"New Project"**.
3. Name it: `AI-Job-Workstation` (or any name you prefer) and click **Create**.
4. Make sure your new project is selected in the top bar.

---

## Step 2: Enable Required Google APIs

1. Go to **APIs & Services** &rarr; **Library** (or search in the search bar):
2. Search and click **Enable** for each of the following 3 APIs:
   - **Gmail API**
   - **Google Drive API**
   - **Google Sheets API**

---

## Step 3: Configure the OAuth Consent Screen

1. In the left navigation, click **APIs & Services** &rarr; **OAuth consent screen**.
2. Select User Type: **External** (standard for personal `@gmail.com` accounts) and click **Create**.
3. Fill in the App Information:
   - **App name**: `AI Job Workstation`
   - **User support email**: `motvanirahul98@gmail.com`
   - **Developer contact information**: `motvanirahul98@gmail.com`
   - Click **Save and Continue**.
4. In the **Scopes** step:
   - Click **Add or Remove Scopes**.
   - Select or paste the following scopes:
     - `https://www.googleapis.com/auth/gmail.compose`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Click **Update** and **Save and Continue**.
5. In the **Test Users** step (**Critical!**):
   - Click **+ ADD USERS**.
   - Add: `motvanirahul98@gmail.com` (and any secondary gmail address you plan to connect).
   - Click **Save and Continue**.

---

## Step 4: Create OAuth 2.0 Credentials

1. In the left navigation, click **APIs & Services** &rarr; **Credentials**.
2. Click **+ CREATE CREDENTIALS** at the top &rarr; select **OAuth client ID**.
3. In Application type, choose **Web application**.
4. Name: `Job Platform Web Client`.
5. Under **Authorized redirect URIs**, click **+ ADD URI** and add:
   ```text
   http://localhost:3300/oauth2callback
   ```
6. Click **Create**.
7. Google will show you:
   - **Your Client ID** (e.g., `1234567890-abcdefgh.apps.googleusercontent.com`)
   - **Your Client Secret** (e.g., `GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx`)

---

## Step 5: Add Credentials to Your Platform

Open `/home/rahul/PROJECT'S/JOB/.env` in your editor and update lines 30-33:

```env
# Google Cloud OAuth 2.0 (Gmail / Drive / Sheets)
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3300/oauth2callback
GOOGLE_TOKEN_PATH=./data/google_tokens.json
```

Or paste them directly into the platform UI at [http://localhost:3300](http://localhost:3300) under **Connected Accounts &rarr; Connect Google Account**.

---

## Step 6: One-Click Account Authentication

1. Open [http://localhost:3300](http://localhost:3300).
2. Go to the **Connected Accounts** tab.
3. Click **"Sign in with Google (OAuth)"**.
4. Choose your Google account (`motvanirahul98@gmail.com`).
5. Click **Continue** (if Google shows an unverified app screen, click *Advanced &rarr; Go to AI Job Workstation (unsafe)* since it is your own self-hosted personal app).
6. Google will redirect back to `http://localhost:3300/?auth=success`.
7. Your account is now connected and verified for live Gmail sending and Drive/Sheets sync!
