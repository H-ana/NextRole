import tempfile
import unittest
from pathlib import Path
from mnc_employers import mnc_employer
from job_store import JobStore
from test_job_store import FakeEncoder, SOURCE, job


class EmployerPolicyTests(unittest.TestCase):
    def test_exact_aliases_and_legal_suffixes(self):
        for company in ['Microsoft India Pvt. Ltd.', 'TCS', 'Deloitte USI', 'Cognizant Technology Solutions India Private Limited']:
            self.assertIsNotNone(mnc_employer({'company': company}))

    def test_unknown_and_client_mentions_do_not_pass(self):
        for company in ['', 'Unknown', 'MNC', 'Global International Technologies', 'Microsoft Staffing', 'Hiring for Amazon', 'Amazonia']:
            self.assertIsNone(mnc_employer({'company': company, 'description': 'Work for Microsoft and Google'}))

    def test_filter_runs_before_ranking_and_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            store=JobStore(Path(directory)/'jobs.db',[SOURCE],FakeEncoder())
            store.update_source(SOURCE,[{**job('unknown'),'company':'Local Startup'},
                                        {**job('mnc'),'company':'Microsoft India Pvt. Ltd.'}])
            for resume in ['', 'Python process automation experience']:
                result=store.search({'resume':resume,'preferences':{'experience':2},'limit':1})
                self.assertEqual([j['id'] for j in result['jobs']],['mnc'])
                self.assertEqual(result['employer_policy'],'mnc-only')
                self.assertEqual(result['excluded_employer'],1)
                self.assertEqual(result['eligible'],1)
            self.assertEqual(len(store.snapshot()['jobs']),2,'Collection cache remains separate from recommendation policy')

    def test_client_cannot_disable_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            store=JobStore(Path(directory)/'jobs.db',[SOURCE],FakeEncoder())
            store.update_source(SOURCE,[{**job(),'company':'Unknown Startup'}])
            result=store.search({'preferences':{'experience':2,'mnc_only':False},'mnc_only':False})
            self.assertEqual(result['jobs'],[])


if __name__=='__main__':unittest.main()
