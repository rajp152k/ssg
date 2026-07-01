const fs = require('fs');

function fail(message) {
  console.error(`[validation failed] ${message}`);
  process.exit(1);
}

const plan = fs.readFileSync('plan.md', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

const requiredPlanSections = [
  '# SSG Plan (v0.1)',
  '## Goals',
  '## What "SSG basics" we need first',
  '## Recommended first implementation (MVP)',
  '## Long-term differentiator',
];

const missingSections = requiredPlanSections.filter((section) => !plan.includes(section));
if (missingSections.length > 0) {
  fail(`Missing required sections in plan.md: ${missingSections.join(', ')}`);
}

if (!readme.includes('# ssg')) {
  fail('README.md should start with the project title');
}

const sectionCount = plan.split('\n').filter((line) => line.startsWith('##')).length;
if (sectionCount < 8) {
  fail(`plan.md expected at least 8 second-level sections, found ${sectionCount}`);
}

if (!/### 1\) Input model/.test(plan)) {
  fail('Plan should define Input model section with details');
}

console.log('Plan and README validation passed.');
