# NextRole application

The main **[project README](../README.md)** contains the feature overview, installation instructions, architecture, privacy model and troubleshooting guide.

## Start from this folder

```powershell
python setup_semantic.py   # Optional local semantic ranking
python setup_jobspy.py     # Optional platform collection
python start_agent.py      # Optional Gemini key prompt; Enter to skip
```

Open **http://localhost:8081/**. No npm build is required.

## Development checks

```powershell
python -m unittest discover -s . -p "test_*.py" -q
```

For frontend checks and the legacy standard-input test invocation, see [Development](../README.md#development).

After changing Python code, restart the backend. After changing frontend modules, update the shared cache version with `python version_frontend.py <integer-version>` and reload the browser.

## Further documentation

- [Gmail connection and privacy](GMAIL_SETUP.md)
- [Third-party references](THIRD_PARTY_REFERENCES.md)
- [Environment variable template](.env.example)
- [Company source configuration](job_sources.json)
- [HTML/browser collection setting](scraping_settings.json)

Gmail credentials, private data, applicant documents and development screenshots must stay out of Git. See the root README for the complete storage model and platform limitations.
