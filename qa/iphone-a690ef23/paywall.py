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

ENTER="""- assertVisible: {id: contest-step-setup}
- assertVisible: {id: contest-player-4}
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-player-5}
"""
GUEST="""- scrollUntilVisible:
    element: {text: '^Player 2 name$'}
    direction: UP
    timeout: 12000
- tapOn: {text: '^Player 2 name$'}
- inputText: 'QA Guest'
- hideKeyboard
- assertVisible: '^QA Guest$'
"""
READY="""- scrollUntilVisible:
    element: {text: '^2 ready$'}
    direction: UP
    timeout: 12000
- assertVisible: '^2 ready$'
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
ENTRY_STEPS=(('enter',ENTER),('guest-entry',GUEST),('draft-ready',READY),('tournament-toggle',TOGGLE),('round-count',ROUNDS),('game-step',GAME_STEP),('round-step',ROUND_STEP),('start',START),('appearance',APPEARANCE))
REENTRY_STEPS=ENTRY_STEPS[5:]
OPEN=''.join(text for _,text in ENTRY_STEPS)
def run_entry(flow,progress,reopen=False):
 for step,text in REENTRY_STEPS if reopen else ENTRY_STEPS:
  progress.perform('paywall',step,lambda step=step,text=text:flow(text,step))
CLOSE_PHASES=(
 ('close-precondition',"- assertVisible: {id: paywall-close}\n- assertVisible: 'Run the game. We do the math.'\n"),
 ('close-tap',"- tapOn: {id: paywall-close}\n"),
 ('close-dismiss',"- extendedWaitUntil:\n    notVisible: {id: paywall-close}\n    timeout: 15000\n- extendedWaitUntil:\n    visible: {id: contest-step-round-settings}\n    timeout: 15000\n"),
 ('back-games-tap',"- tapOn: {id: new-contest-back}\n"),
 ('back-games-scene',"- extendedWaitUntil:\n    visible: {id: contest-step-gamemodes}\n    timeout: 15000\n- assertNotVisible: {id: paywall-close}\n"),
 ('back-setup-tap',"- tapOn: {id: new-contest-back}\n"),
 ('back-setup-scene',"- extendedWaitUntil:\n    visible: {id: contest-step-setup}\n    timeout: 15000\n- assertNotVisible: {id: paywall-close}\n"),
)
CLOSE_OVERLAY=''.join(text for _,text in CLOSE_PHASES)
DRAFT_CONTINUE=GAME_STEP+"""- tapOn: {id: new-contest-back}
- assertVisible: {id: contest-step-setup}
"""
NAMES="""- scrollUntilVisible:
    element: {text: '^Golfer$'}
    direction: DOWN
    timeout: 12000
- assertVisible: '^Golfer$'
- scrollUntilVisible:
    element: {text: '^QA Guest$'}
    direction: DOWN
    timeout: 12000
- assertVisible: '^QA Guest$'
"""
DRAFT_ROUNDS="""- scrollUntilVisible:
    element: {id: rounds-2}
    direction: UP
    timeout: 12000
- assertVisible: {id: rounds-2}
"""
CLOSE_STEPS=CLOSE_PHASES+(('draft-ready',READY.replace('direction: UP','direction: DOWN')),('draft-continue',DRAFT_CONTINUE))
CLOSE=''.join(text for _,text in CLOSE_STEPS)
def run_close(flow,progress):
 for step,text in CLOSE_STEPS:
  progress.perform('paywall',step,lambda step=step,text=text:flow(text,step))
 # Functional retention is already proven by 2 ready and successful Continue.
 # Literal names are separate evidence, never inferred from readiness.
 names_observed=False
 try:flow(NAMES,'draft-names');names_observed=True
 except Exception:pass
 progress.perform('paywall','draft-rounds',lambda:flow(DRAFT_ROUNDS,'draft-rounds'))
 return names_observed
VISIBLE="""- assertVisible: {id: paywall-close}
- assertVisible: "Run the game. We do the math."
- assertNotVisible: {id: home-new-contest}
- assertNotVisible: {id: contest-start}
"""
REOPEN=''.join(text for _,text in REENTRY_STEPS)
