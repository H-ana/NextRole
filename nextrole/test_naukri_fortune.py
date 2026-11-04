import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public_feed'))
from collect_platforms import approved_targets,search_plan,collect,NAUKRI_FORTUNE_BATCH,TARGET_BATCH
from mnc_employers import mnc_employer
from unittest.mock import patch

class FortuneNaukriTests(unittest.TestCase):
 def test_verified_snapshot_and_registry_are_consistent(self):
  root=Path(__file__).parent
  snapshot=json.loads((root/'docs/naukri-fortune-software-companies.json').read_text(encoding='utf-8'))
  self.assertEqual(len(snapshot['companies']),99)
  self.assertEqual(len({c['naukri_company_id'] for c in snapshot['companies']}),99)
  self.assertEqual(snapshot['department'],'Engineering - Software & QA')
  for item in snapshot['companies']:
   row=mnc_employer({'company':item['name']})
   self.assertIsNotNone(row,item['name'])
   self.assertEqual(row['name'],item['canonical_employer'])
   self.assertIs(row['naukri_fortune_software_verified'],True)
   self.assertIn(item['naukri_company_id'],row['naukri_company_ids'])
  self.assertEqual((root/'dist/mnc-employers.json').read_bytes(),(root/'public_feed/dist/mnc-employers.json').read_bytes())
 def test_naukri_priority_rotation_does_not_increase_query_budget(self):
  previous=None;seen=set();rows=approved_targets()
  targets={name for name,row in rows.items() if row.get('naukri_fortune_software_verified') is True}
  for cycle in range(4):
   plans=search_plan('naukri',1000000+cycle*14400,previous)
   targeted=[p for p in plans if p.get('employer')]
   self.assertEqual(len(targeted),TARGET_BATCH)
   self.assertEqual(len({p['employer'] for p in targeted}),TARGET_BATCH)
   self.assertGreaterEqual(len({p['employer'] for p in targeted}&targets),min(NAUKRI_FORTUNE_BATCH,len(targets)))
   seen.update(p['employer'] for p in targeted)
   if cycle==0:self.assertTrue(all(p['role']==rows[p['employer']].get('naukri_search_name',p['employer']) for p in targeted))
   previous=collect('naukri',previous,fetcher=lambda p:([],False),now=1000000+cycle*14400)
  self.assertTrue(targets.issubset(seen),'Every verified directory employer must progress through rotation')
  self.assertTrue(seen-targets,'Other approved employers must keep receiving searches')
 def test_company_mentions_do_not_qualify_unknown_employers(self):
  self.assertIsNone(mnc_employer({'company':'Hiring for UK Fortune clients','description':'TIAA and HCA Healthcare customer'}))
  plan=dict(site='naukri',role='Software Engineer TIAA',city='India',remote=False,results=40,employer='Teachers Insurance and Annuity Association of America (TIAA)',target_role_index=3)
  with patch('collect_platforms.search_plan',return_value=[plan]):
   data=collect('naukri',fetcher=lambda p:([{'id':'unrelated','company':'Microsoft','title':'Software Engineer','description':'TIAA client','location':'Bengaluru, India','url':'https://www.naukri.com/job-listings-other-123'}],False),now=1000000)
  self.assertEqual(data['jobs'],[])

if __name__=='__main__':unittest.main()
