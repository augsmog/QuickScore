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

ENTER="""- assertVisible: {id: home-new-contest}
- tapOn: {id: home-new-contest}
- assertVisible: {id: contest-step-setup}
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-player-2}
"""
HOST="""- scrollUntilVisible:
    element: {id: contest-player-0}
    direction: DOWN
    timeout: 12000
- assertVisible:
    id: contest-player-0
    containsDescendants:
      - text: '^Golfer$'
"""
GUEST="""- scrollUntilVisible:
    element: {text: '^Player 2 name$'}
    direction: DOWN
    timeout: 12000
- assertVisible:
    id: contest-player-1
    containsDescendants:
      - text: '^Player 2 name$'
- tapOn: {text: '^Player 2 name$'}
- inputText: 'QA Guest'
- hideKeyboard
- assertVisible:
    id: contest-player-1
    containsDescendants:
      - text: '^QA Guest$'
"""
TOGGLE="""- scrollUntilVisible:
    element: {id: tournament-toggle}
    direction: UP
    timeout: 12000
- tapOn: {id: tournament-toggle}
"""
ROUNDS="""- scrollUntilVisible:
    element: {id: rounds-2}
    direction: DOWN
    timeout: 12000
- assertVisible: {id: rounds-2}
- tapOn: {id: rounds-2}
"""
GAME_STEP="""- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-gamemodes}
"""
ROUND_STEP="""- tapOn: {id: contest-continue}
- assertVisible: {id: contest-step-round-settings}
"""
START="""- assertVisible: {id: contest-step-round-settings}
- tapOn: {id: contest-start}
"""
APPEARANCE="""- extendedWaitUntil:
    visible: {id: paywall-close}
    timeout: 15000
- assertVisible: 'Run the game. We do the math.'
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-start}
"""
ENTRY_STEPS=(('enter',ENTER),('host-prefill',HOST),('guest-entry',GUEST),('tournament-toggle',TOGGLE),('round-count',ROUNDS),('game-step',GAME_STEP),('round-step',ROUND_STEP),('start',START),('appearance',APPEARANCE))
REENTRY_STEPS=ENTRY_STEPS[5:]
OPEN=''.join(text for _,text in ENTRY_STEPS)
def run_entry(flow,progress,reopen=False):
 for step,text in REENTRY_STEPS if reopen else ENTRY_STEPS:
  progress.perform('paywall',step,lambda step=step,text=text:flow(text,step))
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
    element: {text: '^Golfer$'}
    direction: DOWN
    timeout: 12000
- assertVisible:
    id: contest-player-0
    containsDescendants:
      - text: '^Golfer$'
- scrollUntilVisible:
    element: {text: '^QA Guest$'}
    direction: DOWN
    timeout: 12000
- assertVisible:
    id: contest-player-1
    containsDescendants:
      - text: '^QA Guest$'
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
REOPEN=''.join(text for _,text in REENTRY_STEPS)
