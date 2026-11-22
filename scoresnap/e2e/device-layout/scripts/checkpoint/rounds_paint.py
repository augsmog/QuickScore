"""Exact source-palette rounds observer, only within the guarded capture transaction."""
from collections import Counter
import pathlib,hashlib
import android_capture as b
import exercised_flow as f
PRIMARY=(23,92,58); PAPER=(250,244,232); BORDER=(227,217,198)
FILL=tuple(round((32*x+223*y)/255) for x,y in zip(PRIMARY,PAPER))

def source_policy(repo):
    root=pathlib.Path(repo)
    theme=(root/'scoresnap/src/ui/theme.ts').read_text()
    for key,value in [('primary','#175C3A'),('bg','#FAF4E8'),('surfaceLow','#FAF4E8'),('border','#E3D9C6')]:
        if f'{key}: "{value}"' not in theme: raise b.Failure('rounds-source-palette')
    source=(root/'scoresnap/app/contest/new.tsx').read_text()
    for fragment in ['testID={`rounds-${n}`}','borderColor: numRounds === n ? COLORS.primary : COLORS.border',
      'backgroundColor: numRounds === n ? COLORS.primary + "20" : COLORS.surfaceLow','{[2, 3, 4].map((n) => (']:
        if source.count(fragment)!=1: raise b.Failure('rounds-source-style')

def pixels(png):
    (w,h),channels,data=b.png_dimensions(png,raw=True)
    stride=w*channels;prior=bytearray(stride);rows=[];at=0
    for _ in range(h):
        mode=data[at];at+=1;row=bytearray(data[at:at+stride]);at+=stride
        if mode>4:raise b.Failure('screenshot-filter')
        for i in range(stride):
            a=row[i-channels] if i>=channels else 0;c=prior[i-channels] if i>=channels else 0;up=prior[i]
            if mode==1:predict=a
            elif mode==2:predict=up
            elif mode==3:predict=(a+up)//2
            elif mode==4:
                p=a+up-c;pa,pb,pc=abs(p-a),abs(p-up),abs(p-c)
                predict=a if pa<=pb and pa<=pc else up if pb<=pc else c
            else:predict=0
            row[i]=(row[i]+predict)&255
        if channels==4 and any(row[i]!=255 for i in range(3,stride,4)):raise b.Failure('screenshot-alpha')
        rows.append(row);prior=row
    return w,h,lambda x,y:tuple(rows[y][x*channels:x*channels+3])

def classify(png,bounds):
    w,h,pixel=pixels(png);states=[]
    if len(bounds)!=3:raise b.Failure('rounds-bounds')
    for l,t,r,bot in bounds:
        if not 0<=l<r<=w or not 0<=t<bot<=h or min(r-l,bot-t)<8:raise b.Failure('rounds-bounds')
        # Exact palette, no RGB tolerance. Interior fill must exceed half the
        # full control area (not a few sampled glyph/coordinate pixels).
        counts=Counter(pixel(x,y) for y in range(t,bot) for x in range(l,r));area=(r-l)*(bot-t)
        state='selected' if counts[FILL]>area/2 else 'unselected' if counts[PAPER]>area/2 else None
        if state is None:raise b.Failure('rounds-fill-unreadable')
        edge=PRIMARY if state=='selected' else BORDER
        opposite=BORDER if state=='selected' else PRIMARY
        # Each edge's perpendicular quarter-depth ray must encounter the exact
        # border. This avoids rounded corners and center labels. No free coords:
        # all rays derive only from independently verified control bounds.
        cx=(l+r)//2;cy=(t+bot)//2
        rays=[[(cx,y) for y in range(t,t+(bot-t)//4)],[(cx,y) for y in range(bot-(bot-t)//4,bot)],
              [(x,cy) for x in range(l,l+(r-l)//4)],[(x,cy) for x in range(r-(r-l)//4,r)]]
        for ray in rays:
            colors={pixel(x,y) for x,y in ray}
            if edge not in colors or opposite in colors:raise b.Failure('rounds-border-unreadable')
        states.append(state)
    if states.count('selected')!=1:raise b.Failure('rounds-selection-ambiguous')
    return states.index('selected')+2

def observe(xml,png,binding,expected):
    root=f.tree(xml.decode('utf8','strict'),b.PACKAGE);f.validate(root,'rounds');proof={}
    _,controls=f.tournament_controls(root,b.PACKAGE,True,proof)
    if b.png_dimensions(png)!=tuple(binding['pixel_size']):raise b.Failure('rounds-viewport')
    selected=classify(png,[f.box(n) for n in controls[1:]])
    native=proof.get('observedSelectedRoundCount')
    if selected!=expected or native not in (None,selected):raise b.Failure('rounds-selection-mismatch')
    return {'selectedCount':selected,'method':'exact-source-border-and-fill','pngSha256':b.digest(png),
            'hierarchySha256':b.digest(xml),'nativeSelectedCount':native,'nativeAcceptance':False}
