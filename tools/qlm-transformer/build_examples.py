import json
from pathlib import Path
root=Path(__file__).parent
platforms=['khan_academy','mathia','ixl','dreambox','aleks']
for platform in platforms:
    profile={'platform':platform,'status':'synthetic_template_requires_real_export_mapping','mode':'summary',
             'fields':{'subject_id':'student_id','activity_id':'activity'},
             'metrics':{'vendor_reported_score':'reported_score','vendor_reported_usage':'reported_usage'}}
    if platform=='mathia':
        profile['fields']={'subject_id':'Student Number','activity_id':'Current Workspace'}
        profile['metrics']={'vendor_average_performance_score':'Average Performance Score','workspace_time_hms':'Total Workspace Time (HH:MM:SS)'}
        rows=[{'Student Number':'demo-student-001','Current Workspace':'Linear equations','Average Performance Score':'0.8','Total Workspace Time (HH:MM:SS)':'00:15:00'}]
    else:
        rows=[{'student_id':'demo-student-001','activity':'fractions','reported_score':'80','reported_usage':'15 minutes'}]
    (root/'profiles'/f'{platform}.json').write_text(json.dumps(profile,indent=2)+'\n')
    (root/'examples'/f'{platform}.json').write_text(json.dumps(rows,indent=2)+'\n')
events={'mode':'events','fields':{'subject_id':'student_id','time':'time','event_type':'kind','activity_id':'task','response':'answer','scaffold_type':'support_type'},'event_types':{'answer':'response','ask':'help_requested','hint_shown':'scaffold_provided'},'scaffold_actor':{'role':'instructor','kind':'software','id':'demo-tutor'}}
(root/'profiles'/'explicit_events.json').write_text(json.dumps(events,indent=2)+'\n')
rows=[{'student_id':'demo-student-001','time':'2026-10-08T12:00:00Z','kind':'ask','task':'fractions'}, {'student_id':'demo-student-001','time':'2026-10-08T12:00:01Z','kind':'hint_shown','task':'fractions','support_type':'hint'}, {'student_id':'demo-student-001','time':'2026-10-08T12:00:02Z','kind':'answer','task':'fractions','answer':'1/2'}]
(root/'examples'/'explicit_events.json').write_text(json.dumps(rows,indent=2)+'\n')
