import tempfile
import unittest
from pathlib import Path
from experience_policy import requirement,assess
from job_store import JobStore
from test_job_store import SOURCE,job,FakeEncoder

class ExperiencePolicyTests(unittest.TestCase):
    def test_collection_batches_rotate_and_respect_cooldowns(self):
        from careers_scraper import CrawlResult
        from unittest.mock import patch
        sources=[{**SOURCE,'board':str(i),'catalog':'synthetic'} for i in range(4)]
        with tempfile.TemporaryDirectory() as folder:
            store=JobStore(Path(folder)/'jobs.db',sources,FakeEncoder());seen=[]
            def fetch(s):seen.append(s['board']);return CrawlResult([],False,'Synthetic')
            store.refresh(fetch,max_sources=2);self.assertEqual(set(seen),{'0','1'})
            seen.clear();store.refresh(fetch,max_sources=2);self.assertEqual(set(seen),{'2','3'})
            seen.clear();store.refresh(fetch,max_sources=2);self.assertEqual(seen,[])
            store.refresh(fetch,max_sources=2,force=True);self.assertEqual(len(seen),2)

    def test_source_formats_and_exact_experience_boundary(self):
        for text,low,high in [('Experience: 3-5 years',3,5),('4+ years of hands-on professional experience',4,None),('Minimum qualifications\n2 to 4 years of software engineering experience',2,4),("5 years’ relevant experience",5,None),('Qualifications\n3 years in software development',3,None),('Experience\n0.5–2 years',.5,2)]:
            with self.subTest(text=text):
                band=requirement(text);self.assertEqual(band['status'],'known');self.assertEqual(band['minimum'],low);self.assertEqual(band['maximum'],high)
                self.assertIn(band['quote'],text)
        for required,actual,allowed in [(4,2,False),(4.5,2,False),(3,2,False),(5,2,False),(2,2,True),(1,2,True)]:
            self.assertEqual(assess(requirement(f'Required {required}+ years of experience.'),actual) is not None,allowed)

    def test_meeting_minimum_allows_lower_experience_roles(self):
        band=requirement('Experience: 2–4 years')
        self.assertIsNone(assess(band,0));self.assertIsNotNone(assess(band,4))
        self.assertIsNotNone(assess(band,5))
        for text in ['Experience: 0-1 years','Experience: 0-2 years','Experience: 1-2 years']:
            self.assertIsNotNone(assess(requirement(text),2))
        self.assertIsNone(assess(requirement('Experience: 3-5 years'),2))

    def test_unknown_optional_history_and_alternatives(self):
        for text in ['Work on Python services.','Preferred qualifications\n8 years of experience','Our company has 20 years of experience serving clients.',"Bachelor degree and 5 years of experience or Master degree and 3 years of experience",'Experience: 8–2 years','Required: 3-4 years of experience\nRequired: 6 years of experience']:
            with self.subTest(text=text):self.assertIsNone(assess(requirement(text),2))
        self.assertEqual(requirement('Qualifications\n3 years of development experience\nPreferred qualifications\n8 years of experience')['minimum'],3)
        self.assertEqual(requirement('Required 3 years of SQL experience and 10 years of overall experience')['minimum'],10)

    def test_explicit_fresher_and_invalid_actual(self):
        band=requirement('No prior experience is required.')
        self.assertEqual(band['minimum'],0)
        for actual in [-1,float('nan'),float('inf'),'invalid']:self.assertIsNone(assess(band,actual))

    def test_search_reparses_cached_descriptions_and_cannot_disable_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            store=JobStore(Path(folder)/'jobs.db',[SOURCE],FakeEncoder())
            rows=[{**job(str(n)),'years':None,'description':f'Required {n}+ years of experience. Build Python services.'} for n in [2,3,4,5]]
            rows.append({**job('unknown'),'years':2,'description':'Build software without a stated experience requirement.'})
            store.update_source(SOURCE,rows)
            result=store.search({'preferences':{'experience':2,'experience_tolerance':80},'limit':200})
            self.assertEqual({j['id'] for j in result['jobs']},{'2'})
            self.assertEqual(result['excluded_experience_unknown'],1);self.assertEqual(result['experience_gaps'],3)
            self.assertEqual(result['stretch_count'],0)
            self.assertEqual(result['jobs'][0]['experience_match']['shortfall'],0)

if __name__=='__main__':unittest.main()
