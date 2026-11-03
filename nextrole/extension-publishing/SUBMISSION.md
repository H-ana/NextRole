# Microsoft Edge Add-ons submission: NextRole Application Autofill

Package: `../extension-release/NextRole-Edge-Addons.zip`
Logo: `store-logo.png` (300 x 300 PNG)
Version: 1.3.0
Website: https://nextrole-job-match.blueowl129.chatgpt.site/
Privacy: https://nextrole-job-match.blueowl129.chatgpt.site/autofill-privacy.html
Support: https://github.com/H-ana/NextRole/issues

## Description

NextRole Application Autofill helps you fill supported job-application fields using facts you have reviewed.

Upload your resume in NextRole, review the extracted contact details, employment history, education and dates, and choose Save to extension. Confirm the source and document in the extension window. Your profile and resume stay locally in your Edge profile until you replace or remove them; there is no recurring JSON export or import in normal setup.

On an application page, open the extension, scan the page and review the proposed entries. Choose which supported empty fields and resume upload to fill. Existing answers are preserved. Greenhouse employment groups and supported associated comboboxes can use your reviewed history. Missing dates or qualifications are not invented. New employer-specific questions, declarations, sensitive screening questions and unfamiliar controls may still require manual completion. You review the completed application and submit it yourself. The extension does not click Submit, accept consent or bypass login or CAPTCHA. Sites may autosave filled fields.

NextRole autofill does not use advertising, analytics, cloud sync or remote code. It has no Gmail access or API keys. Website-to-extension handoff is restricted to NextRole's exact origin and requires a confirmation in the extension before replacing saved documents. A changed saved document invalidates an older form preview. Remove saved files independently from the popup.

An installed Microsoft Edge extension and the NextRole website are needed for setup. No paid AI provider or platform login is required for this autofill workflow. Employers may require login to complete their applications. This is assisted autofill; universal form compatibility or application success is not guaranteed.

## Single purpose

Let a user review resume facts, save a local profile and resume, and fill selected supported fields on the application page they choose.

## Permission justifications

- `activeTab`: read the current form and fill only user-selected fields when the user invokes the extension.
- `scripting`: run bundled form detection and fill code on that chosen page.
- `storage`: retain reviewed documents locally and stage a pending handoff until the user confirms or cancels.
- Content-script site access: the release package matches only `https://nextrole-job-match.blueowl129.chatgpt.site/*`. A small top-frame bridge receives setup messages and forwards them to the extension; it does not read the DOM or stored documents. Sender origins, top-frame status and tab identity are checked again by the worker.

Remote code: none. All extension code is bundled. Do not certify compliance or complete account agreements until the publisher has reviewed the actual submission.

## Data usage disclosure draft for the publisher to review

The extension processes personally identifying contact/profile information, professional and education history and user-provided resume content. It reads selected application-page field labels/values for the user-requested autofill operation. It stores reviewed documents locally, stages pending transfer data in session storage, and sends user-selected entries/files to the application site when the user fills them. It does not sell data, use it for advertising or credit decisions, or send it to an analytics server. Do not claim it collects no personal information just because storage is local. Map these facts to the current Partner Center categories and review Microsoft's agreements yourself.

## Certification testing notes

1. Install the store package; it matches only the published NextRole origin, not localhost.
2. Open NextRole, upload a synthetic PDF/DOCX, then Application autofill. Review the facts and select the review checkbox.
3. Choose Save to extension. Check the website and filename in the extension window, then Save profile and resume.
4. Reopen the popup and confirm both saved statuses appear. Close/reopen Edge; both should remain loaded.
5. Open a test application with native contact fields and an employment group. Scan, preview and fill selected fields. Verify the source dates and no submit actions. Do not use a real person's private data for testing.
6. Cancel a new setup transfer and verify earlier documents are unchanged. Replace one document, rescan, and verify old previews cannot be filled. Remove each saved document independently.
7. Untrusted origins, subframes and requests to read stored documents must be rejected. No privacy-sensitive source values should be returned through the website bridge.

## Publish and activate

1. Sign in to Microsoft Partner Center with the owner's Edge publisher account. Register if needed; the owner must complete identity, account terms and certifications.
2. Create a new Edge extension and upload the store package. Use the copy and logo here, review privacy/data disclosures and use the accessible privacy URL above.
3. Submit for certification. The extension is not publicly installable until Microsoft approves and publishes it. This project does not invent a store listing URL.
4. Copy the real listing URL and run `python configure_extension_store.py --store-url "THE_REAL_LISTING_URL"`, then `python build_autofill_extension.py`.
5. Deploy the updated website configuration. Its Add to Microsoft Edge button becomes available. The bridge discovers the installed extension automatically, so no extension ID needs to be entered by the user.

Official submission guide: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
