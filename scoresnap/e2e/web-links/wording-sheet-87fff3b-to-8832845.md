Total: 145 wording entries (W1 to W145). HEAD commit: 8832845f37e6b8f0a32fbec5a1dfdba8dcc22705. New text between 87fff3b and HEAD.

# SnapScore wording sheet

How to read this: words in {braces} are filled in by the app (a player name, a hole number, an amount); one filled-in example follows in brackets. A "/" between two quoted texts means the same spot shows one or the other. "(screen reader only)" lines are never seen on screen; they are read aloud to people using VoiceOver or TalkBack.

## 1. Website: home page "Join a round" box

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W1 | Website home page, "Join a round" box | Always shown on the home page | "Join a round" | scoresnap/site/index.html:102<br>scoresnap/src/web/public-pages.ts:136 |
| W2 | Website home page, "Join a round" box, under the heading | Always | "Enter the code from the organizer to follow the round live. No app or account needed." | scoresnap/site/index.html:103<br>scoresnap/src/web/public-pages.ts:137 |
| W3 | Website home page, label above the code box | Always | "Round code" | scoresnap/site/index.html:104<br>scoresnap/src/web/public-pages.ts:138 |
| W4 | Website home page, button under the code box | Always | "Watch the round" | scoresnap/site/index.html:106<br>scoresnap/src/web/public-pages.ts:140 |

## 2. Website: player link page (pick who you are, scorecard, messages)

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W5 | Player link page, browser tab title | Always | "Keep score · SnapScore" | scoresnap/app/p/[token].tsx:49 |
| W6 | Player link page, small brand line at the top (same on the watch-by-code page) | Always | "SNAPSCORE" | scoresnap/app/p/[token].tsx:50<br>scoresnap/src/ui/WatchByCode.tsx:50 |
| W7 | Player link page, big title | Before the round has loaded (afterwards the round's own name shows here) | "Keep score" | scoresnap/app/p/[token].tsx:51 |
| W8 | Player link page (same line on the watch-by-code page) | While the round is loading | "Opening the round…" | scoresnap/app/p/[token].tsx:56<br>scoresnap/src/ui/WatchByCode.tsx:60 |
| W9 | Player link page, before picking a name | Round is open and nobody has been picked on this phone yet | "Who are you?" | scoresnap/app/p/[token].tsx:61 |
| W10 | Player link page, before picking a name, under "Who are you?" | Same | "You will keep the card for your whole group. No account needed." | scoresnap/app/p/[token].tsx:62 |
| W11 | Player link page, before picking a name | The round has no players placed in a group | "No players are in a group yet. Ask the organizer." | scoresnap/app/p/[token].tsx:69 |
| W12 | Player link page, line above the scorecard | After picking a name | "Scoring as {player}" (e.g. "Scoring as Dana"); if the name cannot be found: "Scoring as your group" | scoresnap/app/p/[token].tsx:75 |
| W13 | Player link page, link next to "Scoring as…" | After picking a name | "Not you?" | scoresnap/app/p/[token].tsx:76 |
| W14 | Bottom of every guest web page: player link page, spectator link page, watch-by-code page | Always | "Set up your own games and settle up in the SnapScore app." | scoresnap/app/p/[token].tsx:81<br>scoresnap/app/r/[token].tsx:69<br>scoresnap/src/ui/WatchByCode.tsx:67 |
| W15 | Player link page, the two tabs above the card | After picking a name | "Scorecard" and "Leaderboard" | scoresnap/src/ui/GuestGroupCard.tsx:143 |
| W16 | Player link page, where the card will appear | While the card is loading | "Loading the round…" | scoresnap/src/ui/GuestGroupCard.tsx:71 |
| W17 | Player link page, Scorecard tab | The picked player is not in a group | "Your player is not in a group yet. Ask the organizer." | scoresnap/src/ui/GuestGroupCard.tsx:148 |
| W18 | Player link page, Scorecard tab, line above the hole | Card showing | "{round name} · {group name}" (e.g. "Round 1 · Group A"). If the group has no name: "Your group". When scoring is switched off mid-round it adds " · scoring paused" (e.g. "Round 1 · Group A · scoring paused") | scoresnap/src/ui/GuestGroupCard.tsx:150<br>scoresnap/src/services/player-link.ts:119 |
| W19 | Player link page, Scorecard tab, hole bar | Card showing | "Hole {n}" (e.g. "Hole 7") and under it "Par {n}" (e.g. "Par 4") | scoresnap/src/ui/GuestGroupCard.tsx:167<br>scoresnap/src/ui/GuestGroupCard.tsx:168 |
| W20 | Player link page, hole bar arrows "‹" and "›" | Card showing | "Previous hole" and "Next hole" **(screen reader only)** | scoresnap/src/ui/GuestGroupCard.tsx:165<br>scoresnap/src/ui/GuestGroupCard.tsx:170 |
| W21 | Player link page, small line under each player's name | Player has scores on the card | "{total} so far" (e.g. "38 so far") | scoresnap/src/ui/GuestGroupCard.tsx:183 |
| W22 | Player link page, small line under each player's name | Player has no scores yet | "No scores yet" | scoresnap/src/ui/GuestGroupCard.tsx:183 |
| W23 | Player link page, where a player's score for the hole shows | No score entered for this hole | "–" (a dash) | scoresnap/src/ui/GuestGroupCard.tsx:187 |
| W24 | Player link page, minus button next to a player | Card showing | "One fewer for {player}" (e.g. "One fewer for Dana") **(screen reader only)** | scoresnap/src/ui/GuestGroupCard.tsx:185 |
| W25 | Player link page, plus button next to a player | Card showing | If a score is already entered: "One more for {player}" (e.g. "One more for Dana"). If not: "Enter par for {player}" (e.g. "Enter par for Dana") **(screen reader only)** | scoresnap/src/ui/GuestGroupCard.tsx:188 |
| W26 | Player link page, the score number next to a player | Card showing | "{player}, hole {n}: {score}" (e.g. "Dana, hole 7: 5"); with no score: "Dana, hole 7: no score" **(screen reader only)** | scoresnap/src/ui/GuestGroupCard.tsx:187 |
| W27 | Player link page, hint under the card | Card showing | "Tap + to enter par, then adjust. Scores save as you tap." | scoresnap/src/ui/GuestGroupCard.tsx:192 |
| W28 | Player link page, message box above the card | Someone else changed the same hole at the same moment (round still in play, or while fixing a finalized round) | "Hole {n} was just changed on another device. Showing the latest score; change it again if it is wrong." (e.g. "Hole 7 was just changed on another device. …") | scoresnap/src/ui/GuestGroupCard.tsx:94<br>scoresnap/src/ui/GuestGroupCard.tsx:109 |
| W29 | Player link page, message box above the card | The server refused a score because that player is not in this scorer's group | "That score was not accepted. You can only score your own group." | scoresnap/src/ui/GuestGroupCard.tsx:112 |

## 3. Website: leaderboard and money

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W30 | Leaderboard (player link page Leaderboard tab, spectator link page, watch-by-code page), each row | Player has played at least one hole | Position number, name, "thru {n}" (e.g. "thru 9"), and score to par: "E" for even, "+{n}" over (e.g. "+2"), "-{n}" under (e.g. "-1") | scoresnap/src/ui/RoundBoard.tsx:16<br>scoresnap/src/ui/RoundBoard.tsx:6 |
| W31 | Leaderboard, each row | Player has not played a hole yet | Position shows "–" (a dash) and the row says "not started" | scoresnap/src/ui/RoundBoard.tsx:16<br>scoresnap/src/ui/RoundBoard.tsx:14 |
| W32 | Leaderboard, heading above the money section | The round has money games | "Money" | scoresnap/src/ui/RoundBoard.tsx:20 |
| W33 | Leaderboard, money section | Not enough scores yet to work out the money | "Money shows once the games have enough scores." | scoresnap/src/ui/RoundBoard.tsx:21 |
| W34 | Leaderboard, money section, one row per player | Money can be worked out | "{player}" then the amount: ahead "+${amount}" (e.g. "+$10.00"), behind "−${amount}" (e.g. "−$10.00"), even "$0.00" | scoresnap/src/ui/RoundBoard.tsx:24<br>scoresnap/src/services/player-link.ts:155 |
| W35 | Leaderboard, heading above the payments list | At least one payment is owed | "Who pays whom" | scoresnap/src/ui/RoundBoard.tsx:26 |
| W36 | Leaderboard, payments list | At least one payment is owed | "{from} pays {to} {amount}" (e.g. "Dana pays Sam $10.00") | scoresnap/src/ui/RoundBoard.tsx:27 |
| W37 | Leaderboard, note under the money | Round still in play | "Running totals. They change until the round is finished." | scoresnap/src/ui/RoundBoard.tsx:28 |

## 4. Website: spectator link page

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W38 | Spectator link page, browser tab title | Always (may predate 87fff3b: the older scoreboard page used the same title) | "Live scoreboard · SnapScore" | scoresnap/app/r/[token].tsx:64 |
| W39 | Spectator link page, small line at the top | New-style spectator link | "SNAPSCORE · live scoreboard" | scoresnap/app/r/[token].tsx:65 |
| W40 | Spectator link page, line under the round name | Round still in play | "Round in progress · updates every 10 seconds" | scoresnap/app/r/[token].tsx:67 |
| W41 | Spectator link page and watch-by-code page, line under the round name | Round finished (may predate 87fff3b: same words on the older scoreboard page) | "Round complete" | scoresnap/app/r/[token].tsx:67<br>scoresnap/src/ui/WatchByCode.tsx:64 |

## 5. Website: watch by code

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W42 | Watch-by-code page, browser tab title | Always | "Join a round · SnapScore" | scoresnap/src/ui/WatchByCode.tsx:49 |
| W43 | Watch-by-code page, big title | Before a round is open | "Join a round" | scoresnap/src/ui/WatchByCode.tsx:52 |
| W44 | Watch-by-code page, under the title | Before a round is open | "Enter the code from the organizer to follow the round live. To keep score, ask the organizer for a player link." | scoresnap/src/ui/WatchByCode.tsx:53 |
| W45 | Watch-by-code page, the code box | Box is empty | Placeholder: "Code" | scoresnap/src/ui/WatchByCode.tsx:54 |
| W46 | Watch-by-code page, the code box | Always | "Round code" **(screen reader only)** | scoresnap/src/ui/WatchByCode.tsx:54 |
| W47 | Watch-by-code page, button | Idle / while looking the code up | "Watch the round" / "Opening…" | scoresnap/src/ui/WatchByCode.tsx:57 |
| W48 | Watch-by-code page, line under the round name | Round still in play | "Round in progress · you are watching" | scoresnap/src/ui/WatchByCode.tsx:64 |
| W49 | Watch-by-code page, red error under the button | Code typed is not 4 to 12 letters/numbers | "Enter the code the organizer gave you." | scoresnap/src/services/player-link.ts:101 |
| W50 | Watch-by-code page, red error under the button | No round matches the code | "No round found for that code. Check it and try again in a minute." | scoresnap/src/services/player-link.ts:103 |
| W51 | Watch-by-code page, red error under the button | Online features are switched off | "Watching is not available right now." | scoresnap/src/ui/WatchByCode.tsx:28 |

## 6. Website: finalized, reopen, and score-change (flag) states

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W52 | Player link page, grey box above the card | Round has been finalized | Title "Round finalized"; text "Scores are final. For one hour after finalizing you can reopen your card to fix a mistake." | scoresnap/src/ui/GuestGroupCard.tsx:152<br>scoresnap/src/ui/GuestGroupCard.tsx:153 |
| W53 | Player link page, link inside the "Round finalized" box | Round finalized, not yet reopened | "Reopen to fix a score" | scoresnap/src/ui/GuestGroupCard.tsx:154 |
| W54 | Player link page, grey box above the card | After tapping "Reopen to fix a score" | Title "Reopened to fix a score"; text "Fix what is wrong. The round still shows as final to everyone." | scoresnap/src/ui/GuestGroupCard.tsx:152<br>scoresnap/src/ui/GuestGroupCard.tsx:153 |
| W55 | Player link page (message box) and app (reopen banner / share panel) | Trying to reopen or fix after the one-hour window has passed | "This round is locked. Scores could be fixed for one hour after it was finalized." | scoresnap/src/services/player-link.ts:29 |
| W56 | Player link page, message box above the card | Fixing a finalized score failed and the server gave no reason | "Could not save the fix. Check your connection and try again." | scoresnap/src/ui/GuestGroupCard.tsx:115 |
| W57 | Player link page, message box above the card | This scorer changed a score that someone else entered, so it needs the group scorekeeper's approval | "Sent to your group's scorekeeper to approve. The score already entered counts until they decide." | scoresnap/src/ui/GuestGroupCard.tsx:79 |
| W58 | Player link page, small line under that player's name | This scorer's change is waiting for approval | "Counts as {score} · your change is waiting" (e.g. "Counts as 5 · your change is waiting"); if there was no score: "Counts as no score · your change is waiting" | scoresnap/src/ui/GuestGroupCard.tsx:183 |
| W59 | Player link page, yellow box above the card (for the group's scorekeeper) | Someone else asked to change a score this scorer entered | Title "Someone changed a score"; text "{player}, hole {n}: {current} → {asked}. Your {current} counts until you decide." (e.g. "Dana, hole 7: 5 → 4. Your 5 counts until you decide."). An empty score reads "no score" in the first part and "empty" in the second (e.g. "Dana, hole 7: no score → 4. Your empty counts until you decide.") | scoresnap/src/ui/GuestGroupCard.tsx:157<br>scoresnap/src/ui/GuestGroupCard.tsx:158<br>scoresnap/src/services/player-link.ts:18 |
| W60 | Player link page, the two links in the yellow box | Same | "Use {asked}" (e.g. "Use 4"; or "Use no score") and "Keep {current}" (e.g. "Keep 5"; or "Keep it empty") | scoresnap/src/ui/GuestGroupCard.tsx:160<br>scoresnap/src/ui/GuestGroupCard.tsx:161 |

## 7. Website: errors and edge states (link ended, removed, no signal, limits)

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W61 | Player link page, button under any red error | An error is showing | "Try again" | scoresnap/app/p/[token].tsx:54 |
| W62 | Player link page, red error | Online features are switched off | "Web scoring is not available right now." | scoresnap/app/p/[token].tsx:25 |
| W63 | Player link page, red error | The link was cut short or mistyped | "This link is not complete. Ask the organizer to send it again." | scoresnap/app/p/[token].tsx:26 |
| W64 | Player link page and spectator link page, red error | The organizer ended the link, or it is not a real link (server says INVALID_LINK) | "This link is no longer active. Ask the organizer for a new one." | scoresnap/src/services/player-link.ts:24 |
| W65 | Player link page: grey note before picking a name, and red error / message when a score is refused | Round is finished or sharing is paused (server says SYNC_PAUSED) | "This round is finished or paused, so scores can no longer be entered." | scoresnap/app/p/[token].tsx:59<br>scoresnap/src/services/player-link.ts:25 |
| W66 | Player link page, red error | The organizer opens their own player link (server says HOST_SLOT) | "You are the organizer of this round. Keep score in the app." | scoresnap/src/services/player-link.ts:26 |
| W67 | Player link page, red error | Someone who already joined the round in the app opens the link (server says ALREADY_APPROVED) | "You already have a spot in this round. Keep score from where you joined." | scoresnap/src/services/player-link.ts:27 |
| W68 | Player link page, red error | Too many web scorers already (server says MEMBER_LIMIT) | "This round has reached its limit for web scorers. Ask the organizer." | scoresnap/src/services/player-link.ts:28 |
| W69 | Player link page (after tapping a name) and app share panel (when moving a web scorer) | The chosen player is not in a group (server says INVALID_PLAYER) | "That player is not in a group yet. Ask the organizer." | scoresnap/src/services/player-link.ts:33 |
| W70 | Any guest web page and the app panels that use these links | The organizer removed this person's access (server permission refusal 42501) | "The organizer removed web access for this round." | scoresnap/src/services/player-link.ts:34 |
| W71 | Any guest web page and the app panels that use these links | Any other failure talking to the server (usually no signal) | "Could not reach the round. Check your connection and try again." | scoresnap/src/services/player-link.ts:35 |
| W72 | Player link page and watch-by-code page, red error | Too many guests signed in from the same wifi in the last hour (server limit 429) | "Too many people joined from this wifi network in the last hour. Wait a few minutes and try again, or turn wifi off and use mobile data." | scoresnap/src/services/player-link.ts:46 |
| W73 | Player link page and watch-by-code page, red error | The guest sign-in step failed for another reason | "Could not open the round. Check your connection and try again." | scoresnap/src/services/player-link.ts:47 |
| W74 | Player link page and watch-by-code page, red error | An error with no message at all | "Something went wrong. Try again." | scoresnap/src/services/player-link.ts:45 |
| W75 | Player link page, red error replacing the card | The card was open and then the round disappeared for this scorer | "The organizer ended web access for this round, or the round is finished." | scoresnap/src/ui/GuestGroupCard.tsx:54 |
| W76 | Player link page, message box above the card | Live connection dropped while the round is in play | "Reconnecting. Your scores are kept on this device." | scoresnap/src/ui/GuestGroupCard.tsx:44 |
| W77 | Player link page, message box above the card | A score could not be sent (no signal) | "Not sent yet. Your score is kept on this device and will send when you are back online." | scoresnap/src/ui/GuestGroupCard.tsx:120 |
| W78 | Player link page, small line under that player's name | That player's score has not been sent yet | "Not sent yet" | scoresnap/src/ui/GuestGroupCard.tsx:183 |
| W79 | Player link page, message box above the card | All unsent scores have now arrived | "Back online. Your scores were sent." | scoresnap/src/ui/GuestGroupCard.tsx:68 |
| W80 | Website, any address that is not a join, player or spectator page (website-only build) | Someone lands on an app-only page on the website | "To join a round, open the link the organizer sent you. Everything else is in the SnapScore app." | scoresnap/app/_layout.tsx:269 |

## 8. App: share panel "For people without the app" (links, scorer list, move, remove, end links, share messages)

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W81 | App, round status sheet, new section heading (organizer only) | Round is shared online | "For people without the app" | scoresnap/src/ui/WebLinks.tsx:69 |
| W82 | App, share panel, text under the heading | Same | "A player link lets someone keep their group's card in a browser. A spectator link only watches." | scoresnap/src/ui/WebLinks.tsx:70 |
| W83 | App, share panel, buttons | Same | "Share player link" and "Share spectator link" | scoresnap/src/ui/WebLinks.tsx:71<br>scoresnap/src/ui/WebLinks.tsx:72 |
| W84 | Message sent through the phone's share sheet | After tapping "Share player link" | "Keep score for {round} in your browser, no app needed: {link}" (e.g. "Keep score for Saturday Skins in your browser, no app needed: https://snapscore.autumn8.me/p/…") | scoresnap/src/ui/WebLinks.tsx:45 |
| W85 | Message sent through the phone's share sheet | After tapping "Share spectator link" | "Follow {round} live: {link}" (e.g. "Follow Saturday Skins live: https://snapscore.autumn8.me/r/…") | scoresnap/src/ui/WebLinks.tsx:46 |
| W86 | App share panel, small status line | Link was copied instead of shared (web version of the app only) | "Link copied." | scoresnap/src/ui/WebLinks.tsx:47 |
| W87 | App, share panel, sub-heading above the list of web scorers | At least one person is scoring on the web | "Scoring on the web" | scoresnap/src/ui/WebLinks.tsx:74 |
| W88 | App, share panel, one line per web scorer | Same | "Web scorer on {group} (picked {player})" (e.g. "Web scorer on Group A (picked Dana)"); if they have no group: "Web scorer on no group (picked Dana)" | scoresnap/src/services/player-link.ts:15<br>scoresnap/src/ui/WebLinks.tsx:76 |
| W89 | App, share panel, buttons under each web scorer | Same | "Move to another card" (becomes "Cancel move" while choosing) and "Remove" | scoresnap/src/ui/WebLinks.tsx:78<br>scoresnap/src/ui/WebLinks.tsx:79 |
| W90 | App, share panel, list of choices after "Move to another card" | Choosing where to move a web scorer | "Give them {player}'s card" (e.g. "Give them Sam's card") | scoresnap/src/ui/WebLinks.tsx:82 |
| W91 | App, share panel, small status line | Move succeeded | "Web scorer moved." | scoresnap/src/ui/WebLinks.tsx:82 |
| W92 | App, pop-up after tapping "Remove" | Confirming removal | Title "Remove this web scorer?"; text "{scorer line} can no longer enter scores. Scores already entered stay." (e.g. "Web scorer on Group A (picked Dana) can no longer enter scores. Scores already entered stay."); buttons "Cancel" and "Remove" | scoresnap/src/ui/WebLinks.tsx:61<br>scoresnap/src/ui/WebLinks.tsx:62 |
| W93 | App, share panel, small status line | Removal succeeded | "Web scorer removed." | scoresnap/src/ui/WebLinks.tsx:62 |
| W94 | App, share panel, red buttons at the bottom | "End player links" shows when someone is scoring on the web; "End spectator links" shows after a spectator link was shared in this session | "End player links" and "End spectator links" | scoresnap/src/ui/WebLinks.tsx:85<br>scoresnap/src/ui/WebLinks.tsx:86 |
| W95 | App, pop-up after tapping "End player links" | Confirming | Title "End player links?"; text "Everyone scoring on the web is removed. Scores already entered stay."; buttons "Cancel" and "End links" | scoresnap/src/ui/WebLinks.tsx:57<br>scoresnap/src/ui/WebLinks.tsx:58<br>scoresnap/src/ui/WebLinks.tsx:59 |
| W96 | App, pop-up after tapping "End spectator links" | Confirming | Title "End spectator links?"; text "Anyone watching by link loses access."; buttons "Cancel" and "End links" | scoresnap/src/ui/WebLinks.tsx:57<br>scoresnap/src/ui/WebLinks.tsx:58 |
| W97 | App, share panel, small status line | Player links ended | "Player links ended. Web scorers were removed; their scores stay." | scoresnap/src/ui/WebLinks.tsx:55 |
| W98 | App, share panel, small status line | Spectator links ended | "Spectator links ended." | scoresnap/src/ui/WebLinks.tsx:55 |
| W99 | App, share panel, small status line | Someone who is not the organizer tries an organizer action (server says HOST_REQUIRED) | "Only the organizer can do that." | scoresnap/src/services/player-link.ts:30 |
| W100 | App, share panel, small status line | Too many links already made for this round (server says LINK_LIMIT) | "This round already has the most links allowed. End the old ones first." | scoresnap/src/services/player-link.ts:31 |
| W101 | App, share panel, small status line | Moving or removing a web scorer who already left (server says INVALID_MEMBER) | "That web scorer is no longer in the round." | scoresnap/src/services/player-link.ts:32 |

## 9. App: score changes waiting (flag list, badge)

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W102 | App, yellow box on every tab of a shared round, heading | One or more score changes are waiting | "1 score change waiting" or "{n} score changes waiting" (e.g. "3 score changes waiting") | scoresnap/src/ui/ScoreFlags.tsx:58 |
| W103 | App, yellow box, one line per change, for the person who must decide | You are the group scorekeeper for that score | "{player}, hole {n}: {current} was entered, {asked} was asked for. {Current} counts until you decide." (e.g. "Dana, hole 7: 5 was entered, 4 was asked for. 5 counts until you decide."). An empty score reads "no score" (e.g. "Dana, hole 7: no score was entered, 4 was asked for. No score counts until you decide.") | scoresnap/src/services/score-flags.ts:18 |
| W104 | App, yellow box, one line per change, for the person who asked | You asked for the change | "{player}, hole {n}: you asked to change {current} to {asked}. {Current} counts until the group scorekeeper decides." (e.g. "Dana, hole 7: you asked to change 5 to 4. 5 counts until the group scorekeeper decides.") | scoresnap/src/services/score-flags.ts:19 |
| W105 | App, yellow box, one line per change, for everyone else | Someone else's change is waiting | "{player}, hole {n}: a change from {current} to {asked} is waiting. {Current} counts for now." (e.g. "Dana, hole 7: a change from 5 to 4 is waiting. 5 counts for now.") | scoresnap/src/services/score-flags.ts:20 |
| W106 | App, yellow box, buttons under a change you can decide | You are the group scorekeeper for that score | "Use {asked}" (e.g. "Use 4"; or "Use no score") and "Keep {current}" (e.g. "Keep 5"; or "Keep it empty") | scoresnap/src/ui/ScoreFlags.tsx:69<br>scoresnap/src/ui/ScoreFlags.tsx:74 |
| W107 | App, yellow box, the "Use" and "Keep" buttons | Same | "Use {asked} for {player} on hole {n}" (e.g. "Use 4 for Dana on hole 7") and "Keep {current} for {player} on hole {n}" (e.g. "Keep 5 for Dana on hole 7"); empty scores read "no score" **(screen reader only)** | scoresnap/src/ui/ScoreFlags.tsx:67<br>scoresnap/src/ui/ScoreFlags.tsx:72 |
| W108 | App, yellow box, in place of the buttons | While a decision is being saved | "Saving…" | scoresnap/src/ui/ScoreFlags.tsx:64 |
| W109 | App, yellow box, small line at the bottom | After deciding | "Score changed." (after Use) or "Score kept." (after Keep) | scoresnap/src/ui/ScoreFlags.tsx:48 |
| W110 | App, yellow box, small line at the bottom | You lost the right to decide (e.g. you were moved or removed) | "You can no longer decide this change. Ask the organizer." | scoresnap/src/ui/ScoreFlags.tsx:51 |
| W111 | App, score screen, small tag next to a player's name | A change is waiting for that player on the hole being shown | "Change waiting" | scoresnap/src/ui/ScoreFlags.tsx:86 |
| W112 | App, score screen, the "Change waiting" tag | Same | "A score change is waiting on this hole" **(screen reader only)** | scoresnap/src/ui/ScoreFlags.tsx:85 |

## 10. App: finalized / reopen banner on the score screen

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W113 | App, score screen, banner at the top of a finished shared round | Finalized, still inside the one-hour window | "Round final. You can reopen your card to fix a mistake. {n} min left." (e.g. "Round final. You can reopen your card to fix a mistake. 42 min left."). Before the time is known it shows without the minutes: "Round final. You can reopen your card to fix a mistake." | scoresnap/src/services/reopen-window.ts:30 |
| W114 | App, score screen, button in the banner | Same / while reopening | "Reopen to fix a score" / "Reopening…" | scoresnap/src/ui/ReopenBanner.tsx:92 |
| W115 | App, score screen, banner (turns yellow) | After reopening | "Reopened to fix a score. {n} min left. Everyone else still sees the round as final." (e.g. "Reopened to fix a score. 58 min left. Everyone else still sees the round as final.") | scoresnap/src/services/reopen-window.ts:29 |
| W116 | App, score screen, banner | The hour has passed | "Round final. Scores are locked." | scoresnap/src/services/reopen-window.ts:28 |
| W117 | App, score screen, second line in the banner | A fix was saved | "Hole {n} fixed." (e.g. "Hole 7 fixed.") | scoresnap/src/ui/ReopenBanner.tsx:75 |
| W118 | App, score screen, second line in the banner | The fix changes a score someone else entered, so it needs approval | "Hole {n}: sent to the group scorekeeper to decide. The first score counts until then." (e.g. "Hole 7: sent to the group scorekeeper to decide. The first score counts until then.") | scoresnap/src/ui/ReopenBanner.tsx:73 |
| W119 | App, score screen, second line in the banner | Someone else changed the same hole at the same moment | "Hole {n} was just changed on another device. Check it and fix it again if it is wrong." (e.g. "Hole 7 was just changed on another device. …") | scoresnap/src/ui/ReopenBanner.tsx:74 |
| W120 | App, score screen, second line in the banner | The score being fixed is not part of the shared round | "That score is not in the shared round, so it cannot be fixed here." | scoresnap/src/ui/ReopenBanner.tsx:68 |
| W121 | App, score screen, second line in the banner | A fix failed | "Not saved. {reason}" where the reason is one of the server messages in this sheet (e.g. "Not saved. Could not reach the round. Check your connection and try again.") | scoresnap/src/ui/ReopenBanner.tsx:78 |

## 11. App: online sharing line on the round screen (old-format round, auto sharing)

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W122 | App, round screen, where "Enable online sharing" would be | The round was made before online sharing existed | "This round was made before online sharing. Start a new round to share it." (replaces the old error "Create a new round to enable online sharing. Older local rounds require import review.") | scoresnap/src/services/owner-invite.ts:24<br>scoresnap/src/ui/ContestJoinCode.tsx:139 |
| W123 | App, round screen, online sharing link | Round can be shared but is not yet (may predate 87fff3b: the line was re-written but the words are unchanged) | "Enable online sharing"; while checking "Checking online sharing…"; while turning on "Enabling…" | scoresnap/src/ui/ContestJoinCode.tsx:140 |
| W124 | App, round screen, status line | Sharing was turned on, now also automatically for a signed-in organizer on a new round with no scores (may predate 87fff3b: words unchanged, but it can now appear without tapping anything) | "Online sharing enabled. Share this invite with signed-in players." | scoresnap/src/ui/ContestJoinCode.tsx:72 |
| W125 | App, round screen, status line | Tapping "Enable online sharing" failed with no reason given (may predate 87fff3b: words unchanged; no longer shown when the automatic attempt fails) | "Could not enable online sharing. Try again." | scoresnap/src/ui/ContestJoinCode.tsx:73 |

## 12. App: Pay-up ticket image and its share message

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W126 | Pay-up ticket picture, top line | Someone owes money | "PAY UP · {ROUND NAME IN CAPITALS}" (e.g. "PAY UP · SATURDAY SKINS") | scoresnap/src/ui/share/pay-up-ticket-model.ts:44 |
| W127 | Pay-up ticket picture, top line | Nobody owes anything | "ALL SQUARE · {ROUND NAME IN CAPITALS}" (e.g. "ALL SQUARE · SATURDAY SKINS") | scoresnap/src/ui/share/pay-up-ticket-model.ts:44 |
| W128 | Pay-up ticket picture, main lines | Someone owes money (up to 5 lines) | "{from}  pays  {to}" with the amount on the right (e.g. "Dana  pays  Sam" … "$10.00"). Long two-part names are shortened to first name and initial (e.g. "Christopher M.") | scoresnap/src/ui/share/PayUpTicket.tsx:31<br>scoresnap/src/ui/share/pay-up-ticket-model.ts:8 |
| W129 | Pay-up ticket picture, under the payment lines | More than 5 payments | "+ {n} more in the app" (e.g. "+ 2 more in the app") | scoresnap/src/ui/share/PayUpTicket.tsx:35 |
| W130 | Pay-up ticket picture, big text in the middle | Nobody owes anything | "Nobody owes" / "a thing." (two lines), and under it "Dead even." | scoresnap/src/ui/share/PayUpTicket.tsx:25<br>scoresnap/src/ui/share/PayUpTicket.tsx:26 |
| W131 | Pay-up ticket picture, section label | Always | "HOW IT FINISHED" | scoresnap/src/ui/share/PayUpTicket.tsx:37 |
| W132 | Pay-up ticket picture, one row per player under "HOW IT FINISHED" | Always | "{player}" and the result: winner "+${amount}" (e.g. "+$10.00"), loser "−${amount}" (e.g. "−$10.00"), even "$0.00" | scoresnap/src/ui/share/pay-up-ticket-model.ts:41 |
| W133 | Pay-up ticket picture, under the player rows | More players than fit | "+ {n} more players" (e.g. "+ 3 more players"); for one: "+ 1 more player" | scoresnap/src/ui/share/PayUpTicket.tsx:42 |
| W134 | Pay-up ticket picture, section label | Always | "THE ROUND" | scoresnap/src/ui/share/PayUpTicket.tsx:43 |
| W135 | Pay-up ticket picture, labels under "THE ROUND" | Each shows only if it has a value | "Course", "Played", "Game" | scoresnap/src/ui/share/PayUpTicket.tsx:44 |
| W136 | Pay-up ticket picture, value next to "Played" | Always | Date written as "{day} {month} {year}" (e.g. "14 Jun 2026"); months are Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec | scoresnap/src/ui/share/pay-up-ticket-model.ts:7<br>scoresnap/src/ui/share/pay-up-ticket-model.ts:26 |
| W137 | Pay-up ticket picture, value next to "Game" | Always | "{n} games · ${amount} a unit" (e.g. "3 games · $5 a unit"; one game: "1 game · $5 a unit"; odd amounts: "$2.50 a unit") | scoresnap/src/ui/share/pay-up-ticket-model.ts:49 |
| W138 | Pay-up ticket picture, italic line at the bottom of the ticket | Someone owes money | "No hard feelings. Rematch?" | scoresnap/src/ui/share/pay-up-ticket-model.ts:50 |
| W139 | Pay-up ticket picture, italic line at the bottom of the ticket | Nobody owes anything | "Play it again to settle it?" | scoresnap/src/ui/share/pay-up-ticket-model.ts:50 |
| W140 | Pay-up ticket picture, footer | Always | "SNAPSCORE" with the line "Score the round. See who owes what." and, on the right, "snapscore.autumn8.me" | scoresnap/src/ui/share/PayUpTicket.tsx:53<br>scoresnap/src/ui/share/PayUpTicket.tsx:54<br>scoresnap/src/ui/share/pay-up-ticket-model.ts:51 |
| W141 | Phone share sheet title when the ticket picture is shared from the Settle up screen (no other text goes with the picture) | Tapping Share on the Settle up screen (may predate 87fff3b: the same title was already used for the text-only share, which is still the fallback if the picture cannot be made) | "{round} — Settle up" (e.g. "Saturday Skins — Settle up") | scoresnap/app/contest/[id]/settlement.tsx:202 |

## 13. App: Google sign-in messages

| # | Where it appears | When | Exact wording | Source |
|---|---|---|---|---|
| W142 | App, sign-in screen, red error line | Google returned something other than success (not a cancel) | "Google did not sign you in. Try again, or use Apple or email." | scoresnap/src/services/google-sign-in.ts:39 |
| W143 | App, sign-in screen, red error line | Google came back without the needed code, or without the identity token | "Google did not finish signing you in. Try again." | scoresnap/src/services/google-sign-in.ts:41<br>scoresnap/src/services/google-sign-in.ts:45 |
| W144 | App, sign-in screen, red error line | Could not reach Google to finish (usually no signal) | "Could not reach Google to finish signing in. Check your connection and try again." | scoresnap/src/services/google-sign-in.ts:44 |
| W145 | App, sign-in screen, red error line | Any other failure after Google (e.g. our own sign-in step failed); replaces the old "Google Sign-In failed. Please try again." | "Google could not sign you in. Try again, or use Apple or email." | scoresnap/app/auth/sign-in.tsx:131 |

## Not covered

- `scoresnap/src/services/cross-device.ts:85`: "Guest sign-in unavailable. Sign in with email or Apple, then reopen your invite." The line changed in the diff but the words did not, so it is not counted. On the guest website this text is now replaced by the section 7 messages (wifi limit / "Could not open the round…"); it can still appear inside the app.
- `scoresnap/app/auth/sign-in.tsx`: the old message "Google Sign-In was cancelled." was removed. Cancelling Google sign-in now shows nothing. Nothing to approve, listed for awareness.
- `scoresnap/app/r/[token].tsx`: the older-style scoreboard (old links) keeps its existing wording ("Live scoreboard", "Scores and chat · updates every 5 seconds", "Loading scoreboard…", and so on). Not new, not counted. Errors on the new spectator page reuse the server messages in section 7.
- Names that come from the round itself (round name, group names, player names, course name) appear on these screens but are typed by the organizer, so they are not wording to approve.
- `scoresnap/app/dev/pay-up-ticket.tsx` and `scoresnap/src/ui/share/pay-up-ticket-fixture.ts`: developer-only preview and sample data, skipped as instructed.
- Files in the diff with no user-facing text: `app/(tabs)/index.tsx`, `app/contest/new.tsx`, `app/settings.tsx`, `app/contest/[id]/_layout.tsx`, `app/contest/[id]/index.tsx` (only places the banner and badge), `src/ui/OnlineSyncPanel.tsx` (the panel is now hidden for old-format rounds; no new words), `src/ui/RoundStatusSheet.tsx`, `src/ui/settings-layout.ts`, `src/config/*`, `src/stores/*`, `src/services/net-payments.ts`, `src/services/share-pay-up-ticket.ts`, `src/services/analytics.web.ts`, `src/stubs/purchases-guest.js`.
