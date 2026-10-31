"""Public employer-hosted adapters. No applicant data, logins or third-party job boards."""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlencode
from careers_scraper import CareersCrawler, CrawlError, CrawlResult, make_job, text_html


def brand_matches(source, title, description):
    # Acquired brands share parent portals. Do not relabel every parent-company vacancy.
    terms=source.get('brand_terms',[])
    return not terms or any(re.search(r'\b'+re.escape(term)+r'\b',title+'\n'+description,re.I) for term in terms)


def collect_published_board(source, crawler=None):
    """Employer-linked public ATS data, retaining the company careers identity."""
    from job_store import normalize_feed, feed_url
    from hashlib import sha256
    parsed=urlsplit(source['careers_url'])
    providers={'job-boards.greenhouse.io':'greenhouse','boards.greenhouse.io':'greenhouse',
               'jobs.ashbyhq.com':'ashby','jobs.lever.co':'lever'}
    provider=providers.get(parsed.hostname)
    parts=parsed.path.strip('/').split('/')
    board=parts[0] if parts else ''
    if not provider or not re.fullmatch(r'[A-Za-z0-9_-]+',board):
        raise CrawlError('Invalid configured employer careers board.')
    feed={**source,'provider':provider,'board':board}
    url=feed_url(feed);api=urlsplit(url)
    scoped={**source,'allowed_hosts':list(set(source.get('allowed_hosts',[]))|{api.hostname,'boards.greenhouse.io','job-boards.greenhouse.io'}),
            'allowed_path_prefixes':{**source.get('allowed_path_prefixes',{}),api.hostname:[api.path.rsplit('/jobs',1)[0] if provider=='greenhouse' else api.path]}}
    for host in ('boards.greenhouse.io','job-boards.greenhouse.io'):
        if provider=='greenhouse':scoped['allowed_path_prefixes'][host]=['/'+board]
    crawler=crawler or CareersCrawler(scoped)
    raw,_=crawler._open(url,accept='application/json')
    try:
        payload=json.loads(raw)
        records=payload if provider=='lever' else payload.get('jobs')
        jobs=normalize_feed(feed,payload)
    except (ValueError,TypeError,AttributeError):
        raise CrawlError('Employer published feed could not be read; existing jobs retained.') from None
    by_url={r.get('absolute_url') or r.get('applyUrl') or r.get('jobUrl') or r.get('hostedUrl'):r for r in records}
    result=[]
    for job in jobs:
        if not crawler.allowed(job['url']):continue
        if not brand_matches(source,job['title'],job['description']):continue
        record=by_url.get(job['url'],{})
        job.update(id=source['provider']+':'+source['id']+':'+sha256(job['url'].encode()).hexdigest()[:24],
                   source=source['provider']+':'+source['id'],
                   collection_method='company careers site (published '+provider+' feed)',scraped_from=source['careers_url'])
        # An update/creation time is not the original publication date.
        date=record.get('first_published') if provider=='greenhouse' else record.get('publishedAt') if provider=='ashby' else None
        if date:job['date_posted']=date
        result.append(job)
    # Public boards may omit historical/region-specific roles; never close unseen cache entries.
    return CrawlResult(result,False,'Company-published careers feed collected; availability follows the employer site.')


def collect_workday(source, crawler=None):
    crawler=crawler or CareersCrawler(source)
    parsed=urlsplit(source['careers_url'])
    if not re.fullmatch(r'[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com',parsed.hostname or ''):
        raise CrawlError('Invalid configured Workday employer host.')
    segments=[p for p in parsed.path.split('/') if p and not re.fullmatch(r'[a-z]{2}-[A-Z]{2}',p)]
    if len(segments)!=1 or not re.fullmatch(r'[A-Za-z0-9_-]+',segments[0]):raise CrawlError('Invalid configured Workday careers site.')
    tenant=parsed.hostname.split('.')[0];site=segments[0]
    base=f'https://{parsed.hostname}/wday/cxs/{tenant}/{site}'
    offset=max(0,int(source.get('scan_offset',0)));calls=0;found=[];seen=set();total=None;processed=0
    try:
        while calls<crawler.max_pages-1:
            processed=0
            crawler.check_deadline()
            body=json.dumps({'appliedFacets':{},'limit':20,'offset':offset,'searchText':source.get('search_text','India')}).encode()
            raw,_=crawler._open(base+'/jobs',payload=body,accept='application/json');calls+=1
            data=json.loads(raw)
            if not isinstance(data.get('jobPostings'),list) or not isinstance(data.get('total'),int):raise CrawlError('Employer returned an unreadable job list.')
            total=data['total'];batch=data['jobPostings']
            if not batch:
                offset=0
                break
            processed=0
            for listing in batch:
                if calls>=crawler.max_pages:break
                crawler.check_deadline()
                path=listing.get('externalPath','')
                if not isinstance(path,str) or not path.startswith('/job/') or '..' in path or '?' in path or '#' in path:raise CrawlError('Employer returned an invalid job path.')
                raw,_=crawler._open(base+path,accept='application/json');calls+=1;processed+=1
                detail=json.loads(raw).get('jobPostingInfo',{})
                if detail.get('canApply') is False or detail.get('posted') is False:continue
                title=detail.get('title');description=text_html(detail.get('jobDescription',''))
                if not isinstance(title,str) or not brand_matches(source,title,description):continue
                locations=[detail.get('location',''),*(detail.get('additionalLocations') or [])]
                locations=[l for l in locations if isinstance(l,str) and l.strip()]
                country=detail.get('country',{}).get('descriptor','')
                location='; '.join(dict.fromkeys(locations))
                if country and country.lower() not in location.lower():location+=', '+country
                url=f'https://{parsed.hostname}/{site}'+path
                item=make_job(source,title,description,location,url,scraped_from=url,
                              date_posted=detail.get('startDate'),employment_type=detail.get('timeType'),
                              collection_method='company careers site (Workday)',job_requisition_id=detail.get('jobReqId'))
                if item and item['url'] not in seen:seen.add(item['url']);found.append(item)
            offset+=processed
            if offset>=total:offset=0;break
            if processed<len(batch):break
        return CrawlResult(found,complete=False,note='Bounded company careers scan; remaining openings continue on the next refresh.',next_cursor=offset)
    except Exception as error:
        # Preserve successful details if a later page times out; retry the unprocessed offset.
        if found:return CrawlResult(found,complete=False,note='Partial company careers scan; remaining openings will be retried.',next_cursor=offset+processed)
        if isinstance(error,CrawlError):raise
        raise CrawlError('Company careers feed could not be read; previously collected jobs retained.') from None


def collect_oracle(source,crawler=None):
    crawler=crawler or CareersCrawler(source)
    parsed=urlsplit(source['careers_url']);site=source.get('site_number','')
    host=parsed.hostname or ''
    if not (host.endswith('.oraclecloud.com') or host in ('careers.oracle.com','jobs.nokia.com','careers.ti.com')) or not re.fullmatch(r'[A-Za-z0-9_-]+',site):
        raise CrawlError('Invalid configured Oracle employer careers site.')
    api_origin=source.get('api_origin',f'https://{host}')
    api=urlsplit(api_origin)
    if api.scheme!='https' or api.username or api.password or api.port not in (None,443) or api.path not in ('','/') or api.query or api.fragment or not crawler.allowed(api_origin):
        raise CrawlError('Invalid configured employer API origin.')
    base=api_origin.rstrip('/')+'/hcmRestApi/resources/latest/'
    offset=max(0,int(source.get('scan_offset',0)));processed=0;calls=0;found=[]
    try:
        while calls<crawler.max_pages-1:
            processed=0;crawler.check_deadline()
            keyword=source.get('search_text','India')
            query=urlencode({'onlyData':'true','expand':'requisitionList','finder':f'findReqs;siteNumber={site},keyword={keyword},limit=25,offset={offset}'})
            raw,_=crawler._open(base+'recruitingCEJobRequisitions?'+query,accept='application/json');calls+=1
            data=json.loads(raw)
            groups=data.get('items')
            if not isinstance(groups,list) or not groups or not isinstance(groups[0].get('requisitionList'),list):raise CrawlError('Employer returned an unreadable careers list.')
            batch=groups[0]['requisitionList'];total=int(groups[0].get('TotalJobsCount',0))
            if not batch:offset=0;break
            for listing in batch:
                if calls>=crawler.max_pages:break
                crawler.check_deadline();identity=str(listing.get('Id',''))
                if not re.fullmatch(r'[A-Za-z0-9_-]+',identity):raise CrawlError('Employer returned an invalid requisition identifier.')
                query=urlencode({'onlyData':'true','finder':f'ById;Id={identity}'})
                raw,_=crawler._open(base+'recruitingCEJobRequisitionDetails?'+query,accept='application/json');calls+=1
                details=json.loads(raw).get('items',[])
                if not details:raise CrawlError('Employer returned an unreadable requisition.')
                detail=details[0];processed+=1
                end=detail.get('ExternalPostedEndDate')
                if end:
                    try:
                        date=datetime.fromisoformat(end.replace('Z','+00:00'))
                        if date.replace(tzinfo=date.tzinfo or timezone.utc)<datetime.now(timezone.utc):continue
                    except (ValueError,TypeError):pass
                title=detail.get('Title')
                description='\n'.join(text_html(detail.get(key) or '') for key in ['ExternalDescriptionStr','ExternalResponsibilitiesStr','ExternalQualificationsStr']).strip()
                if not isinstance(title,str) or not brand_matches(source,title,description):continue
                location=detail.get('PrimaryLocation') or listing.get('PrimaryLocation') or ''
                application_base=source.get('application_base',f'https://{host}/hcmUI/CandidateExperience/en/sites/{site}')
                url=application_base.rstrip('/')+'/job/'+identity
                if not crawler.allowed(url):raise CrawlError('Employer application URL is outside the configured site.')
                style=detail.get('WorkplaceType') or listing.get('WorkplaceType')
                style={'Remote':'Remote','Hybrid':'Hybrid','On-site':'On-site','Onsite':'On-site'}.get(style,'unknown')
                item=make_job(source,title,description,location,url,scraped_from=url,
                              date_posted=detail.get('ExternalPostedStartDate'),style=style,
                              collection_method='company careers site (Oracle)',job_requisition_id=identity)
                if item:found.append(item)
            offset+=processed
            if offset>=total:offset=0;break
            if processed<len(batch):break
        return CrawlResult(found,False,'Bounded company careers scan; remaining openings continue on the next refresh.',offset)
    except Exception as error:
        if found:return CrawlResult(found,False,'Partial company careers scan; remaining openings will be retried.',offset+processed)
        if isinstance(error,CrawlError):raise
        raise CrawlError('Company careers feed could not be read; previously collected jobs retained.') from None


def collect_smartrecruiters(source,crawler=None):
    """Read employer-published external postings, never internal/authenticated jobs."""
    parsed=urlsplit(source['careers_url']);parts=parsed.path.strip('/').split('/')
    if parsed.hostname not in ('jobs.smartrecruiters.com','careers.smartrecruiters.com') or len(parts)!=1 or not re.fullmatch(r'[A-Za-z0-9_-]+',parts[0]):
        raise CrawlError('Invalid configured SmartRecruiters employer board.')
    company=parts[0];base='https://api.smartrecruiters.com/v1/companies/'+company+'/postings'
    scoped={**source,'allowed_hosts':list(set(source.get('allowed_hosts',[]))|{'api.smartrecruiters.com','jobs.smartrecruiters.com'}),'allowed_path_prefixes':{**source.get('allowed_path_prefixes',{}),'api.smartrecruiters.com':['/v1/companies/'+company+'/postings'],'jobs.smartrecruiters.com':['/'+company]}}
    crawler=crawler or CareersCrawler(scoped);offset=max(0,int(source.get('scan_offset',0)));found=[];calls=0;processed=0
    try:
        while calls<crawler.max_pages-1:
            processed=0;crawler.check_deadline()
            query=urlencode({'limit':20,'offset':offset,'country':'in','q':source.get('search_text','')})
            raw,_=crawler._open(base+'?'+query,accept='application/json');calls+=1;data=json.loads(raw)
            batch=data.get('content');total=data.get('totalFound')
            if not isinstance(batch,list) or not isinstance(total,int):raise CrawlError('Unreadable employer postings list.')
            if not batch:offset=0;break
            for listing in batch:
                if calls>=crawler.max_pages:break
                crawler.check_deadline();identity=str(listing.get('id',''))
                if not re.fullmatch(r'[A-Za-z0-9_-]+',identity):raise CrawlError('Invalid employer posting identifier.')
                raw,_=crawler._open(base+'/'+identity,accept='application/json');calls+=1;detail=json.loads(raw);processed+=1
                if detail.get('active') is False or detail.get('visibility') not in (None,'PUBLIC'):continue
                if detail.get('company',{}).get('identifier')!=company:raise CrawlError('Employer board identity mismatch.')
                sections=detail.get('jobAd',{}).get('sections',{})
                description='\n'.join(text_html(sections.get(k,{}).get('text','')) for k in ('companyDescription','jobDescription','qualifications','additionalInformation'))
                title=detail.get('name');place=detail.get('location') or {};location=place.get('fullLocation') or ', '.join(str(place[k]) for k in ('city','region','country') if place.get(k))
                if place.get('country','').lower()=='in' and 'india' not in location.lower():location+=', India'
                url=detail.get('postingUrl') or detail.get('applyUrl')
                if not isinstance(url,str) or not crawler.allowed(url):raise CrawlError('Application URL outside employer board.')
                if not isinstance(title,str) or not brand_matches(source,title,description):continue
                style='Hybrid' if place.get('hybrid') else 'Remote' if place.get('remote') else 'unknown'
                item=make_job(source,title,description,location,url,scraped_from=url,date_posted=detail.get('releasedDate'),style=style,collection_method='company careers site (SmartRecruiters)',job_requisition_id=detail.get('refNumber') or identity)
                if item:found.append(item)
            offset+=processed
            if offset>=total:offset=0;break
            if processed<len(batch):break
        return CrawlResult(found,False,'Bounded employer-published scan; remaining postings continue next refresh.',offset)
    except Exception as error:
        if found:return CrawlResult(found,False,'Partial employer-published scan; remaining postings will be retried.',offset+processed)
        if isinstance(error,CrawlError):raise
        raise CrawlError('Employer postings could not be read; cached listings retained.') from None
