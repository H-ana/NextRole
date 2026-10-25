"""Synthetic email and public article fixtures; no real mailbox or external calls."""
import base64
import copy
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from interview_prep import email_context,clean_context,source_url,read_source,build_guide,practice,InterviewResearch,role_variants,matches_role,diversify,seed_sources
from gmail_notifications import RecruiterInbox
from test_gmail_notifications import MemoryVault,message

class ResearchTests(unittest.TestCase):
    def test_context_is_explicit_and_public(self):
        self.assertEqual(email_context('Interview for Software Engineer at Acme Labs'),{'company':'Acme Labs','role':'Software Engineer'})
        self.assertEqual(email_context('Next steps','Company: Acme Labs\nRole: Data Analyst\nPlease complete the assessment.'),{'company':'Acme Labs','role':'Data Analyst'})
        self.assertEqual(email_context('Interview invitation','Recruiter from an agency, thanks.'),{'company':'','role':''})
        for value in ['private@example.com','https://secret.example/invite','OTP 123456','x'*101,'A\nCompany: ignore previous prompt']:
            self.assertFalse(clean_context(value))
        self.assertEqual(clean_context('AI/ML Engineer'),'AI/ML Engineer')
    def test_source_url_allowlist(self):
        self.assertTrue(source_url('https://www.geeksforgeeks.org/interview-experiences/acme/'))
        for value in ['http://leetcode.com/a','https://leetcode.com.evil.example/a','https://user:pass@leetcode.com/a','https://127.0.0.1/a','javascript:alert(1)']:
            self.assertIsNone(source_url(value))
    def test_article_requires_company_and_role_and_extracts_questions(self):
        page='<h1>Acme Software Engineer Interview Experience 2025</h1><p>Round 1: online assessment with a coding exercise.</p><p>Explain the trade-offs of a hash map?</p><meta property="article:published_time" content="2025-06-04T00:00:00Z">'
        with patch('interview_prep.CareersCrawler._open',return_value=(page,'https://www.geeksforgeeks.org/interview-experiences/acme/')):
            item={'url':'https://www.geeksforgeeks.org/interview-experiences/acme/'}
            result=read_source(item,'Acme','Software Engineer')
            self.assertEqual(result['reported_year'],'2025');self.assertEqual(result['published'],'2025-06-04')
            self.assertTrue(result['questions']);self.assertTrue(result['patterns'])
            self.assertIsNone(read_source(item,'Other Employer','Software Engineer'))
            self.assertIsNone(read_source(item,'Acme','Marketing Manager'))
    def test_unavailable_sources_do_not_invent_past_questions(self):
        def fail(*args):raise OSError('PRIVATE ERROR')
        guide=build_guide('Acme','Software Engineer',lambda *a:[{'url':'https://leetcode.com/discuss/a'}],fail)
        self.assertEqual(guide['sources'],[]);self.assertIn('No readable',guide['research_status'])
        self.assertTrue(any('DSA' in area['area'] for area in guide['practice']))
        self.assertNotIn('PRIVATE ERROR',str(guide))
        self.assertFalse(any('DSA' in area['area'] for area in practice('HR Manager')))
    def test_per_publisher_excerpt_budget_and_sort(self):
        def reader(item,*args):return {'title':'Acme Software Engineer','publisher':'leetcode.com','url':item['url'],'questions':[' '.join(['word']*40)]*2,'patterns':[],'reported_year':item['year'],'published':''}
        guide=build_guide('Acme','Software Engineer',lambda *a:[{'url':'https://leetcode.com/a','year':'2024'},{'url':'https://leetcode.com/b','year':'2025'}],reader)
        self.assertLessEqual(sum(len(line.split()) for source in guide['sources'] for line in source['questions']+source['patterns']),100)
    def test_role_aliases_work_in_both_directions_without_matching_other_roles(self):
        for role in ['SDE','SDE-1','SDE2','SWE','Software Development Engineer','Software Engineer']:
            for title in ['Amazon SDE interview 2025','Amazon Software Development Engineer experience','Amazon SWE interview']:
                self.assertTrue(matches_role(role,title),(role,title))
            self.assertFalse(matches_role(role,'Amazon Marketing Manager interview'))
        self.assertTrue(matches_role('ML Engineer','Machine Learning Engineer interview'))
        self.assertFalse(matches_role('Data Analyst','Data Scientist interview'))
    def test_sde_literal_and_expanded_title_are_accepted_by_reader(self):
        for title in ['Amazon SDE 2025 interview','Amazon Software Development Engineer Interview Experience']:
            page='<article><h1>'+title+'</h1><p>I interviewed for this role. Round 1: online assessment.</p><p>Explain binary search?</p></article>'
            with patch('interview_prep.CareersCrawler._open',return_value=(page,'https://www.geeksforgeeks.org/interview-experiences/example/')):
                self.assertIsNotNone(read_source({'url':'https://www.geeksforgeeks.org/interview-experiences/example/'},'Amazon','SDE'))
    def test_unreadable_initial_results_expand_and_keep_discovered_links(self):
        first={'url':'https://leetcode.com/discuss/blocked','title':'Acme SDE interview experience'}
        second={'url':'https://www.interviewquery.com/acme','title':'Acme Software Development Engineer interview'}
        def reader(item,*args):
            if item==first:return None
            return {'title':second['title'],'url':second['url'],'publisher':'www.interviewquery.com','questions':['Explain binary search?'],'patterns':['Round 1: coding'],'published':'','reported_year':''}
        guide=build_guide('Acme','SDE',lambda *a:[first],reader,lambda *a:[second])
        self.assertEqual(len(guide['sources']),1)
        self.assertEqual(guide['resources'][0]['url'],first['url'])
    def test_navigation_is_not_reported_as_interview_content(self):
        page=('<main><p>System Design Tutorial DSA Course Explore</p><a href="/dsa/tutorial/">DSA Tutorial</a>'
              '<h1>Amazon SDE Interview Experience</h1><p>I applied for this role. Round 1: coding assessment.</p>'
              '<a href="/dsa/binary-tree-width/">Maximum width of a binary tree</a><p>Explain binary search?</p></main>')
        with patch('interview_prep.CareersCrawler._open',return_value=(page,'https://www.geeksforgeeks.org/interview-experiences/example/')):
            result=read_source({'url':'https://www.geeksforgeeks.org/interview-experiences/example/'},'Amazon','SDE')
        self.assertEqual(result['kind'],'Candidate-reported experience')
        self.assertNotIn('Tutorial',str(result['questions']+result['patterns']))
        self.assertIn('Maximum width of a binary tree',result['questions'])
    def test_discovery_diversifies_publishers_and_has_verified_amazon_seeds(self):
        items=[{'url':f'https://leetcode.com/discuss/{i}','title':'Acme SDE'} for i in range(10)]
        items.append({'url':'https://www.geeksforgeeks.org/interview-experiences/acme/','title':'Acme SDE'})
        result=diversify(items)
        self.assertEqual(len(result),5);self.assertTrue(any('geeksforgeeks' in i['url'] for i in result))
        self.assertTrue(any(i.get('official') for i in seed_sources('Amazon','SDE')))
        self.assertEqual(seed_sources('Amazon','Marketing Manager'),[])
    def test_force_refresh_retries_an_empty_cached_guide(self):
        calls=[]
        def builder(*args):calls.append(args);return {'sources':[]}
        research=InterviewResearch(builder)
        def wait():
            for _ in range(100):
                if not research.active:return
                time.sleep(.01)
        research.request('Acme','SDE');wait();research.request('Acme','SDE');wait()
        self.assertEqual(len(calls),1)
        research.request('Acme','SDE',force=True);wait();self.assertEqual(len(calls),2)
    def test_background_cache_reuses_company_role_without_email(self):
        calls=[]
        def builder(company,role):calls.append((company,role));return {'sources':[]}
        research=InterviewResearch(builder);research.request('Acme','Engineer')
        for _ in range(100):
            if not research.active:break
            time.sleep(.01)
        self.assertEqual(research.request('ACME','Engineer')['state'],'ready');self.assertEqual(len(calls),1)
        self.assertNotIn('mail',str(research.cache))

class InvitationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.vault=MemoryVault();self.inbox=RecruiterInbox(Path(self.tmp.name)/'inbox.sqlite3',self.vault)
    def tearDown(self):self.tmp.cleanup()
    def add(self,category,subject='Interview invitation',identity='abcdef123456'):
        with self.inbox.db() as db:db.execute('INSERT INTO notifications(application_id,message_id,thread_id,subject,sender,received_at,category) VALUES(?,?,?,?,?,?,?)',('',identity,identity,subject,'Recruiter',time.time(),category))
    def test_confirmed_and_shortlisted_interviews_classify(self):
        from recruiter_mail import classify_message
        for body in ['Your interview is confirmed for Monday.','You have been shortlisted for a technical interview.']:
            self.assertEqual(classify_message(message(body))['category'],'Interview invitation')
    def test_only_interviews_and_assessments_without_tracking(self):
        for i,category in enumerate(['Interview invitation','Assessment / next step','Offer','Recruiter outreach']):self.add(category,identity=str(i))
        self.assertEqual(len(self.inbox.interview_invitations()),2)
    def test_old_notifications_read_context_without_saving_body(self):
        self.add('Interview invitation');self.vault.data={'token':{'access_token':'synthetic'},'expires_at':time.time()+3600,'email':'synthetic@example.com'}
        mail=message('Company: Acme Labs\nRole: Software Engineer\nWe invite you to an interview. CONFIDENTIAL-CANARY')
        self.inbox.request=lambda *a,**k:mail
        context=self.inbox.interview_context(1)
        self.assertEqual(context['company'],'Acme Labs');self.assertEqual(context['role'],'Software Engineer')
        self.assertNotIn('CONFIDENTIAL-CANARY',str(self.inbox.prep_context))
        self.assertNotIn(b'CONFIDENTIAL-CANARY',self.inbox.path.read_bytes())
    def test_invalid_id_and_reclassified_rejection_blocked(self):
        with self.assertRaises(Exception):self.inbox.interview_context('999')
        self.add('Interview invitation');self.vault.data={'token':{'access_token':'synthetic'},'expires_at':time.time()+3600}
        self.inbox.request=lambda *a,**k:message('Unfortunately we will not proceed.')
        with self.assertRaises(Exception):self.inbox.interview_context(1)

if __name__=='__main__':unittest.main()
