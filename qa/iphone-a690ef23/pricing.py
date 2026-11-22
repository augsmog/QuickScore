"""Optional scrolled fallback sections; no purchase or plan-selection actions."""
import re
SECTIONS={
 'paywall-free':('Free','Current plan'),
 'paywall-td':('Tournament Director','$79.99/year'),
 'paywall-disabled':('Currently unavailable','Renews yearly. Cancel anytime.'),
}
FOREIGN={'home-new-contest','contest-start','contest-step-setup','contest-step-gamemodes','contest-step-round-settings'}
def section_scene(tree,section):
 labels=SECTIONS[section];texts=set();ids=set();disabled=False
 def walk(n):
  nonlocal disabled
  a=n.get('attributes',{});ids.add(a.get('resource-id'))
  values={a[k] for k in ('text','label','accessibilityText') if isinstance(a.get(k),str)}
  texts.update(values)
  is_disabled=a.get('enabled') is False or a.get('enabled')=='false'
  if 'Currently unavailable' in values and is_disabled:disabled=True
  for c in n.get('children',[]):walk(c)
 walk(tree)
 if ids.intersection(FOREIGN) or not set(labels)<=texts:raise ValueError('PAYWALL_SECTION_UNVERIFIED')
 if section=='paywall-disabled' and not disabled:raise ValueError('DISABLED_STATE_UNOBSERVED')
 return sorted(x for x in ids if isinstance(x,str))
def visible(section):
 # Maestro text matching is regex: anchor and escape every exact product label.
 def selector(text):return "    text: '"+('^'+re.escape(text)+'$').replace("'","''")+"'\n"
 return ''.join('- assertVisible:\n'+selector(t) for t in SECTIONS[section])+''.join('- assertNotVisible: {id: '+i+'}\n' for i in sorted(FOREIGN))
def reveal(section):
 text='^'+re.escape(SECTIONS[section][0])+'$'
 return "- scrollUntilVisible:\n    element:\n      text: '"+text+"'\n    direction: DOWN\n    timeout: 12000\n    visibilityPercentage: 100\n    centerElement: true\n"+visible(section)
RETURN_TOP='- scrollUntilVisible:\n    element: {id: paywall-close}\n    direction: UP\n    timeout: 12000\n    visibilityPercentage: 100\n- assertVisible: {id: paywall-close}\n- assertVisible: "Run the game. We do the math."\n'
def optional_sections(capture):
 results=[]
 for section in SECTIONS:
  try:capture(section);results.append({'section':section,'status':'captured'})
  except Exception:results.append({'section':section,'status':'unavailable','reason':'SECTION_VISIBILITY_OR_STATE_UNVERIFIED'})
 return results
