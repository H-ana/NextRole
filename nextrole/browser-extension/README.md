# NextRole Application Autofill for Microsoft Edge

## Public users

Install the extension from Microsoft Edge Add-ons once the owner has published it. The NextRole setup page displays the real store link when configured; until then, it clearly says public installation is pending. No store listing URL is invented.

1. Open NextRole in the same Edge browser. Upload your original resume and choose **Application autofill**.
2. Review contact details, employment and education history, dates and preferences. The uploaded PDF/DOCX is retained locally for attachment; older visits or pasted text may need a one-time file selection.
3. Check the review box and choose **Save to extension**. Confirm the exact source website and resume filename in the extension-owned window, then **Save profile and resume**. No JSON file needs to be downloaded or imported.
4. Open an application, invoke the extension, scan and review the proposed fields, then fill only selected entries. Complete remaining questions and submit yourself.

Both saved documents remain in local extension storage until independently replaced or removed. Website storage is separate. Saving a new pair requires confirmation and updates both together. Cancel/close keeps the previous documents. A changed saved document invalidates earlier previews. Backup JSON import and individual file replacement remain under **Saved documents and backup import** for migration/recovery.

## Scope and privacy

The parser uses clear resume facts, preserves source order and does not invent dates, qualifications or skill-specific experience. Identified employment/education groups map to reviewed entries. Supported associated comboboxes require a unique matching option and a verified selected value. Current-role checkboxes are supported only within employment groups; declarations and consent remain manual. Existing answers are preserved. New employer-specific or sensitive questions and unfamiliar controls may still need manual completion. No Next/Submit buttons are clicked or CAPTCHA/login bypassed; sites may autosave filled values.

The package has `activeTab`, `scripting` and `storage`. The production content-script bridge matches only the exact public NextRole origin; it does not read the DOM or stored documents. Top-frame status, origin and sender tab are checked by the worker. The website can discover the extension, stage a user-requested setup transfer and check its status. It cannot read the saved documents or approve replacement itself. The extension's own confirmation window must approve before local storage changes. There are no all-site background permissions, analytics, network clients, Gmail access, API keys or remotely executed code.

Pending transfer documents use trusted-context session storage and a ten-minute confirmation expiry; closing/cancelling clears the pending copy. Saved documents use trusted-context local storage, not cloud sync. This is not a claim of application-level encryption. Profile size is limited to 256 KB and PDF/DOCX resume size to 5 MB. Remove each copy in the extension and clear website data separately if desired. See the [public privacy notice](https://nextrole-job-match.blueowl129.chatgpt.site/autofill-privacy.html).

## Development and release

For local development, load `nextrole/browser-extension` through `edge://extensions` → Developer mode → Load unpacked. Reload an existing unpacked installation after code changes. This is not the public installation flow.

`python build_autofill_extension.py` builds:

- `dist/nextrole-autofill-edge.zip`: development package with the exact production origin plus localhost bridge support (code restricts local access to port 8080).
- `extension-release/NextRole-Edge-Addons.zip`: store package with only the exact production origin; no localhost matches/configuration.

Both include a fixed allowlist of code/icon files only. Shared parser/schema files and public configuration are copied into the package. Configuration lives in `dist/extension-settings.json`; the builder stamps a config-content hash into the web client's import for cache updates. The bridge discovers the installed extension automatically, with no extension ID setting for users.

Submission copy, logo, permission/data disclosures, reviewer notes and activation steps are in [extension-publishing/SUBMISSION.md](../extension-publishing/SUBMISSION.md). The owner must register/sign in, review Microsoft's agreements/privacy certifications and submit through Partner Center. After approval, set the assigned listing with `python configure_extension_store.py --store-url "THE_REAL_LISTING_URL"`, rebuild and deploy the updated website configuration. The normal install button will then appear.

Checks: `node test-autofill.mjs`, `node test-autofill-live.mjs`, `node test-extension-transfer.mjs`, `python -m unittest test_autofill_package`.


## Saved status and removal (v1.4.0)
The NextRole setup page can show whether the saved extension profile and resume match your current reviewed details. It receives only presence, filename, timestamp and a content fingerprint; it cannot read the saved documents back. Changed content requires Save to extension and confirmation again. The popup also shows the last save time.

Manage saved details on NextRole offers website-only removal, extension-only removal and removal of both. Requests affecting the extension must be confirmed in its own window. No new permissions are required. A website update cannot upgrade a store-installed extension: the v1.4.0 ZIP must be submitted as an update to the existing Edge Add-ons listing and approved by Microsoft.
