"""Ordinary free TD draft route only; no purchases, providers or deep links."""
HEADER='Run the game. We do the math.'
def scene(tree):
 ids=set();texts=set()
 def walk(n):
  a=n.get('attributes',{});ids.add(a.get('resource-id'));texts.update(a.get(k) for k in ['text','label','accessibilityText'] if isinstance(a.get(k),str))
  for child in n.get('children',[]):walk(child)
 walk(tree)
 if 'paywall-close' not in ids or HEADER not in texts or ids.intersection({'home-new-contest','contest-start','contest-step-setup','contest-step-round-settings'}):raise ValueError('PAYWALL_SCENE_REQUIRED')
 return True

OPEN="""- assertVisible: {id: home-new-contest}
- tapOn: {id: home-new-contest}
- assertVisible: {id: contest-step-setup}
- assertNotVisible: {id: home-new-contest}
- scrollUntilVisible:
    element: {text: '^Your name$'}
    direction: DOWN
    timeout: 12000
- tapOn: 'Your name'
- eraseText: 100
- inputText: 'QA Host'
- scrollUntilVisible:
    element: {text: '^Player 2 name$'}
    direction: DOWN
    timeout: 12000
- tapOn: 'Player 2 name'
- inputText: 'QA Guest'
- hideKeyboard
- scrollUntilVisible:
    element: {id: tournament-toggle}
    direction: UP
    timeout: 12000
- tapOn: {id: tournament-toggle}
- scrollUntilVisible:
    element: {id: rounds-2}
    direction: DOWN
    timeout: 12000
- assertVisible: {id: rounds-2}
- tapOn: {id: rounds-2}
- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-gamemodes}
- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-round-settings}
- tapOn: {id: contest-start}
- extendedWaitUntil:
    visible: {id: paywall-close}
    timeout: 15000
- assertVisible: 'Run the game. We do the math.'
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-start}
"""
CLOSE="""- assertVisible: {id: paywall-close}
- assertVisible: 'Run the game. We do the math.'
- tapOn: {id: paywall-close}
- assertNotVisible: {id: paywall-close}
- assertVisible: {id: contest-step-round-settings}
- tapOn: {id: new-contest-back}
- assertVisible: {id: contest-step-gamemodes}
- tapOn: {id: new-contest-back}
- assertVisible: {id: contest-step-setup}
- scrollUntilVisible:
    element: {text: '^QA Host$'}
    direction: DOWN
    timeout: 12000
- assertVisible: 'QA Host'
- scrollUntilVisible:
    element: {text: '^QA Guest$'}
    direction: DOWN
    timeout: 12000
- assertVisible: 'QA Guest'
- scrollUntilVisible:
    element: {id: rounds-2}
    direction: UP
    timeout: 12000
- assertVisible: {id: rounds-2}
"""
VISIBLE="""- assertVisible: {id: paywall-close}
- assertVisible: "Run the game. We do the math."
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-start}
"""
REOPEN="""- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-gamemodes}
- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-round-settings}
- tapOn: {id: contest-start}
- extendedWaitUntil:
    visible: {id: paywall-close}
    timeout: 15000
- assertVisible: 'Run the game. We do the math.'
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-start}
"""
