"""Run: python server.py --port 8081. Serves app and stateless AI endpoints."""
import argparse
import functools
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from agent_service import AgentError, shortlist, tailor, prepare, profile_resume, benchmark_models, api_key, DEFAULT_MODEL, SUPPORTED_MODELS, test_connection, with_selected_model
from job_store import JobStore
from resume_export import export_one_page, ResumeExportError
from platform_search import PlatformSearch,PlatformError
from company_brief import build_brief

ROOT = Path(__file__).parent / 'dist'
ALLOWED_ORIGINS = {'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8081', 'http://127.0.0.1:8081'}


@functools.lru_cache(maxsize=1)
def get_job_store():
    return JobStore()


@functools.lru_cache(maxsize=1)
def get_platform_search():return PlatformSearch(get_job_store())


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def json_response(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ALLOWED_ORIGINS:
            return self.json_response({'error': 'Origin not allowed.'}, 403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if urlsplit(self.path).path == '/api/status':
            return self.json_response({'connected': bool(api_key()), 'provider': 'Google Gemini', 'model': os.getenv('GEMINI_MODEL', DEFAULT_MODEL), 'models': SUPPORTED_MODELS, 'capabilities': ['connection-test', 'bounded-retries', 'low-latency-batches', 'individual-job-reviews', 'cached-job-search', 'resume-profile', 'careers-page-scraping', 'platform-job-import', 'one-page-resume-export', 'platform-job-search', 'jobspy-platform-search', 'tailoring-evidence-v2', 'resume-export-v2', 'bulk-resume-corrections', 'company-brief', 'site-posting-history'], 'platform_jobs':get_platform_search().status()})
        if urlsplit(self.path).path == '/api/jobs':
            snapshot=get_job_store().snapshot()
            return self.json_response({**snapshot,'total':len(snapshot['jobs']),'jobs':snapshot['jobs'][:200]})
        super().do_GET()

    def do_POST(self):
        if self.headers.get('Origin') and self.headers['Origin'] not in ALLOWED_ORIGINS:
            return self.json_response({'error': 'Origin not allowed.'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8_000_000:
                return self.json_response({'error': 'Request must be under 8 MB.'}, 413)
            if self.headers.get_content_type() != 'application/json':
                return self.json_response({'error': 'Use application/json.'}, 415)
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError()
            route = urlsplit(self.path).path
            if route == '/api/company/brief':
                jobs=get_job_store().snapshot()['jobs']
                job=next((j for j in jobs if j['id']==body.get('job_id')),None)
                if not job:return self.json_response({'error':'This job is no longer in the current listings. Refresh jobs and try again.'},404)
                return self.json_response(build_brief(job,jobs))
            if route == '/api/jobs/platform-search':
                try:return self.json_response(get_platform_search().request(body))
                except PlatformError as error:return self.json_response({'error':str(error)},400)
            if route == '/api/resume/export':
                try:return self.json_response(export_one_page(body.get('text'),preview=body.get('preview') is True))
                except ResumeExportError as error:return self.json_response({'error':str(error)},422)
            if route == '/api/jobs/refresh':
                get_job_store().request_refresh()
                return self.json_response({'refreshing': True, 'message': 'Public feeds are refreshing in the background. Cached jobs remain searchable.'})
            if route == '/api/jobs/search':
                return self.json_response({**get_job_store().search(body),'platform_search':get_platform_search().status()})
            if route == '/api/jobs/import':
                try:job=get_job_store().import_platform_job(body)
                except (ValueError,TypeError):return self.json_response({'error':'Check the original platform job link, title, company and full description (100-80,000 characters).'},400)
                return self.json_response({'job':job})
            if route == '/api/models/benchmark':
                if not api_key():
                    return self.json_response({'error':'Configure Gemini before comparing model speed.'},503)
                return self.json_response(benchmark_models())
            if route == '/api/connection-test':
                if not api_key():
                    return self.json_response({'error': 'Gemini is not connected. Configure GEMINI_API_KEY and restart the backend.'}, 503)
                return self.json_response(with_selected_model(lambda _: test_connection(), body))
            if body.get('consent') is not True:
                return self.json_response({'error': 'Allow resume analysis with Google Gemini before running the agent.'}, 400)
            if not api_key():
                return self.json_response({'error': 'Gemini is not connected. Configure GEMINI_API_KEY on the agent server and restart it.'}, 503)
            if route == '/api/agent/profile':
                result = with_selected_model(profile_resume, body)
            elif route == '/api/agent/prepare':
                result = with_selected_model(prepare, body)
            elif route == '/api/agent/shortlist':
                result = with_selected_model(shortlist, body)
            elif route == '/api/agent/tailor':
                result = with_selected_model(tailor, body)
            else:
                return self.json_response({'error': 'Unknown endpoint.'}, 404)
            self.json_response(result)
        except AgentError as error:
            self.json_response({'error': str(error)}, 422)
        except (ValueError, KeyError, TypeError):
            self.json_response({'error': 'The request or AI response was invalid. No result was accepted.'}, 400)
        except Exception:
            self.json_response({'error': 'The agent could not finish. Please retry. Your original resume is unchanged.'}, 500)

    def log_message(self, *_):
        pass  # Do not log applicant documents, request bodies, or response data.


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8081)
    args = parser.parse_args()
    for host in ('localhost', '127.0.0.1'):
        ALLOWED_ORIGINS.add(f'http://{host}:{args.port}')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(ROOT)))
    get_job_store().start()
    print(f'NextRole: http://localhost:{args.port} Â· Gemini '+('configured' if api_key() else 'needs GEMINI_API_KEY'), flush=True)
    server.serve_forever()

