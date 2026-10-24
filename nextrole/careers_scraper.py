"""Bounded public careers-page crawler. No job-board API or model calls.

Only configured employer sites and employer-linked application pages are visited.
An incomplete crawl never asserts that missing jobs have closed.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
from urllib.parse import urljoin, urlsplit, urlunsplit

USER_AGENT = 'NextRoleCareers/1.0'
ATS_HOSTS = {'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com'}
MAX_BYTES = 8_000_000
SETTINGS_PATH = Path(__file__).parent / 'scraping_settings.json'


def scraping_mode():
    """Browser collection is opt-in; missing/invalid settings safely use HTML."""
    try:
        settings = json.loads(SETTINGS_PATH.read_text(encoding='utf-8'))
        return 'browser' if isinstance(settings,dict) and settings.get('mode') == 'browser' else 'html'
    except (OSError,ValueError):
        return 'html'


_RATE_LOCK = threading.Lock()
_HOST_LOCKS = {}; _HOST_LAST = {}; _HOST_DELAY = {}


def pace(host, delay, deadline):
    # Shared across company workers, including employer-hosted ATS pages.
    with _RATE_LOCK:
        lock = _HOST_LOCKS.setdefault(host, threading.Lock())
        _HOST_DELAY[host] = max(delay, _HOST_DELAY.get(host, 0))
    with lock:
        pause = max(0, _HOST_LAST.get(host, 0) + _HOST_DELAY[host] - time.monotonic())
        if time.monotonic() + pause >= deadline: raise CrawlError('Careers-page scan reached its time limit.')
        time.sleep(pause); _HOST_LAST[host] = time.monotonic()


class CrawlError(Exception):
    """Safe, user-facing source status; never includes response bodies."""


@dataclass
class CrawlResult:
    jobs: list
    complete: bool = False
    note: str = 'Limited careers-page scan; additional openings may exist.'


def public_url(value):
    p = urlsplit(value)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise CrawlError('Only public HTTPS careers pages are supported.')
    try:
        addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
            raise CrawlError('Private network addresses are not supported.')
    except socket.gaierror:
        raise CrawlError('Careers website could not be reached.') from None
    return urlunsplit((p.scheme, p.netloc, p.path or '/', p.query, ''))


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []; self.json_ld = []; self.parts = []; self.headings = []
        self.anchor = None; self.script = None; self.hidden = 0; self.heading = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'script':
            self.hidden += 1
            if a.get('type', '').split(';')[0].lower() == 'application/ld+json': self.script = []
        elif tag in ('style', 'nav', 'footer', 'header'): self.hidden += 1
        if tag == 'a': self.anchor = [a.get('href', ''), []]
        if tag == 'iframe' and a.get('src'): self.links.append((a['src'], 'Open jobs'))
        if tag == 'h1': self.heading = []
        if tag in ('p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'section'): self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag == 'script':
            if self.script is not None:
                try: self.json_ld.append(json.loads(''.join(self.script)))
                except (ValueError, RecursionError): pass
            self.script = None
        if tag in ('script', 'style', 'nav', 'footer', 'header'): self.hidden = max(0, self.hidden - 1)
        if tag == 'a' and self.anchor:
            self.links.append((self.anchor[0], ' '.join(''.join(self.anchor[1]).split())))
            self.anchor = None
        if tag == 'h1' and self.heading is not None:
            self.headings.append(' '.join(''.join(self.heading).split())); self.heading = None
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'section'): self.parts.append('\n')

    def handle_data(self, data):
        if self.script is not None: self.script.append(data)
        if self.anchor is not None: self.anchor[1].append(data)
        if self.heading is not None: self.heading.append(data)
        if not self.hidden: self.parts.append(data)

    @property
    def text(self):
        return '\n'.join(' '.join(line.split()) for line in ''.join(self.parts).splitlines() if line.strip())


def job_postings(value, depth=0):
    if depth > 20: return
    if isinstance(value, dict):
        kind = value.get('@type', [])
        if 'JobPosting' in ([kind] if isinstance(kind, str) else kind or []): yield value
        for child in value.values(): yield from job_postings(child, depth + 1)
    elif isinstance(value, list):
        for child in value: yield from job_postings(child, depth + 1)


def text_html(value):
    parser = PageParser(); parser.feed(str(value or '')); return parser.text


def visible_location(title, text):
    """Read location labels or the job-header line directly before Apply.

    Never infer location from company boilerplate or application-form addresses.
    Also works on previously cached visible page text, without another request.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for i,line in enumerate(lines):
        if re.fullmatch(r'Apply for this job|Create a Job Alert',line,re.I):break
        if line == title:
            following = lines[i+1:i+5]
            for end,control in enumerate(following):
                if re.fullmatch(r'Apply(?: (?:now|for this job))?',control,re.I):
                    parts = following[:end]
                    if 1 <= len(parts) <= 2 and all(len(p)<=200 and not re.match(r'^(?:responsibilities|requirements|qualifications|about\b|what\b|apply\b)',p,re.I) for p in parts):
                        return '; '.join(parts)
                    break
        if re.fullmatch(r'(?:Office )?Locations?|Workplace',line,re.I) and i+1<len(lines):
            value=lines[i+1]
            if len(value)<=200 and not re.fullmatch(r'Apply(?: now)?|Select.*|First Name.*|Email.*',value,re.I):return value
    return ''


def location_text(value):
    if isinstance(value, list): return '; '.join(filter(None, (location_text(x) for x in value)))
    if isinstance(value, str): return value
    if not isinstance(value, dict): return ''
    address = value.get('address', value)
    if isinstance(address, str): return address
    return ', '.join(str(address[k].get('name', '') if isinstance(address[k], dict) else address[k])
                     for k in ('addressLocality', 'addressRegion', 'addressCountry') if address.get(k)) or str(value.get('name', ''))


def make_job(source, title, description, location, url, **extra):
    # Imported here to keep ingestion helpers compatible with the existing cache.
    from job_store import experience_requirement, source_key
    if not isinstance(title,str) or not title or len(title) > 300 or len(description.strip()) < 100 or len(description) > 80000: return None
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password: return None
    years, quote = experience_requirement(description)
    style = 'Hybrid' if re.search(r'\bhybrid\b', location, re.I) else 'Remote' if re.search(r'\bremote\b', location, re.I) else 'unknown'
    key = source_key(source)
    return {'id': key + ':' + hashlib.sha256(url.encode()).hexdigest()[:24], 'source': key,
            'company': source['company'], 'title': title, 'description': description,
            'location': location or 'Location not specified', 'style': style, 'url': url,
            'years': years, 'experience_quote': quote, 'skills': [], 'collection_method': 'careers-page scraping', **extra}


def structured_jobs(source, parser, page_url):
    result = []
    for block in parser.json_ld:
        for item in job_postings(block):
            expiry = item.get('validThrough')
            if expiry:
                try:
                    date = datetime.fromisoformat(str(expiry).replace('Z', '+00:00'))
                    if date.replace(tzinfo=date.tzinfo or timezone.utc) < datetime.now(timezone.utc): continue
                except ValueError: pass
            location = location_text(item.get('jobLocation'))
            if not location: location = visible_location(item.get('title'),parser.text)
            if str(item.get('jobLocationType', '')).upper() == 'TELECOMMUTE':
                location = 'Remote' + (' - ' + location if location else '')
                countries = location_text(item.get('applicantLocationRequirements'))
                if countries: location += ' - ' + countries
            raw_url = item.get('url')
            if not isinstance(raw_url,str) and not is_detail(page_url): continue
            url = urljoin(page_url, raw_url) if isinstance(raw_url, str) else page_url
            job = make_job(source, item.get('title'), text_html(item.get('description')), location, url,
                           scraped_from=page_url, date_posted=item.get('datePosted'))
            if job: result.append(job)
    return result


def is_detail(url):
    p = urlsplit(url); path = p.path
    return bool(re.search(r'/(?:jobs?|careers)/(?:listing/|detail/|view/)?[^/]+/(?:\d+|[a-f0-9-]{20,})(?:/|$)', path, re.I)
                or re.search(r'/(?:jobs?|positions?)/(?:\d+|[a-f0-9-]{20,})(?:/|$)', path, re.I)
                or (p.hostname in ATS_HOSTS and re.search(r'/(?:\d{4,}|[a-f0-9-]{30,})(?:/|$)', path, re.I))
                or 'gh_jid=' in p.query)


class CareersCrawler:
    def __init__(self, source, max_pages=35, seconds=120):
        self.source = source; self.max_pages = min(max_pages, 100); self.deadline = time.monotonic() + seconds
        self.hosts = set(source.get('allowed_hosts', [])) | {urlsplit(source['careers_url']).hostname}
        self.robots = {}; self.delay = {}; self.browser = None; self.runtime = None
        self.visited = set(); self.rendered = 0; self.partial = False
        self.mode = scraping_mode()

    def allowed(self, url):
        p = urlsplit(url)
        return p.scheme == 'https' and p.hostname in self.hosts and not p.username and not p.password and p.port in (None, 443)

    def check_deadline(self):
        if time.monotonic() >= self.deadline: raise CrawlError('Careers-page scan reached its time limit; cached jobs retained.')

    def _open(self, url, check_robots=True):
        self.check_deadline(); public_url(url)
        if not self.allowed(url): raise CrawlError('Careers page redirected outside the configured employer websites.')
        if check_robots: self.check_robots(url)
        # Check every redirect before making the request, including its robots rules.
        owner = self
        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                newurl = urljoin(req.full_url, newurl)
                if not owner.allowed(newurl): raise CrawlError('Careers page redirected outside the configured employer websites.')
                public_url(newurl)
                if check_robots: owner.check_robots(newurl)
                pace(urlsplit(newurl).hostname,owner.delay.get(urlsplit(newurl).hostname,1.5),owner.deadline)
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        host = urlsplit(url).hostname
        pace(host,self.delay.get(host,1.5),self.deadline)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
            with urllib.request.build_opener(Redirect()).open(req, timeout=max(1, min(20, self.deadline - time.monotonic()))) as response:
                data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES: raise CrawlError('Careers page exceeds the supported size.')
                return data.decode(response.headers.get_content_charset() or 'utf-8', errors='replace'), response.url
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429): raise CrawlError('Website blocked automated access or requested a slower rate; no bypass attempted.') from None
            raise

    def check_robots(self, url):
        p = urlsplit(url); origin = f'https://{p.netloc}'
        if origin not in self.robots:
            try:
                raw, _ = self._open(origin + '/robots.txt', check_robots=False)
            except urllib.error.HTTPError as e:
                if e.code != 404: raise CrawlError('Could not verify website crawling rules; no pages collected.') from None
                raw = ''
            robot = urllib.robotparser.RobotFileParser(); robot.parse(raw.splitlines())
            self.robots[origin] = robot
            self.delay[p.hostname] = max(1.5, float(robot.crawl_delay(USER_AGENT) or 0))
        if not self.robots[origin].can_fetch(USER_AGENT, url): raise CrawlError('Website crawling rules disallow automated collection.')

    def render(self, url):
        """Optional normal browser rendering; no credentials, stealth, or CAPTCHA solving."""
        if self.mode != 'browser': return None
        self.check_deadline(); self.check_robots(url)
        try:
            os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', str(Path(__file__).parent / '.browsers'))
            from playwright.sync_api import sync_playwright
            if not self.runtime:
                self.runtime = sync_playwright().start()
                self.browser = self.runtime.chromium.launch(headless=True)
        except Exception:
            self.partial = True
            return None
        context = self.browser.new_context(user_agent=USER_AGENT,service_workers='block')
        def route(request_route):
            request = request_route.request
            try:
                if request.resource_type in ('image', 'media', 'font'): return request_route.abort()
                public_url(request.url)
                if request.is_navigation_request():
                    if not self.allowed(request.url): return request_route.abort()
                    self.check_robots(request.url)
                    pace(urlsplit(request.url).hostname,self.delay.get(urlsplit(request.url).hostname,1.5),self.deadline)
                elif urlsplit(request.url).hostname not in self.hosts:
                    return request_route.abort()
                request_route.continue_()
            except Exception: request_route.abort()
        context.route('**/*', route)
        try:
            page = context.new_page()
            response = page.goto(url, wait_until='domcontentloaded', timeout=max(1000, min(25000, int((self.deadline-time.monotonic())*1000))))
            if response and response.status in (401,403,429): raise CrawlError('Website blocked automated access; no bypass attempted.')
            page.wait_for_timeout(min(1800, max(0, int((self.deadline-time.monotonic())*1000))))
            self.rendered += 1
            return page.content(), page.url
        finally: context.close()

    def collect(self):
        queue = [self.source['careers_url']]; found = {}; failures = 0; index_pages = 0
        try:
            while queue and len(self.visited) < self.max_pages and time.monotonic() < self.deadline:
                url = queue.pop(0)
                if url in self.visited: continue
                self.visited.add(url)
                if not is_detail(url): index_pages += 1
                try:
                    raw, final = self._open(url)
                    if re.search(r'<title[^>]*>[^<]*(?:access denied|just a moment|captcha|sign in)',raw,re.I):
                        raise CrawlError('Website requires sign-in or a browser challenge; no bypass attempted.')
                    parser = PageParser(); parser.feed(raw)
                    items = structured_jobs(self.source, parser, final)
                    # Browser fallback is only for accessible pages that lack usable HTML.
                    if self.mode == 'browser' and not items and not any(is_detail(urljoin(final, href)) for href,_ in parser.links):
                        rendered = self.render(final)
                        if rendered:
                            raw, final = rendered; parser = PageParser(); parser.feed(raw)
                            if re.search(r'\b(?:verify you are human|complete the captcha|access denied)\b',parser.text,re.I):
                                raise CrawlError('Website requires a browser challenge; no bypass attempted.')
                            items = structured_jobs(self.source, parser, final)
                    if not items and is_detail(final) and parser.headings:
                        # Require a real job description, never use a careers landing page as a job.
                        text = parser.text
                        if re.search(r'\b(?:responsibilities|qualifications|requirements|what you.ll do|about the role)\b',text,re.I):
                            location = visible_location(parser.headings[0],text)
                            item = make_job(self.source, parser.headings[0], text, location, final, scraped_from=final)
                            if item: items.append(item)
                    for item in items:
                        if self.allowed(item['url']): found[item['url']] = item
                    candidates = []
                    for href, label in parser.links:
                        dest = urljoin(final, href); p = urlsplit(dest)
                        dest = urlunsplit((p.scheme,p.netloc,p.path,p.query,''))
                        if not self.allowed(dest) or dest == final or dest in self.visited: continue
                        if is_detail(dest): candidates.append(dest)
                        elif not is_detail(final) and (re.search(r'\b(?:open roles|open positions|view jobs|all jobs|next|careers)\b',label,re.I)
                              or (p.hostname in ATS_HOSTS and p.path.strip('/'))): candidates.append(dest)
                    queue.extend(x for x in dict.fromkeys(candidates) if x not in queue and x not in found)
                    # Discover a few listing pages first, then rotate the detail sample
                    # across refreshes. Otherwise only the first roles are ever visited.
                    slot=str(int(time.time()//900))
                    queue=sorted(queue,key=lambda x:(0 if not is_detail(x) and index_pages<8 else 1,hashlib.sha256((slot+x).encode()).hexdigest()))[:2000]
                except Exception as e:
                    failures += 1
                    if not found and len(self.visited) == 1:
                        if isinstance(e, CrawlError): raise
                        raise CrawlError('Careers website could not be read. Previous scraped listings retained.') from None
            if not found:
                raise CrawlError('No readable jobs found in HTML-only mode. This careers page may require JavaScript or a site-specific scraper.' if self.mode == 'html' else 'No readable job descriptions found. The website may need browser setup or a site-specific scraper.')
            # Generic DOM crawling cannot prove that hidden/paginated jobs are exhausted.
            note = 'Limited careers-page scan; additional openings may exist.'
            if self.mode == 'html': note += ' HTML-only collection; JavaScript-only openings may be missing.'
            if failures: note += ' Some pages could not be read.'
            if self.partial: note += ' Browser rendering unavailable; run python setup_scraping.py.'
            return CrawlResult(list(found.values()), complete=False, note=note)
        finally:
            if self.browser: self.browser.close()
            if self.runtime: self.runtime.stop()


def scrape_source(source):
    if source.get('provider') == 'restricted':
        raise CrawlError(source['unavailable_reason'])
    return CareersCrawler(source).collect()
