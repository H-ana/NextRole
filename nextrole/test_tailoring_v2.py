import copy
import unittest
from agent_service import tailor,editable_lines
from resume_structure import structure

RESUME='Alex Example\nalex@example.com\nProfile\nBuilt Python reporting services.\nExperience\nAnalyst, Example | 2022–2024\n- Automated SQL reporting.\n- Validated payroll records.\nEngineer, Other | 2020–2022\n- Supported Python services.\nEducation\nBSc Example\nCertifications\nExample Certificate\nProjects\nReporting (Example)\nBuilt SQL reports.\nAutomated report delivery.\nMigration (Example)\nValidated SQL records.\n'
JOB={'id':'one','title':'Analyst','company':'Example','location':'India','description':'Required: SQL reporting. Preferred: Python services. Requires a PhD.'}

def response():
    return {'suggestions':[],'advice':[],'requirements':[], 'summary_suggestion':{'text':'','source_indices':[],'job_quote':'','rationale':''},'ordering_suggestions':[]}

class TailoringV2Tests(unittest.TestCase):
    def invoke(self,proposal,verify=True):
        def model(schema,name,prompt):
            if name=='resume_suggestions':return copy.deepcopy(proposal)
            return {'checks':[{'line_index':e['line_index'],'faithful':verify,'reason':'test'} for e in prompt['edits']]}
        return tailor({'resume':RESUME,'job':JOB},model)

    def test_confirmed_scope_is_preserved_and_guidance_uses_only_source(self):
        source=RESUME.replace('- Automated SQL reporting.', '- Automated SQL reporting. Reviewed 500 records weekly.')
        proposal=response()
        proposal['suggestions']=[dict(line_index=6,original=source.splitlines()[6],replacement='- Automated SQL reporting; reviewed 500 records each week.',job_quote='SQL reporting.',rationale='Shows verified scope')]
        calls=[]
        def model(schema,name,prompt):
            calls.append((name,prompt))
            if name=='resume_suggestions':
                self.assertIn('action + scope + method + outcome',prompt['task'])
                self.assertIn('Reviewed 500 records weekly.',prompt['resume'])
                return copy.deepcopy(proposal)
            self.assertIn('500',prompt['edits'][0]['original'])
            return {'checks':[{'line_index':6,'faithful':True,'reason':'Preserves confirmed scope'}]}
        result=tailor({'resume':source,'job':JOB},model)
        self.assertEqual(len(result['suggestions']),1)
        self.assertEqual(calls[-1][0],'factual_verification')
        self.assertNotIn('500',RESUME)

    def test_short_bullets_editable_but_headers_dates_and_qualifications_locked(self):
        indices={r['line_index'] for r in editable_lines(RESUME)}
        self.assertIn(6,indices);self.assertIn(9,indices)
        for i in (0,1,5,8,10,11,12,13,15,18):self.assertNotIn(i,indices)

    def test_evidence_is_prioritized_and_invalid_quotes_become_unclear(self):
        p=response();p['requirements']=[dict(requirement='Python',importance='preferred',category='skill',status='supported',job_quote='Python services.',resume_quote='Built Python reporting services.'),dict(requirement='PhD',importance='required',category='education',status='missing',job_quote='Requires a PhD.',resume_quote=''),dict(requirement='Invented',importance='required',category='skill',status='supported',job_quote='not in job',resume_quote='fake')]
        result=self.invoke(p)
        self.assertEqual(result['requirements'][0]['status'],'missing');self.assertEqual(result['requirements'][1]['status'],'unknown')
        self.assertEqual(result['requirements'][1]['resume_quote'],'');self.assertEqual(result['suggestions'],[])

    def test_summary_requires_valid_sources_numbers_and_second_check(self):
        p=response();p['summary_suggestion']={'text':'Built reporting services using Python.','source_indices':[3],'job_quote':'Python services.','rationale':'Relevant existing experience'}
        result=self.invoke(p);self.assertEqual(result['summary_suggestion']['replace_indices'],[3])
        self.assertIsNone(self.invoke(p,False)['summary_suggestion'])
        p['summary_suggestion']['text']='Built 50 Python services.';self.assertIsNone(self.invoke(p)['summary_suggestion'])
        p['summary_suggestion']['source_indices']=[11];self.assertIsNone(self.invoke(p)['summary_suggestion'])

    def test_only_permutations_within_supplied_boundaries_are_allowed(self):
        parsed=structure(RESUME);group=next(g for g in parsed['ordering_groups'] if g['id']=='bullets-5')
        self.assertEqual(group['items'],[[6],[7]])
        p=response();p['ordering_suggestions']=[{'group_id':'bullets-5','item_order':[1,0],'job_quote':'SQL reporting.','rationale':'Emphasis'},{'group_id':'employers','item_order':[1,0],'job_quote':'SQL reporting.','rationale':'Invalid'}]
        result=self.invoke(p);self.assertEqual(len(result['ordering_suggestions']),1)
        self.assertEqual(result['ordering_suggestions'][0]['items'],[[6],[7]])
        p['ordering_suggestions'][0]['item_order']=[1,1];self.assertEqual(self.invoke(p)['ordering_suggestions'],[])

    def test_proficiency_cannot_be_promoted(self):
        p=response();p['suggestions']=[dict(line_index=9,original='- Supported Python services.',replacement='- Led Python services.',job_quote='Python services.',rationale='False promotion')]
        self.assertEqual(self.invoke(p)['suggestions'],[])

    def test_review_continues_beyond_six_without_losing_valid_corrections(self):
        resume='Alex Example\nExperience\nAnalyst, Example | 2022–2024\n'+'\n'.join(f'- Built SQL reporting workflow {i}.' for i in range(12))
        calls=[]
        def model(schema,name,prompt):
            if name=='resume_suggestions':
                calls.append(prompt['editable_lines'])
                return {'suggestions':[dict(line_index=line['line_index'],original=line['text'],replacement=line['text'].replace('Built','Developed'),job_quote='SQL reporting.',rationale='Clear wording') for line in prompt['editable_lines']],'advice':[]}
            return {'checks':[dict(line_index=e['line_index'],faithful=True,reason='Equivalent') for e in prompt['edits']]}
        first=tailor({'resume':resume,'job':JOB},model)
        self.assertEqual(len(first['suggestions']),8);self.assertEqual(first['review_progress']['remaining'],4)
        second=tailor({'resume':resume,'job':JOB,'reviewed_line_indices':first['review_progress']['reviewed_line_indices']},model)
        self.assertEqual(len(second['suggestions']),4);self.assertEqual(second['review_progress']['remaining'],0)
        self.assertEqual(len({s['line_index'] for s in first['suggestions']+second['suggestions']}),12)
        final=tailor({'resume':resume,'job':JOB,'reviewed_line_indices':second['review_progress']['reviewed_line_indices']},model)
        self.assertEqual(len(calls),2);self.assertEqual(final['suggestions'],[])

    def test_continuation_cannot_mark_protected_lines_as_reviewed(self):
        from agent_service import AgentError
        with self.assertRaises(AgentError):tailor({'resume':RESUME,'job':JOB,'reviewed_line_indices':[0]},lambda *args:None)

if __name__=='__main__':unittest.main()
