# KIDS grading runner

Generic grading code on standard GitHub-hosted runners. Only this lane is enabled.

The approved private policy bundle is AES-256-GCM encrypted in approved-policy.enc. Its decryption key, the dedicated Gemini API key and the authorized Google service account are separate GitHub Actions Secrets. No student files, feedback, plaintext rubrics or classroom configuration are committed. Logs show aggregate counts only; no workflow artifacts or student caches are uploaded.

Secrets: GEMINI_KEY_KIDS, GOOGLE_SERVICE_ACCOUNT_JSON, PRIVATE_BUNDLE_KEY. Keep GRADING_ENABLED=false until the previous writer has finished and released every queue lease. Then enable it.

Actions → Grade KIDS Pipeline → Run workflow: validate (no external calls), audit (private configuration/model/queue reads), grade (eligible ungraded submissions). Scheduled every 10 minutes; GitHub may delay schedules. One writer per lane. Queues and completed feedback stay in the existing private Sheets. Pending jobs continue on the next run. Ambiguous or uncertain paid results are held, not automatically regenerated. Existing resubmission policies, reviewed rubrics and dedicated Gemini project are preserved.

The standard public GitHub runner has free minutes; Gemini charges and job/API/concurrency limits still apply. A green run is infrastructure success: check its returned-result counter for actual grading.

Requires Node.js 24, Python 3 and ffmpeg. 

The KIDS lane also refreshes the existing combined teacher progress Sheet using private queue bindings for KIDS, IELTS and Shadowing. This single progress writer preserves all lanes in the table. A progress-refresh issue does not replay already completed grading.
