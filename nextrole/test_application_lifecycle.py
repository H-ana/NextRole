"""Synthetic lifecycle tests; no Gmail or applicant data."""
import sqlite3
import time
import unittest
from application_lifecycle import initialize,lifecycle_event,ingest,records,update_details
from recruiter_mail import classify_message
from test_gmail_notifications import message

EMAIL='applicant@example.com'
def mail(body,number=1,thread='aabbccddeeff',reference='R-123',company='Acme Labs',role='Software Engineer',seconds=0):
    return message(f'Company: {company}\nRole: {role}\n'+(f'Job ID: {reference}\n' if reference else '')+body,id=f'{number:012x}',threadId=thread,internalDate=str(int((time.time()+seconds)*1000)))

class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;initialize(self.db)
    def tearDown(self):self.db.close()
    def add(self,body,**kwargs):
        event=lifecycle_event(mail(body,**kwargs),own_email=EMAIL)
        self.assertIsNotNone(event);ingest(self.db,EMAIL,event);return event
    def test_full_journey_and_referral_without_mark_applied(self):
        self.add('I have referred you for this job.',number=1,seconds=-50)
        self.add('Thank you for applying.',number=2,seconds=-40)
        self.add('Please complete the technical assessment.',number=3,seconds=-30)
        self.add('We invite you to an interview.',number=4,seconds=-20)
        self.add('Your offer of employment is attached.',number=5,seconds=-10)
        app=records(self.db,EMAIL)[0]
        self.assertEqual(app['status'],'Offer');self.assertTrue(app['referred']);self.assertEqual(len(app['events']),5)
        self.assertEqual(app['referrers'],['Recruiter']);self.assertEqual(app['reference'],'R-123')
    def test_referrals_positive_but_rejections_timeline_only(self):
        self.assertEqual(classify_message(mail('Your employee referral has been submitted.'))['category'],'Referral confirmed')
        rejected=mail('We regret to inform you that your application was rejected.')
        self.assertIsNone(classify_message(rejected));event=lifecycle_event(rejected);self.assertEqual(event['category'],'Rejected')
        ingest(self.db,EMAIL,event);self.assertEqual(records(self.db,EMAIL)[0]['status'],'Rejected')
        for text in ["You've been referred for the role.",'Your referral for this job has been received.','Alex has referred you for this position.']:
            self.assertEqual(classify_message(mail(text))['category'],'Referral confirmed')
    def test_dedup_and_arrival_order_do_not_regress_status(self):
        self.add('Your offer of employment is attached.',number=1,seconds=-30)
        self.add('Please share your resume for this role.',number=2,seconds=-10)
        self.add('Your offer of employment is attached.',number=1,seconds=-30)
        app=records(self.db,EMAIL)[0];self.assertEqual(len(app['events']),2);self.assertEqual(app['status'],'Offer')
    def test_distinct_roles_and_job_ids_not_merged(self):
        self.add('We invite you to an interview.',number=1)
        self.add('We invite you to an interview.',number=2,reference='R-456')
        self.add('We invite you to an interview.',number=3,role='Data Analyst',reference='R-789')
        self.assertEqual(len(records(self.db,EMAIL)),3)
    def test_account_isolation_and_details_guard(self):
        self.add('We invite you to an interview.')
        self.assertEqual(records(self.db,'other@example.com'),[])
        app=records(self.db,EMAIL)[0]
        with self.assertRaises(ValueError):update_details(self.db,'other@example.com',{'id':app['id'],'company':'Wrong','role':'Wrong'})
    def test_forwarded_history_own_mail_and_conditional_referrals_not_events(self):
        for body in ['If you have been referred for this job, please wait.','I will refer you for the job.','Your referral bonus is available.', 'Thank you.\n---------- Forwarded message ---------\nI have referred you for the job.']:
            with self.subTest(body=body):self.assertIsNone(lifecycle_event(mail(body)))
        own=mail('We invite you to an interview.');self.assertIsNone(lifecycle_event(own,own_email='hiring@acme.example'))
    def test_pending_thread_can_gain_explicit_context(self):
        raw=message('We invite you to an interview.',subject='Next round');event=lifecycle_event(raw)
        ingest(self.db,EMAIL,event);self.assertTrue(records(self.db,EMAIL)[0]['needs_details'])
        follow=mail('Your offer of employment is attached.',thread=raw['threadId'],number=2)
        ingest(self.db,EMAIL,lifecycle_event(follow));apps=records(self.db,EMAIL)
        self.assertEqual(len(apps),1);self.assertFalse(apps[0]['needs_details']);self.assertEqual(apps[0]['status'],'Offer')
    def test_no_body_storage_and_manual_context_correction(self):
        self.add('We invite you to an interview. BODY-ONLY-CANARY')
        app=records(self.db,EMAIL)[0];self.assertNotIn('BODY-ONLY-CANARY',str(app))
        update_details(self.db,EMAIL,{'id':app['id'],'company':'Acme Labs','role':'Backend Engineer','reference':'R-999'})
        self.assertEqual(records(self.db,EMAIL)[0]['role'],'Backend Engineer')
    def test_later_rejection_then_genuine_reopening(self):
        self.add('Your offer of employment is attached.',number=1,seconds=-30)
        self.add('Your application was rejected.',number=2,seconds=-20)
        self.assertEqual(records(self.db,EMAIL)[0]['status'],'Rejected')
        self.add('We invite you to an interview.',number=3,seconds=-10)
        self.assertEqual(records(self.db,EMAIL)[0]['status'],'Interview')

if __name__=='__main__':unittest.main()
