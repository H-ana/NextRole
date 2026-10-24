import assert from 'node:assert/strict';
import {resumePreview} from './dist/resume-preview.mjs';

const text='Alex Example\nalex@example.com | Bengaluru\nProfile\nAnalyst with SQL experience.\nExperience\nAnalyst, Example | 2022–2024\n- Automated reporting.\nEducation\nExample College\nComputer science and Mathematics (12th Grade)\nProjects\nReporting (Example)\n<script>alert("private")</script>';
const html=resumePreview(text);
assert.match(html,/<p class="resume-name">Alex Example<\/p>/);
assert.match(html,/<p class="resume-contact">alex@example.com \| Bengaluru<\/p>/);
assert.match(html,/<p class="resume-section">Profile<\/p>/);
assert.match(html,/<p class="resume-entry">Analyst, Example \| 2022–2024<\/p>/);
assert.match(html,/<p class="resume-bullet">- Automated reporting.<\/p>/);
assert.match(html,/<p class="resume-body">Computer science and Mathematics \(12th Grade\)<\/p>/);
assert.match(html,/<p class="resume-entry">Reporting \(Example\)<\/p>/);
assert.doesNotMatch(html,/<script>/);
const shown=[...html.matchAll(/<p class="resume-(?:name|contact|section|entry|bullet|body)">([\s\S]*?)<\/p>/g)].map(m=>m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join('\n');
assert.equal(shown,text,'Formatting must preserve all source text and escape markup');
console.log('Passed: visual hierarchy preserves resume text, distinguishes entries and bullets, and escapes untrusted markup.');
