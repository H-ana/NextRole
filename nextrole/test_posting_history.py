from pathlib import Path
import tempfile
import time
import unittest
from job_store import JobStore
from test_job_store import FakeEncoder
from platform_search import SOURCE

def job(number,title='Data Analyst',company='Example',query=''):
    return {'id':f'platform:jobspy:{number}{query}','source':'platform:jobspy','url':f'https://www.linkedin.com/jobs/view/{number}'+query,
            'title':title,'company':company,'description':'Build Python reporting and SQL automation. Required: 2 years of experience.',
            'location':'Bengaluru','style':'unknown','years':2,'skills':[],'listed_on':['LinkedIn']}

class PostingHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=JobStore(Path(self.temp.name)/'history.db',[SOURCE],FakeEncoder());self.now=time.time()
    def tearDown(self):self.temp.cleanup()
    def current(self,number):return next(j for j in self.store.snapshot()['jobs'] if j['url'].endswith('/'+str(number)))

    def test_earlier_role_postings_survive_expiry_and_refreshes_do_not_inflate(self):
        self.store.update_source(SOURCE,[job(123)],now=self.now-7*86400,complete=False)
        self.store.update_source(SOURCE,[job(123,query='?tracking=one')],now=self.now-2*86400,complete=False)
        self.store.update_source(SOURCE,[job(456)],now=self.now,complete=False)
        history=self.current(456)['site_history']['sites']['LinkedIn']
        self.assertEqual(history['prior_postings'],1)
        self.assertEqual(history['evidence'][0]['observed_at'],self.now-7*86400)
        reopened=JobStore(self.store.path,[SOURCE],FakeEncoder())
        current=next(j for j in reopened.snapshot()['jobs'] if j['url'].endswith('/456'))
        self.assertEqual(current['site_history']['sites']['LinkedIn']['prior_postings'],1)

    def test_same_batch_other_companies_seniority_and_recent_records_do_not_count(self):
        self.store.update_source(SOURCE,[job(1),job(2,title='Senior Data Analyst'),job(3,company='Other')],now=self.now-3*86400,complete=False)
        self.store.update_source(SOURCE,[job(4),job(5)],now=self.now,complete=False)
        self.assertEqual(self.current(4)['site_history']['sites']['LinkedIn']['prior_postings'],1)
        self.assertEqual(self.current(5)['site_history']['sites']['LinkedIn']['prior_postings'],1)

    def test_outside_window_and_unverified_imports_do_not_become_history(self):
        old=job(1);self.store.update_source(SOURCE,[old],now=self.now-181*86400,complete=False)
        imported=job(2);imported['source']='manual:linkedin'
        self.store.update_source({'provider':'manual','id':'linkedin','company':'Example'},[imported],now=self.now-4*86400,complete=False)
        self.store.update_source(SOURCE,[job(3)],now=self.now,complete=False)
        self.assertEqual(self.current(3)['site_history']['sites']['LinkedIn']['prior_postings'],0)

    def test_changed_title_resets_observation_for_that_title(self):
        self.store.update_source(SOURCE,[job(1,title='Different role')],now=self.now-7*86400,complete=False)
        self.store.update_source(SOURCE,[job(1),job(2)],now=self.now,complete=False)
        self.assertEqual(self.current(2)['site_history']['sites']['LinkedIn']['prior_postings'],0)

    def test_bootstrap_uses_only_last_retained_observation_and_stores_no_resume(self):
        self.store.update_source(SOURCE,[job(1)],now=self.now-2*86400,complete=False)
        with self.store.connect() as db:db.execute('DROP TABLE posting_history')
        reopened=JobStore(self.store.path,[SOURCE],FakeEncoder())
        with reopened.connect() as db:
            row=db.execute('SELECT * FROM posting_history').fetchone()
            self.assertEqual(row['first_observed'],self.now-2*86400)
            self.assertNotIn('description',row.keys());self.assertNotIn('resume',row.keys())

if __name__=='__main__':unittest.main()
