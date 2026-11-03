# Positive recruiter notifications

Open **Notifications** in the header to see positive recruiter messages from Gmail. No saved job, application record, or **Mark applied** action is required. Once connected, the inbox hides setup and account connection controls.

## Connect your Gmail account once

This local app needs its own authorization. A Gmail connection in a Codex chat cannot supply credentials to NextRole.

1. In [Google Cloud Console](https://console.cloud.google.com/), choose or create a project. Enable the **Gmail API**.
2. Configure **Google Auth Platform** branding and audience. For an external personal testing app, add your own Gmail address under test users. Under Data Access, add `https://www.googleapis.com/auth/gmail.readonly`.
3. Create an OAuth client whose application type is **Desktop app**, then download its JSON file. An API key, Gemini key, service account, or Web application client is not suitable.
4. In NextRole, open **Notifications → One-time Gmail connection setup**, select that JSON, and click **Save connection setup**. Do not paste it into chat or add it to Git.
5. Click **Connect Gmail**, then **Continue with Google**. Choose the account you applied with and grant read-only Gmail access on Google's screen. Return to NextRole. The backend must remain running during authorization.

Google may require reconnection for a testing-mode app (typically after seven days for this scope). If Google blocks authorization, check that your address is a test user, Gmail API is enabled, and the client is Desktop app. Public deployment to other users requires appropriate application authentication and Google's verification requirements for restricted Gmail scopes; this implementation is for a single-user local backend.

## What appears

The backend checks about every five minutes while running. Opening Notifications also requests a check; **Check now** refreshes manually, with a one-minute cooldown. The search looks for recruitment-related messages from the last 90 days, independently of tracked applications. Each check prioritizes the newest search results before continuing older pages. Checks process bounded batches, so a large mailbox may take several passes.

Clear recruiter outreach, requests for a resume, interview invitations, assessments, next steps, and offers can become notifications. Actual rejection decisions take precedence. Conditional boilerplate such as “if you are not selected” does not override an explicit current shortlist decision; conditional invitations alone do not count as confirmed interviews. Routine acknowledgements, job alerts, bulk lists, quoted older messages, and messages without hiring context are omitted. Forwarded content remains history even when the subject starts with Fwd; it does not generate a new recruiter notification. A qualifying new message written above the history can still be classified. Direct virtual/technical invitations and interview rescheduling are supported. Gmail Promotions categorization alone does not exclude a genuine recruiter message. This conservative English-language filter can miss genuine updates; continue checking Gmail directly. It does not verify sender authenticity. Optional existing application records can supply context but never gate a notification.

Use **Open in Gmail** to read the original message. **Mark all seen** changes the badge inside NextRole only. Setup appears before the first connection; a reconnect action appears only when Google access needs renewal. You can revoke access through [Google Account connections](https://myaccount.google.com/connections).

## Application timelines

**Applications** replaces the former Referrals section. The existing Gmail scan collects confirmed referral notices, application acknowledgements, positive next steps, interview invitations and offers into a timeline for each job. Rejections update the timeline but never produce a notification-bell alert. There is no requirement to mark a job applied first. **Check Gmail updates** requests a bounded scan with the same one-minute cooldown. The Applications view refreshes its local data about every five seconds while open and once a minute while hidden; mailbox scanning still follows the schedule above.

Messages are linked using explicit job references, company and role names, or compatible existing Gmail threads. Different job IDs and conflicting roles remain separate; a company name or sender domain alone does not establish a match. Ambiguous messages appear under **Needs job details**; **Edit job details** corrects their association context. Filter by status or search company, role and job ID. Timeline links open original messages in Gmail. A referral confirmation flags the record without replacing a later interview or offer status.

For an application currently at **Interview** or **Assessment / next step**, use **Interview preparation** on its card. The guide opens inline in Applications; there is no separate top-level preparation tab. Only matching invitation/assessment message IDs are used, never another application's invitation. The existing public company/role research, source links and general practice checklist remain available. Routine application polling does not reset an open guide; changing the job context or leaving Applications closes it.

Existing browser-saved referral contacts and manual reply updates are retained. Clicking a LinkedIn referral search does not add an application record. Previously saved uncontacted exploration entries are hidden; actual contact history is retained. Account-specific Gmail histories are isolated by a hashed account key. Switching Gmail accounts does not expose the other account’s timeline. Disconnecting removes access and notification data; historical timeline metadata remains locally in the private database until that database is removed. English-language rules can miss or misclassify notices, and recent history may need several scan passes.


## Local storage and access

- Gmail access is read-only. The code does not send, delete, label, or mark messages read in Gmail.
- Message bodies are processed locally in memory, never sent to Gemini, and not saved. Attachment downloads are not requested, and attachment parts are ignored.
- Application records, account-scoped lifecycle events and positive notification metadata (company/role/reference when established, sender, subject, date, category, referrer and Gmail message/thread IDs) persist in the private `data/recruiter-inbox.sqlite3` file, separate from public job data. This metadata database is not encrypted; protect your Windows account and disk. Gmail-derived timelines are not written to browser storage; older manual referral records remain in their existing browser storage.
- OAuth credentials and tokens persist encrypted with Windows DPAPI in `data/gmail-auth.bin`, usable only by the Windows account running the backend. There is no plaintext fallback. Both files are ignored by Git.
- The local disconnect API remains available for maintenance; it removes tokens and notifications and attempts revocation. Routine notification screens do not show a disconnect control. You can revoke access in Google Account connections. Deleting the private data files while the backend is stopped removes local history too.

References: [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
