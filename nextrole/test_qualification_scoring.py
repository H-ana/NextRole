import copy
import unittest
from qualification_scoring import calculate,statements,complete_inventory
from agent_service import validate_assessment,verify_qualification_support
from test_agent import JOB,RESUME,assessment

class QualificationScoringTests(unittest.TestCase):
    def test_qualification_ratio_not_model_score_or_keyword_similarity(self):
        a=assessment();a['score']=7
        a=validate_assessment(a,JOB,RESUME,{'experience':2})
        self.assertEqual(a['score'],100)
        self.assertEqual(a['qualification_fit']['required']['supported'],2)
        for status in ['partial','missing','unknown']:
            a=assessment();a['requirements'][0]['status']=status
            result=validate_assessment(a,JOB,RESUME,{'experience':2})
            self.assertEqual(result['score'],50)
    def test_omitted_requirements_remain_in_denominator(self):
        job={**JOB,'description':JOB['description']+'\nRequired qualifications\nAWS certification\nProduction Kubernetes administration\nPreferred qualifications\nFrench language proficiency'}
        result=validate_assessment(assessment(),job,RESUME,{'experience':2})
        fit=result['qualification_fit']
        self.assertEqual(fit['required']['total'],4);self.assertEqual(fit['required']['unclear'],2)
        self.assertEqual(fit['preferred']['total'],1);self.assertEqual(fit['score'],50)
        self.assertEqual(result['decision'],'review')
    def test_invalid_quotes_and_experience_stretch_do_not_get_credit(self):
        a=assessment();a['requirements'][0]['resume_quote']='Invented qualification'
        self.assertEqual(validate_assessment(a,JOB,RESUME,{'experience':2})['score'],50)
        job={**JOB,'description':JOB['description'].replace('2 years','4 years')}
        a=assessment();a['experience_quote']='Requires 4 years of experience.'
        result=validate_assessment(a,job,RESUME,{'experience':2})
        self.assertEqual(result['experience'],'gap');self.assertEqual(result['score'],50)
    def test_compound_statements_and_duplicate_evidence(self):
        a=assessment();a['requirements']+=[{**a['requirements'][0],'requirement':'Another part','status':'partial'}]
        self.assertEqual(calculate(a)['score'],50)
    def test_no_four_requirement_cutoff_and_no_comparison_normalization(self):
        text='Required qualifications\n'+'\n'.join('Qualification '+str(i) for i in range(12))
        a=assessment();complete_inventory(a,text)
        self.assertEqual(len(statements(text)),12)
        self.assertEqual(calculate(a)['required']['total'],14)
        self.assertEqual(calculate({'requirements':[],'experience':'meets'})['score'],None)
    def test_short_fragment_does_not_cover_complete_requirement(self):
        a=assessment();a['requirements'][0]['job_quote']='Python'
        complete_inventory(a,'Required: Python service development.')
        self.assertEqual(len(a['requirements']),2)

    def test_flattened_source_lists_split_without_duplicate_paragraphs(self):
        text='Locations: Bengaluru Work mode: Hybrid Experience range: 2 to 6 years Job Description Required: Build Python services. Technical Skills Languages: Python (mandatory) Frameworks: LangChain, LangGraph, AutoGen Vector Databases: FAISS, Pinecone Qualifications Bachelors degree in Computer Science'
        rows=statements(text)
        self.assertTrue(any(r['quote']=='Frameworks: LangChain, LangGraph, AutoGen' for r in rows))
        self.assertTrue(all(r['quote'] in text for r in rows))
        self.assertFalse(any(r['quote'].startswith('Locations:') or len(r['quote'])>200 for r in rows))

    def test_work_style_is_not_proven_by_an_employer_name(self):
        a=assessment();a['requirements'].append({**a['requirements'][0],'requirement':'Hybrid work','job_quote':'Work mode: Hybrid'})
        result=validate_assessment(a,{**JOB,'description':JOB['description']+' Work mode: Hybrid'},RESUME,{'experience':2})
        self.assertEqual(result['qualification_fit']['required']['total'],2)

    def test_independent_pass_removes_unsupported_or_missing_checks(self):
        a=assessment();a['requirements']+=[{**a['requirements'][0],'requirement':'All tools in list','job_quote':'LangChain, LangGraph, AutoGen'}]
        def verify(schema,name,prompt):
            self.assertEqual(name,'qualification_verification')
            self.assertEqual(prompt['resume'],RESUME)
            return {'checks':[{'line_index':0,'faithful':True,'reason':'Evidence supports it.'}]}
        verify_qualification_support(a,JOB,RESUME,{},verify)
        self.assertEqual(a['requirements'][0]['status'],'supported')
        self.assertEqual(a['requirements'][1]['status'],'unknown')

if __name__=='__main__':unittest.main()
