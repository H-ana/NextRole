# Autofill saved documents (v1.4.0)

Website text and reviewed profile use origin-scoped localStorage; PDF/DOCX files use IndexedDB. Extension documents use chrome.storage.local restricted to TRUSTED_CONTEXTS, not sync storage. No application-level at-rest encryption is claimed.

The setup page reuses a retained file only when its source hash matches the current resume text. Successful writes show file name and time; failures must not claim persistence. Older records without timestamps are supported without inventing save times.

Save to extension still requires review and extension confirmation. PING in v1.4.0 returns document presence, filename, last modification time and a SHA-256 fingerprint over the canonical sanitized profile plus file digest. It returns no profile fields or document bytes. Profile edits and same-name file replacements can be compared without reading the extension documents back. Older v1.3.0 reports connection only: the website explicitly says it cannot verify saved documents.

Removal requests use the same origin, top-frame, tab, TTL and own-confirmation checks as saving. Cancellation preserves both copies. Remove both deletes the website copy only after the extension confirms removal. Website-only removal leaves the extension copy intact; downloaded backups and employer copies are outside this scope.

Release: upload extension-release/NextRole-Edge-Addons.zip as the v1.4.0 update for the existing Edge listing. Public installation remains v1.3.0 until Microsoft approves that submission. The website is compatible with both versions. No permissions were added.

## Restore to the extension
Portable restore now offers restoring both copies (selected by default), using the existing v1.3.0+ PREPARE/STATUS handoff and extension confirmation. No extension upgrade or additional permission is needed for this restore feature. The backup must include resume text, its PDF/DOCX file, confirmed experience preferences and a reviewed profile whose revision matches those sources. Missing or stale review is never fabricated. Website restoration is committed first; extension cancellation/failure leaves that website restoration intact and enables Retry extension restore. Successful confirmation updates the website save receipt.
