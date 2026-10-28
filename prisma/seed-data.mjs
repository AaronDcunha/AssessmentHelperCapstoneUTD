import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function stableId(key) {
  const h = createHash('sha256').update(`assessment-helper-demo-v1:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

export function rolesFor(username) {
  const bucket = createHash('sha256').update(`roles-v1:${username}`).digest().readUInt32BE(0) % 100;
  return ['Faculty', ...(bucket < 12 ? ['AC'] : []), ...(bucket < 2 ? ['Admin'] : [])];
}

export const facultyPermissions = [
  'profile.read.own', 'evaluation-status.read.own', 'course-sections.read.own',
  'signups.create.own', 'signups.read.own', 'observations.read.own',
  'recommendations.read.released.own', 'invitations.send.own', 'invitations.respond.own',
  'observer.select.own', 'late-acceptance.request.own', 'assessment.read.own',
  'assessment.submit.own', 'assessment.acknowledge.own', 'feedback.submit.own',
  'feedback.read.own', 'notifications.read.own', 'notifications.update.own',
];
export const acPermissions = [
  'cycles.read', 'cycles.manage', 'signups.read', 'observations.read',
  'recommendations.generate', 'recommendations.release', 'recommendations.regenerate',
  'late-acceptance.review', 'templates.read', 'templates.manage',
  'assessments.read', 'reports.read', 'metrics.read', 'notifications.send',
];
export const adminPermissions = [
  'users.read', 'users.manage', 'roles.read', 'roles.manage',
  'permissions.read', 'roles.assign', 'role-permissions.manage',
  'hiring-levels.read', 'hiring-levels.manage',
];
export const rolePermissions = {
  Faculty: facultyPermissions,
  AC: [...facultyPermissions, ...acPermissions],
  Admin: [...facultyPermissions, ...acPermissions, ...adminPermissions],
};

export function normalizeTitle(title) {
  return title.split(/\s+-\s+/)[0].replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

export function termOrder(term) {
  if (!/^\d{2}[suf]$/.test(term)) throw new Error(`Invalid term: ${term}`);
  return Number(term.slice(0,2)) * 10 + { s: 1, u: 2, f: 3 }[term[2]];
}

function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(value);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2]) > 59) throw new Error(`Invalid time: ${value}`);
  return `${String(Number(m[1]) % 12 + (m[3] === 'pm' ? 12 : 0)).padStart(2,'0')}:${m[2]}`;
}

export function buildSeed() {
  const source = JSON.parse(readFileSync(new URL('./data/coursebook_with_hiring_levels.json', import.meta.url), 'utf8'));
  if (source.sections.length !== source.row_count) throw new Error('Source row count mismatch');
  const tables = Object.fromEntries(['department','hiring_level','semester','course','app_user','professor','course_section','teaches','class_meeting'].map(k => [k, new Map()]));
  const add = (table, key, row) => { if (!tables[table].has(key)) tables[table].set(key, row); return tables[table].get(key); };
  for (const [name, years] of [['Assistant Professor',1],['Associate Professor',2],['Full Professor',2]]) {
    add('hiring_level',name,{hiring_level_id:stableId(`rank:${name}`),level_name:name,evaluation_interval_years:years});
  }
  const titles = new Map(), accounts = [], usernames = new Set(), emails = new Set(), sectionKeys = new Set();
  let skipped = 0;
  for (const r of source.sections) {
    if (!r.instructor?.trim() || !r.days?.trim() || !r.time?.trim() || /^\d{4}-/.test(r.days)) { skipped++; continue; }
    const order = termOrder(r.term);
    if (!tables.hiring_level.has(r.hiring_level)) throw new Error(`Invalid hiring level: ${r.hiring_level}`);
    const departmentId = stableId(`department:${r.department}`);
    add('department',r.department,{department_id:departmentId,department_name:r.department});
    const semesterId = stableId(`semester:${r.term}`);
    // User-supplied demo boundaries; other semesters remain unconfigured.
    add('semester',r.term,{semester_id:semesterId,term_code:r.term,term_name:`${{s:'Spring',u:'Summer',f:'Fall'}[r.term[2]]} 20${r.term.slice(0,2)}`,starts_on:r.term === '26f' ? '2026-08-31' : null,ends_on:r.term === '26f' ? '2026-12-16' : null});
    const courseKey = `${r.department}:${r.course_code}`, title = normalizeTitle(r.course_title);
    const previous = titles.get(`${courseKey}:${r.term}`);
    if (previous && previous !== title) throw new Error(`Conflicting titles within term: ${courseKey} ${r.term}`);
    titles.set(`${courseKey}:${r.term}`,title);
    const courseId = stableId(`course:${courseKey}`);
    const course = add('course',courseKey,{course_id:courseId,department_id:departmentId,course_code:r.course_code,course_title:title,course_level:Number(r.course_code[0]) * 1000});
    if (!Number.isInteger(course.course_level)) throw new Error(`Invalid course level: ${courseKey}`);
    if (order >= (titles.get(courseKey) ?? -1)) { course.course_title = title; titles.set(courseKey,order); }
    const username = r.instructor.toLowerCase().trim().replace(/\s+/g,'_');
    const email = username.replaceAll('_','.') + '@fakeutd.edu';
    const userId = stableId(`user:${username}`), professorId = stableId(`professor:${username}`);
    if (!tables.app_user.has(r.instructor)) {
      if (usernames.has(username) || emails.has(email)) throw new Error(`Account collision: ${username}`);
      usernames.add(username); emails.add(email);
      accounts.push({fullName:r.instructor,username,email,userId,roles:rolesFor(username)});
    }
    add('app_user',r.instructor,{user_id:userId,full_name:r.instructor,username,email,is_active:true});
    const professor = add('professor',r.instructor,{professor_id:professorId,user_id:userId,department_id:departmentId,hiring_level_id:stableId(`rank:${r.hiring_level}`)});
    if (professor.hiring_level_id !== stableId(`rank:${r.hiring_level}`)) throw new Error(`Inconsistent rank: ${username}`);
    const sectionKey = `${r.term}:${courseKey}:${r.section_id}`, sectionId = stableId(`section:${sectionKey}`);
    if (sectionKeys.has(sectionKey)) throw new Error(`Duplicate section: ${sectionKey}`);
    sectionKeys.add(sectionKey);
    add('course_section',sectionKey,{section_id:sectionId,course_id:courseId,semester_id:semesterId,section_code:r.section_id});
    add('teaches',sectionKey,{professor_id:professorId,section_id:sectionId});
    const parts = r.time.split(' - ');
    if (parts.length !== 2) throw new Error(`Invalid time range: ${r.time}`);
    const startTime = parseTime(parts[0]), endTime = parseTime(parts[1]);
    if (startTime >= endTime) throw new Error(`Invalid time order: ${r.time}`);
    for (const day of r.days.split(/\s*(?:&|,)\s*/)) {
      if (!['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(day)) throw new Error(`Invalid day: ${day}`);
      const key = `${sectionKey}:${day}:${startTime}:${endTime}`;
      add('class_meeting',key,{meeting_id:stableId(`meeting:${key}`),section_id:sectionId,day_of_week:day,start_time:startTime,end_time:endTime,location:r.location?.trim() || null});
    }
  }
  accounts.sort((a,b) => a.username < b.username ? -1 : a.username > b.username ? 1 : 0);
  for (const role of ['Faculty','Admin','AC']) if (!accounts.some(a => a.roles.includes(role))) throw new Error(`No demo account for ${role}`);
  const rows = Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,[...v.values()]]));
  const semester = tables.semester.get('26f');
  if (!semester) throw new Error('Fall 2026 semester is missing from the retained source data');
  rows.evaluation_cycle = [{
    cycle_id: stableId('cycle:26f'),
    semester_id: semester.semester_id,
    cycle_name: 'Fall 2026',
    // Explicit Chicago offsets: October is daylight time; November/December are standard time.
    signup_deadline: new Date('2026-10-31T23:59:00-05:00').toISOString(),
    observation_deadline: new Date('2026-11-30T23:59:00-06:00').toISOString(),
    feedback_deadline: new Date('2026-12-07T23:59:00-06:00').toISOString(),
  }];
  const templateId = stableId('template:basic-classroom-observation-v1');
  rows.observation_template = [{
    template_id: templateId,
    template_name: 'Basic Classroom Observation',
    description: 'Rate each statement: 1 = strongly disagree, 2 = disagree, 3 = neither agree nor disagree, 4 = agree, 5 = strongly agree. All rating questions have equal weight. Written comments are optional.',
    is_active: true,
    status: 'published',
    published_at: '2026-10-19T00:00:00.000Z',
  }];
  rows.template_criterion = [
    ['objectives', 'The instructor communicated clear learning objectives.', 'RATING', true],
    ['organization', 'The instruction was well organized and easy to follow.', 'RATING', true],
    ['engagement', 'The instructor encouraged student engagement.', 'RATING', true],
    ['understanding', 'The instructor checked students\' understanding during the lesson.', 'RATING', true],
    ['strengths', 'What were the main strengths of the instruction?', 'TEXT', false],
    ['improvements', 'What improvements would you suggest?', 'TEXT', false],
  ].map(([key, text, type, required], index) => ({
    criterion_id: stableId(`criterion:basic-classroom-observation-v1:${key}`),
    criterion_key: key,
    options: type === 'RATING' ? JSON.stringify([
      {value:1,label:'Strongly disagree'}, {value:2,label:'Disagree'},
      {value:3,label:'Neither agree nor disagree'}, {value:4,label:'Agree'}, {value:5,label:'Strongly agree'},
    ]) : null,
    template_id: templateId,
    criterion_text: text,
    question_type: type,
    min_rating: type === 'RATING' ? 1 : null,
    max_rating: type === 'RATING' ? 5 : null,
    weight: 1,
    is_required: required,
    display_order: index + 1,
  }));
  return {tables:rows,accounts,skipped};
}
