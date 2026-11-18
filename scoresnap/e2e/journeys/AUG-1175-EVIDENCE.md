# AUG-1175: New Contest scroll boundary

The reported raw-control bottoms (606, 762, 836) extend past the scroll
viewport. They do not establish footer overlap: a ScrollView clips content
at its own edge, and users scroll to reveal the remaining content.

Measured on main c6bf353 with a real offline Expo export and simulated safe
insets, without production layout changes:

| Profile | Scroll bottom | Footer top | Footer bottom |
| --- | ---: | ---: | ---: |
| SE | 578 | 578 | 667 |
| 15 Pro | 729 | 729 | 818 |
| Pro Max | 809 | 809 | 898 |

`app/contest/new.tsx` and `src/ui/SafeScreen.tsx` have no differences between
this base and the report's capture source 2a9121f. The original screenshot's
partial control is at the clipping boundary, outside the visible scroll area.

`create-footer.browser.test.mjs` measures the real viewport and footer, then
scrolls the last name input and Add Player into view, checks their full height
and inset-corner pointer hits, and grows the list from two to four players.
All three profiles pass. Translating the footer up 30px is a negative control:
the viewport/footer assertion must reject that introduced overlap. The test is
imported by the existing CI-registered home-rank-layout browser entrypoint.

J-home-create-cancel now checks `player-list-clears-footer` before editing.
All three profile journey executions pass, with two activations and no extra
scroll added to that measured task. This is a regression guard and measured
refutation, not a claim of a production layout repair or native-device proof.

Commands (from scoresnap; serve the actual offline Expo export at BASE_URL):

```sh
node --test e2e/journeys/create-footer.browser.test.mjs
node --test e2e/journeys/ci-registration.test.mjs e2e/journeys/focused-fixtures.test.mjs
JOURNEYS=J-home-create-cancel DEVICE_PROFILE=iphone-se node e2e/journeys/runner.mjs
```

Repeat the journey for iphone-15-pro and iphone-pro-max. Box artifacts and
logs: `/workspace/aos-work/lanes/pull-ss/evidence/20261117-1175/`.
