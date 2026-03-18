import { useState, useEffect, useCallback, useMemo } from "react";
import { Camera, Trophy, Users, Plus, ChevronRight, ChevronLeft, Check, X, Scan, Target, Award, Crown, Star, Zap, Hash, DollarSign, Settings, Share2, BarChart3, Eye, Edit3, Trash2, UserPlus, Link, ClipboardList, Flag, Circle } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// GOLF SCORING ENGINE — 25+ Game Types
// ═══════════════════════════════════════════════════════════════════

const GAME_TYPES = {
  individual: [
    { id: "stroke_play", name: "Stroke Play", desc: "Lowest total strokes wins", icon: "🏌️", category: "Classic" },
    { id: "match_play", name: "Match Play", desc: "Win individual holes head-to-head", icon: "⚔️", category: "Classic" },
    { id: "stableford", name: "Stableford", desc: "Points per hole based on score vs par", icon: "⭐", category: "Classic" },
    { id: "mod_stableford", name: "Modified Stableford", desc: "Rewards birdies/eagles, penalizes bogeys+", icon: "💫", category: "Classic" },
    { id: "skins", name: "Skins", desc: "Win the hole outright to take the skin", icon: "💰", category: "Money Games" },
    { id: "skins_carry", name: "Skins (Carryover)", desc: "Tied skins carry to next hole", icon: "💰", category: "Money Games" },
    { id: "nassau", name: "Nassau", desc: "3 bets: front 9, back 9, overall", icon: "🎰", category: "Money Games" },
    { id: "nassau_press", name: "Nassau w/ Presses", desc: "Nassau with auto-press when 2 down", icon: "🎰", category: "Money Games" },
    { id: "wolf", name: "Wolf", desc: "Choose partner or go lone wolf each hole", icon: "🐺", category: "Strategy" },
    { id: "banker", name: "Banker", desc: "Rotating banker takes all bets on hole", icon: "🏦", category: "Strategy" },
    { id: "hammer", name: "Hammer", desc: "Double the bet mid-hole for pressure", icon: "🔨", category: "Pressure" },
    { id: "snake", name: "Snake", desc: "Last to 3-putt holds the snake", icon: "🐍", category: "Putting" },
    { id: "bingo_bango_bongo", name: "Bingo Bango Bongo", desc: "Points for first on, closest, first in", icon: "🎯", category: "Points" },
    { id: "dots", name: "Dots / Trash / Junk", desc: "Points for birdies, greenies, sandies, etc.", icon: "🎲", category: "Points" },
    { id: "rabbit", name: "Rabbit", desc: "Catch the rabbit with low score, keep it", icon: "🐰", category: "Chase" },
    { id: "defender", name: "Defender", desc: "Rotating defender vs field best ball", icon: "🛡️", category: "Strategy" },
    { id: "nines", name: "Nines / Nine Point", desc: "9 points split among foursome each hole", icon: "9️⃣", category: "Points" },
    { id: "vegas", name: "Vegas / Las Vegas", desc: "Team scores combined as 2-digit number", icon: "🎲", category: "Team Money" },
    { id: "sixes", name: "Sixes / Round Robin", desc: "Partners rotate every 6 holes", icon: "🔄", category: "Rotating" },
    { id: "closeout", name: "Closeout", desc: "New match starts when one closes out", icon: "🔒", category: "Match" },
    { id: "quota", name: "Quota / Point Quota", desc: "Beat your point quota based on handicap", icon: "📊", category: "Handicap" },
    { id: "chicago", name: "Chicago", desc: "Stableford points minus quota target", icon: "🌆", category: "Handicap" },
    { id: "greenies", name: "Greenies", desc: "Closest to pin on par 3s, must make par", icon: "🟢", category: "Par 3s" },
    { id: "aces_deuces", name: "Aces & Deuces", desc: "Bonus for aces, penalty for double+", icon: "🃏", category: "Bonus" },
  ],
  team: [
    { id: "best_ball", name: "Best Ball", desc: "Best score on team counts each hole", icon: "🏆", category: "Team" },
    { id: "scramble", name: "Scramble", desc: "All play from best shot each time", icon: "🤝", category: "Team" },
    { id: "shamble", name: "Shamble", desc: "Best drive, then play own ball", icon: "🔀", category: "Team" },
    { id: "alternate_shot", name: "Alternate Shot", desc: "Partners alternate shots on each hole", icon: "🔁", category: "Team" },
    { id: "chapman", name: "Chapman / Pinehurst", desc: "Drive, swap, pick best, then alternate", icon: "🌲", category: "Team" },
    { id: "fourball", name: "Four-Ball", desc: "Best ball of partner in match play", icon: "4️⃣", category: "Team" },
  ],
};

const ALL_GAMES = [...GAME_TYPES.individual, ...GAME_TYPES.team];

// Par data for demo
const DEMO_COURSE = {
  name: "Augusta National GC",
  holes: [
    { num: 1, par: 4, hcp: 7, yards: 445 },
    { num: 2, par: 5, hcp: 13, yards: 575 },
    { num: 3, par: 4, hcp: 5, yards: 350 },
    { num: 4, par: 3, hcp: 11, yards: 240 },
    { num: 5, par: 4, hcp: 1, yards: 495 },
    { num: 6, par: 3, hcp: 15, yards: 180 },
    { num: 7, par: 4, hcp: 9, yards: 450 },
    { num: 8, par: 5, hcp: 3, yards: 570 },
    { num: 9, par: 4, hcp: 17, yards: 460 },
    { num: 10, par: 4, hcp: 8, yards: 495 },
    { num: 11, par: 4, hcp: 4, yards: 505 },
    { num: 12, par: 3, hcp: 12, yards: 155 },
    { num: 13, par: 5, hcp: 14, yards: 510 },
    { num: 14, par: 4, hcp: 2, yards: 440 },
    { num: 15, par: 5, hcp: 16, yards: 530 },
    { num: 16, par: 3, hcp: 6, yards: 170 },
    { num: 17, par: 4, hcp: 10, yards: 440 },
    { num: 18, par: 4, hcp: 18, yards: 465 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// SCORING CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

function calcStrokePlay(players, course) {
  return players.map(p => ({
    name: p.name,
    front: p.scores.slice(0, 9).reduce((a, b) => a + b, 0),
    back: p.scores.slice(9).reduce((a, b) => a + b, 0),
    total: p.scores.reduce((a, b) => a + b, 0),
    toPar: p.scores.reduce((a, b) => a + b, 0) - course.holes.reduce((a, h) => a + h.par, 0),
  })).sort((a, b) => a.total - b.total);
}

function calcMatchPlay(p1, p2, course) {
  let status = 0;
  const results = [];
  for (let i = 0; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) status++;
    else if (p2.scores[i] < p1.scores[i]) status--;
    results.push({ hole: i + 1, p1: p1.scores[i], p2: p2.scores[i], status });
  }
  return { p1: p1.name, p2: p2.name, results, finalStatus: status };
}

function calcStableford(players, course) {
  const pts = (score, par) => {
    const diff = score - par;
    if (diff <= -3) return 5;
    if (diff === -2) return 4;
    if (diff === -1) return 3;
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
  };
  return players.map(p => ({
    name: p.name,
    points: p.scores.reduce((sum, s, i) => sum + pts(s, course.holes[i].par), 0),
    holePoints: p.scores.map((s, i) => pts(s, course.holes[i].par)),
  })).sort((a, b) => b.points - a.points);
}

function calcSkins(players, course, carryover = false) {
  let pot = 0;
  const skins = [];
  const skinCount = {};
  players.forEach(p => (skinCount[p.name] = 0));

  for (let i = 0; i < 18; i++) {
    pot++;
    const scores = players.map(p => ({ name: p.name, score: p.scores[i] }));
    const min = Math.min(...scores.map(s => s.score));
    const winners = scores.filter(s => s.score === min);
    if (winners.length === 1) {
      skins.push({ hole: i + 1, winner: winners[0].name, value: pot });
      skinCount[winners[0].name] += pot;
      pot = 0;
    } else if (!carryover) {
      skins.push({ hole: i + 1, winner: "Push", value: 0 });
      pot = 0;
    } else {
      skins.push({ hole: i + 1, winner: "Carry", value: 0 });
    }
  }
  return { skins, totals: skinCount, remaining: pot };
}

function calcNassau(p1, p2) {
  let front = 0, back = 0;
  for (let i = 0; i < 9; i++) {
    if (p1.scores[i] < p2.scores[i]) front++;
    else if (p2.scores[i] < p1.scores[i]) front--;
  }
  for (let i = 9; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) back++;
    else if (p2.scores[i] < p1.scores[i]) back--;
  }
  const overall = front + back;
  return { p1: p1.name, p2: p2.name, front, back, overall };
}

function calcNines(players, course) {
  const points = {};
  players.forEach(p => (points[p.name] = 0));
  const holeResults = [];

  for (let i = 0; i < 18; i++) {
    const scores = players.map(p => ({ name: p.name, score: p.scores[i] })).sort((a, b) => a.score - b.score);
    let allocation = {};
    if (players.length === 4) {
      if (scores[0].score === scores[1].score && scores[1].score === scores[2].score && scores[2].score === scores[3].score) {
        scores.forEach(s => { allocation[s.name] = 2.25; points[s.name] += 2.25; });
      } else if (scores[0].score < scores[1].score && scores[1].score < scores[2].score) {
        allocation[scores[0].name] = 5; points[scores[0].name] += 5;
        allocation[scores[1].name] = 3; points[scores[1].name] += 3;
        allocation[scores[2].name] = 1; points[scores[2].name] += 1;
        allocation[scores[3].name] = 0; points[scores[3].name] += 0;
      } else {
        const total = 9;
        const groups = {};
        scores.forEach(s => { groups[s.score] = groups[s.score] || []; groups[s.score].push(s.name); });
        const sortedScores = Object.keys(groups).map(Number).sort((a, b) => a - b);
        let rank = 0;
        const rankPts = [5, 3, 1, 0];
        sortedScores.forEach(sc => {
          const g = groups[sc];
          const share = g.reduce((sum, _, idx) => sum + (rankPts[rank + idx] || 0), 0) / g.length;
          g.forEach(name => { allocation[name] = share; points[name] += share; });
          rank += g.length;
        });
      }
    }
    holeResults.push({ hole: i + 1, allocation });
  }
  return { points, holeResults };
}

function calcVegas(team1, team2, course) {
  let t1Total = 0, t2Total = 0;
  const holes = [];
  for (let i = 0; i < 18; i++) {
    const t1Scores = team1.map(p => p.scores[i]).sort((a, b) => a - b);
    const t2Scores = team2.map(p => p.scores[i]).sort((a, b) => a - b);
    const t1Num = t1Scores[0] * 10 + t1Scores[1];
    const t2Num = t2Scores[0] * 10 + t2Scores[1];
    const diff = t1Num - t2Num;
    holes.push({ hole: i + 1, t1: t1Num, t2: t2Num, diff });
    t1Total += diff < 0 ? Math.abs(diff) : 0;
    t2Total += diff > 0 ? diff : 0;
  }
  return { team1Won: t1Total, team2Won: t2Total, holes };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════

const COLORS = {
  bg: "#0a1628",
  card: "#111d33",
  cardHover: "#162545",
  accent: "#00d47e",
  accentDim: "#00b86b",
  accentGlow: "rgba(0,212,126,0.15)",
  warn: "#ff6b35",
  danger: "#ff4757",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  text: "#e8edf5",
  textDim: "#7a8ba8",
  border: "#1e3050",
  inputBg: "#0d1f38",
  purple: "#a855f7",
  blue: "#3b82f6",
};

export default function GolfScorecardApp() {
  const [screen, setScreen] = useState("home");
  const [tournament, setTournament] = useState(null);
  const [tournaments, setTournaments] = useState([
    {
      id: 1,
      name: "Saturday Squad Classic",
      date: "2026-03-21",
      course: DEMO_COURSE,
      games: ["nassau", "skins_carry", "wolf"],
      betUnit: 5,
      groups: [
        {
          id: 1,
          name: "Group 1",
          players: [
            { id: 1, name: "Mike T.", handicap: 12, team: "A", scores: [5,6,4,3,5,3,5,6,4, 5,4,3,5,5,6,3,5,5] },
            { id: 2, name: "Dave R.", handicap: 8, team: "B", scores: [4,5,5,4,4,3,4,5,5, 4,5,3,5,4,5,4,4,4] },
            { id: 3, name: "Chris L.", handicap: 15, team: "A", scores: [5,7,4,4,6,4,5,5,5, 5,5,4,6,5,5,3,5,5] },
            { id: 4, name: "Jay P.", handicap: 10, team: "B", scores: [4,5,4,3,5,4,5,6,4, 4,4,4,5,4,6,4,4,5] },
          ],
        },
        {
          id: 2,
          name: "Group 2",
          players: [
            { id: 5, name: "Tom H.", handicap: 6, team: "A", scores: [4,5,4,3,4,3,4,5,4, 4,4,3,4,4,5,3,4,4] },
            { id: 6, name: "Rob K.", handicap: 14, team: "B", scores: [5,6,5,4,5,4,5,6,5, 5,5,4,6,5,6,4,5,5] },
            { id: 7, name: "Nick B.", handicap: 11, team: "A", scores: [5,5,4,4,5,3,4,5,5, 4,5,3,5,4,5,4,5,4] },
            { id: 8, name: "Sam W.", handicap: 9, team: "B", scores: [4,5,5,3,4,4,5,5,4, 5,4,3,5,5,5,3,4,4] },
          ],
        },
      ],
      teams: { A: "Eagles", B: "Birdies" },
      status: "complete",
    },
  ]);
  const [scanState, setScanState] = useState("idle"); // idle, scanning, processing, done
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [editingScorecard, setEditingScorecard] = useState(null);
  const [newTournament, setNewTournament] = useState(null);
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [gameFilter, setGameFilter] = useState("all");

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  const navigate = (s, data) => {
    setScreen(s);
    if (data?.tournament) setTournament(data.tournament);
    if (data?.group) setSelectedGroup(data.group);
    if (data?.game) setSelectedGame(data.game);
  };

  // ═══════════════════════════════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════════════════════════════

  const HomeScreen = () => (
    <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⛳</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.text, margin: 0, letterSpacing: -0.5 }}>
          ScoreSnap
        </h1>
        <p style={{ color: COLORS.textDim, fontSize: 14, margin: "4px 0 0" }}>
          Scan. Score. Settle.
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <ActionCard icon={<Scan size={24} />} label="Scan Card" color={COLORS.accent} onClick={() => navigate("scan")} />
        <ActionCard icon={<Plus size={24} />} label="New Contest" color={COLORS.blue} onClick={() => navigate("new_tournament")} />
        <ActionCard icon={<Trophy size={24} />} label="Quick Game" color={COLORS.gold} onClick={() => navigate("game_select")} />
        <ActionCard icon={<Users size={24} />} label="Team Setup" color={COLORS.purple} onClick={() => navigate("team_setup")} />
      </div>

      {/* Active Tournaments */}
      <SectionHeader title="Your Contests" count={tournaments.length} />
      {tournaments.map(t => (
        <div
          key={t.id}
          onClick={() => navigate("tournament", { tournament: t })}
          style={{
            background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12,
            border: `1px solid ${COLORS.border}`, cursor: "pointer",
            transition: "all 0.2s", position: "relative", overflow: "hidden",
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = COLORS.accent}
          onMouseOut={e => e.currentTarget.style.borderColor = COLORS.border}
        >
          <div style={{ position: "absolute", top: 0, right: 0, background: t.status === "complete" ? COLORS.accent : COLORS.warn, color: "#000", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: "0 0 0 10px", textTransform: "uppercase" }}>
            {t.status === "complete" ? "Final" : "Live"}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text, marginBottom: 4 }}>{t.name}</div>
          <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 8 }}>{t.course.name} · {t.date}</div>
          <div style={{ display: "flex", gap: 16 }}>
            <MiniStat icon="👥" label={`${t.groups.reduce((s, g) => s + g.players.length, 0)} Players`} />
            <MiniStat icon="🏌️" label={`${t.groups.length} Groups`} />
            <MiniStat icon="🎮" label={`${t.games.length} Games`} />
          </div>
          {t.teams && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <TeamBadge name={t.teams.A} color={COLORS.accent} />
              <span style={{ color: COLORS.textDim, fontSize: 12, alignSelf: "center" }}>vs</span>
              <TeamBadge name={t.teams.B} color={COLORS.blue} />
            </div>
          )}
        </div>
      ))}

      {/* Game Types Preview */}
      <SectionHeader title="Supported Games" count={ALL_GAMES.length} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ALL_GAMES.slice(0, 12).map(g => (
          <span key={g.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: COLORS.textDim }}>
            {g.icon} {g.name}
          </span>
        ))}
        <span style={{ background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}33`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: COLORS.accent }}>
          +{ALL_GAMES.length - 12} more
        </span>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // SCAN SCREEN
  // ═══════════════════════════════════════════════════════════════

  const ScanScreen = () => {
    const [phase, setPhase] = useState("ready"); // ready, scanning, processing, result
    const [progress, setProgress] = useState(0);
    const [scannedScores, setScannedScores] = useState(null);

    const startScan = () => {
      setPhase("scanning");
      setTimeout(() => {
        setPhase("processing");
        let p = 0;
        const interval = setInterval(() => {
          p += Math.random() * 15 + 5;
          if (p >= 100) {
            clearInterval(interval);
            setProgress(100);
            setTimeout(() => {
              setScannedScores([
                { name: "Player 1", scores: [4,5,4,3,5,3,4,5,4, 4,4,3,5,4,5,3,4,4] },
                { name: "Player 2", scores: [5,6,4,4,5,4,5,6,5, 5,5,4,5,5,6,4,5,5] },
                { name: "Player 3", scores: [4,5,5,3,4,3,5,5,4, 5,4,3,5,5,5,3,4,5] },
                { name: "Player 4", scores: [5,5,4,4,6,4,4,5,5, 4,5,4,6,4,5,4,5,4] },
              ]);
              setPhase("result");
            }, 500);
          }
          setProgress(Math.min(p, 100));
        }, 200);
      }, 1500);
    };

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <NavBar title="Scan Scorecard" onBack={() => navigate("home")} />

        {phase === "ready" && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{
              width: 280, height: 380, margin: "0 auto 24px", borderRadius: 20,
              border: `3px dashed ${COLORS.accent}`, background: COLORS.accentGlow,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {/* Scan overlay animation */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
                animation: "scanLine 2s infinite",
              }} />
              <Camera size={48} color={COLORS.accent} style={{ marginBottom: 16 }} />
              <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Position Scorecard</div>
              <div style={{ color: COLORS.textDim, fontSize: 13, padding: "0 20px" }}>
                Align the scorecard within the frame. Works with any standard golf scorecard.
              </div>
              {/* Corner guides */}
              {[[0,0],[1,0],[0,1],[1,1]].map(([x,y], i) => (
                <div key={i} style={{
                  position: "absolute", [y?"bottom":"top"]: 12, [x?"right":"left"]: 12,
                  width: 28, height: 28, borderColor: COLORS.accent, borderStyle: "solid",
                  borderWidth: 0, [`border${y?"Bottom":"Top"}Width`]: 3, [`border${x?"Right":"Left"}Width`]: 3,
                  borderRadius: x===y ? (y ? "0 0 8px 0" : "8px 0 0 0") : (y ? "0 0 0 8px" : "0 8px 0 0"),
                }} />
              ))}
            </div>
            <button onClick={startScan} style={{
              background: COLORS.accent, color: "#000", border: "none", borderRadius: 12,
              padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, margin: "0 auto",
            }}>
              <Scan size={20} /> Scan Now
            </button>
            <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 16 }}>
              AI-powered OCR reads handwritten & printed scores
            </div>
          </div>
        )}

        {phase === "scanning" && (
          <div style={{ textAlign: "center", marginTop: 80 }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: COLORS.accentGlow, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "pulse 1.5s infinite" }}>
              <Camera size={36} color={COLORS.accent} />
            </div>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 600 }}>Capturing...</div>
            <div style={{ color: COLORS.textDim, fontSize: 14, marginTop: 4 }}>Hold steady</div>
          </div>
        )}

        {phase === "processing" && (
          <div style={{ textAlign: "center", marginTop: 80 }}>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Processing Scorecard</div>
            <div style={{ width: "80%", height: 6, background: COLORS.border, borderRadius: 3, margin: "0 auto 12px", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: COLORS.accent, borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ color: COLORS.textDim, fontSize: 13 }}>
              {progress < 30 ? "Detecting scorecard layout..." : progress < 60 ? "Reading scores with AI..." : progress < 90 ? "Validating data..." : "Almost done..."}
            </div>
          </div>
        )}

        {phase === "result" && scannedScores && (
          <div>
            <div style={{ background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}44`, borderRadius: 12, padding: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <Check size={20} color={COLORS.accent} />
              <div>
                <div style={{ color: COLORS.accent, fontWeight: 600, fontSize: 14 }}>Scan Complete</div>
                <div style={{ color: COLORS.textDim, fontSize: 12 }}>4 players · 18 holes detected</div>
              </div>
            </div>

            {/* Mini scorecard preview */}
            <div style={{ background: COLORS.card, borderRadius: 14, padding: 14, border: `1px solid ${COLORS.border}`, marginBottom: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: COLORS.textDim, padding: "4px 6px", fontWeight: 600 }}>Hole</th>
                    {[1,2,3,4,5,6,7,8,9].map(h => (
                      <th key={h} style={{ color: COLORS.textDim, padding: "4px 3px", fontWeight: 500, minWidth: 22 }}>{h}</th>
                    ))}
                    <th style={{ color: COLORS.accent, padding: "4px 6px", fontWeight: 700 }}>OUT</th>
                  </tr>
                  <tr>
                    <td style={{ color: COLORS.textDim, padding: "2px 6px", fontSize: 10 }}>Par</td>
                    {DEMO_COURSE.holes.slice(0, 9).map((h, i) => (
                      <td key={i} style={{ color: COLORS.textDim, padding: "2px 3px", textAlign: "center", fontSize: 10 }}>{h.par}</td>
                    ))}
                    <td style={{ color: COLORS.textDim, padding: "2px 6px", textAlign: "center", fontSize: 10 }}>{DEMO_COURSE.holes.slice(0,9).reduce((s,h)=>s+h.par,0)}</td>
                  </tr>
                </thead>
                <tbody>
                  {scannedScores.map((p, pi) => (
                    <tr key={pi} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ color: COLORS.text, padding: "5px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</td>
                      {p.scores.slice(0, 9).map((s, si) => {
                        const par = DEMO_COURSE.holes[si].par;
                        const diff = s - par;
                        const clr = diff <= -2 ? "#ffd700" : diff === -1 ? COLORS.accent : diff === 0 ? COLORS.text : diff === 1 ? COLORS.warn : COLORS.danger;
                        return <td key={si} style={{ color: clr, padding: "5px 3px", textAlign: "center", fontWeight: diff < 0 ? 700 : 400 }}>{s}</td>;
                      })}
                      <td style={{ color: COLORS.text, padding: "5px 6px", textAlign: "center", fontWeight: 700 }}>{p.scores.slice(0,9).reduce((a,b)=>a+b,0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { navigate("game_select"); }} style={{
                flex: 1, background: COLORS.accent, color: "#000", border: "none", borderRadius: 12,
                padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>
                Calculate Games →
              </button>
              <button onClick={() => setPhase("ready")} style={{
                background: COLORS.card, color: COLORS.textDim, border: `1px solid ${COLORS.border}`, borderRadius: 12,
                padding: "12px 16px", fontSize: 14, cursor: "pointer",
              }}>
                Re-scan
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes scanLine { 0%,100% { transform: translateY(0); } 50% { transform: translateY(370px); } }
          @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.05); } }
        `}</style>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // GAME SELECTION SCREEN
  // ═══════════════════════════════════════════════════════════════

  const GameSelectScreen = () => {
    const categories = [...new Set(ALL_GAMES.map(g => g.category))];
    const [selected, setSelected] = useState([]);
    const [filter, setFilter] = useState("all");

    const filtered = filter === "all" ? ALL_GAMES : filter === "individual" ? GAME_TYPES.individual : filter === "team" ? GAME_TYPES.team : ALL_GAMES.filter(g => g.category === filter);

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <NavBar title="Select Games" onBack={() => navigate("home")} />

        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
          {["all", "individual", "team"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? COLORS.accent : COLORS.card,
              color: filter === f ? "#000" : COLORS.textDim,
              border: `1px solid ${filter === f ? COLORS.accent : COLORS.border}`,
              borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize",
            }}>
              {f === "all" ? "All Games" : f}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(g => {
            const active = selected.includes(g.id);
            return (
              <div key={g.id} onClick={() => setSelected(prev => active ? prev.filter(x => x !== g.id) : [...prev, g.id])} style={{
                background: active ? COLORS.accentGlow : COLORS.card,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 24 }}>{g.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                  <div style={{ color: COLORS.textDim, fontSize: 12 }}>{g.desc}</div>
                </div>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: `2px solid ${active ? COLORS.accent : COLORS.border}`,
                  background: active ? COLORS.accent : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {active && <Check size={14} color="#000" />}
                </div>
              </div>
            );
          })}
        </div>

        {selected.length > 0 && (
          <div style={{
            position: "sticky", bottom: 20, marginTop: 16,
            background: COLORS.accent, borderRadius: 14, padding: "14px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: `0 8px 32px ${COLORS.accent}44`, cursor: "pointer",
          }} onClick={() => navigate("results")}>
            <span style={{ color: "#000", fontWeight: 700, fontSize: 15 }}>
              Calculate {selected.length} Game{selected.length > 1 ? "s" : ""}
            </span>
            <ChevronRight size={20} color="#000" />
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // TOURNAMENT SCREEN
  // ═══════════════════════════════════════════════════════════════

  const TournamentScreen = () => {
    if (!tournament) return null;
    const allPlayers = tournament.groups.flatMap(g => g.players);

    const strokeResults = calcStrokePlay(allPlayers, tournament.course);
    const teamAPlayers = allPlayers.filter(p => p.team === "A");
    const teamBPlayers = allPlayers.filter(p => p.team === "B");
    const teamATotal = teamAPlayers.reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0);
    const teamBTotal = teamBPlayers.reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0);

    // Group-level skins
    const allSkins = tournament.groups.map(g => calcSkins(g.players, tournament.course, true));

    return (
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
        <NavBar title={tournament.name} onBack={() => navigate("home")} />

        {/* Tournament Header */}
        <div style={{ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardHover})`, borderRadius: 16, padding: 20, marginBottom: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 4 }}>{tournament.course.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <span style={{ color: COLORS.text, fontSize: 14 }}>{allPlayers.length} players</span>
              <span style={{ color: COLORS.textDim, margin: "0 8px" }}>·</span>
              <span style={{ color: COLORS.text, fontSize: 14 }}>{tournament.groups.length} groups</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}44`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: COLORS.accent, fontSize: 12, fontWeight: 600 }}>
                <Share2 size={14} /> Share
              </button>
              <button onClick={() => navigate("scan")} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: COLORS.textDim, fontSize: 12, fontWeight: 600 }}>
                <Plus size={14} /> Add Card
              </button>
            </div>
          </div>

          {/* Team Score */}
          {tournament.teams && (
            <div style={{ display: "flex", gap: 12, background: COLORS.bg, borderRadius: 12, padding: 14 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ color: COLORS.accent, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{tournament.teams.A}</div>
                <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 800, marginTop: 4 }}>{teamATotal}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11 }}>{teamAPlayers.length} players</div>
              </div>
              <div style={{ width: 1, background: COLORS.border, margin: "4px 0" }} />
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ color: COLORS.blue, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{tournament.teams.B}</div>
                <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 800, marginTop: 4 }}>{teamBTotal}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11 }}>{teamBPlayers.length} players</div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: COLORS.card, borderRadius: 10, padding: 3 }}>
          {["leaderboard", "games", "groups", "settlement"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, background: activeTab === tab ? COLORS.accentGlow : "transparent",
              border: activeTab === tab ? `1px solid ${COLORS.accent}44` : "1px solid transparent",
              borderRadius: 8, padding: "8px 4px", cursor: "pointer",
              color: activeTab === tab ? COLORS.accent : COLORS.textDim,
              fontSize: 12, fontWeight: 600, textTransform: "capitalize",
            }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && (
          <div>
            {strokeResults.map((r, i) => (
              <div key={r.name} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                background: COLORS.card, borderRadius: 12, marginBottom: 8,
                border: `1px solid ${i === 0 ? COLORS.gold + "44" : COLORS.border}`,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  background: i === 0 ? COLORS.gold + "22" : i === 1 ? COLORS.silver + "22" : i === 2 ? COLORS.bronze + "22" : COLORS.bg,
                  color: i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : i === 2 ? COLORS.bronze : COLORS.textDim,
                  fontWeight: 800, fontSize: 14,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                  <div style={{ color: COLORS.textDim, fontSize: 12 }}>F9: {r.front} · B9: {r.back}</div>
                </div>
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-end",
                }}>
                  <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 18 }}>{r.total}</div>
                  <div style={{ color: r.toPar > 0 ? COLORS.warn : r.toPar < 0 ? COLORS.accent : COLORS.textDim, fontSize: 12, fontWeight: 600 }}>
                    {r.toPar > 0 ? "+" : ""}{r.toPar}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Games Tab */}
        {activeTab === "games" && (
          <div>
            {tournament.games.map(gameId => {
              const game = ALL_GAMES.find(g => g.id === gameId);
              if (!game) return null;
              return (
                <div key={gameId} style={{
                  background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>{game.icon}</span>
                    <div>
                      <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{game.name}</div>
                      <div style={{ color: COLORS.textDim, fontSize: 12 }}>${tournament.betUnit} per unit</div>
                    </div>
                  </div>
                  {/* Game-specific results */}
                  {gameId === "skins_carry" && tournament.groups.map((g, gi) => {
                    const res = calcSkins(g.players, tournament.course, true);
                    return (
                      <div key={gi} style={{ marginBottom: gi < tournament.groups.length - 1 ? 12 : 0 }}>
                        <div style={{ color: COLORS.textDim, fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{g.name}</div>
                        {Object.entries(res.totals).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                          <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
                            <span style={{ color: COLORS.text, fontSize: 13 }}>{name}</span>
                            <span style={{ color: count > 0 ? COLORS.accent : COLORS.textDim, fontWeight: 700, fontSize: 13 }}>
                              {count} skin{count !== 1 ? "s" : ""} · ${count * tournament.betUnit}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {gameId === "nassau" && tournament.groups.map((g, gi) => {
                    if (g.players.length < 2) return null;
                    const res = calcNassau(g.players[0], g.players[1]);
                    return (
                      <div key={gi} style={{ marginBottom: 8 }}>
                        <div style={{ color: COLORS.textDim, fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>{g.name}: {res.p1} vs {res.p2}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[["Front 9", res.front], ["Back 9", res.back], ["Overall", res.overall]].map(([label, val]) => (
                            <div key={label} style={{ flex: 1, background: COLORS.bg, borderRadius: 8, padding: 8, textAlign: "center" }}>
                              <div style={{ color: COLORS.textDim, fontSize: 10, marginBottom: 2 }}>{label}</div>
                              <div style={{ color: val > 0 ? COLORS.accent : val < 0 ? COLORS.danger : COLORS.textDim, fontWeight: 700, fontSize: 16 }}>
                                {val > 0 ? res.p1.split(" ")[0] : val < 0 ? res.p2.split(" ")[0] : "Tied"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {gameId === "wolf" && (
                    <div style={{ color: COLORS.textDim, fontSize: 13, fontStyle: "italic" }}>Wolf results calculated per group with rotating order</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === "groups" && (
          <div>
            {tournament.groups.map(g => (
              <div key={g.id} style={{ background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                  <button onClick={() => navigate("scorecard", { group: g })} style={{
                    background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}44`, borderRadius: 8,
                    padding: "5px 10px", cursor: "pointer", color: COLORS.accent, fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Eye size={12} /> Scorecard
                  </button>
                </div>
                {g.players.map(p => {
                  const total = p.scores.reduce((a, b) => a + b, 0);
                  const par = tournament.course.holes.reduce((a, h) => a + h.par, 0);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${COLORS.border}22` }}>
                      <TeamDot team={p.team} teams={tournament.teams} />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: COLORS.text, fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                        <span style={{ color: COLORS.textDim, fontSize: 12, marginLeft: 8 }}>({p.handicap} hcp)</span>
                      </div>
                      <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{total}</span>
                      <span style={{ color: total - par > 0 ? COLORS.warn : COLORS.accent, fontSize: 12, fontWeight: 600, minWidth: 30, textAlign: "right" }}>
                        {total - par > 0 ? "+" : ""}{total - par}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Settlement Tab */}
        {activeTab === "settlement" && (
          <div>
            <div style={{ background: `linear-gradient(135deg, ${COLORS.accent}22, ${COLORS.accent}08)`, border: `1px solid ${COLORS.accent}33`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ color: COLORS.accent, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>💰 Settlement Summary</div>
              <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 12 }}>
                Based on {tournament.games.length} active games at ${tournament.betUnit}/unit
              </div>
              {allPlayers.map(p => {
                const net = Math.floor(Math.random() * 60) - 30; // Demo values
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${COLORS.border}22` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <TeamDot team={p.team} teams={tournament.teams} />
                      <span style={{ color: COLORS.text, fontSize: 14 }}>{p.name}</span>
                    </div>
                    <span style={{ color: net > 0 ? COLORS.accent : net < 0 ? COLORS.danger : COLORS.textDim, fontWeight: 700, fontSize: 15 }}>
                      {net > 0 ? "+" : ""}{net === 0 ? "Even" : `$${Math.abs(net * tournament.betUnit)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Venmo-style settle buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1, background: COLORS.blue, color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                Share Results
              </button>
              <button style={{ flex: 1, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                Export CSV
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // SCORECARD VIEW
  // ═══════════════════════════════════════════════════════════════

  const ScorecardScreen = () => {
    if (!selectedGroup || !tournament) return null;
    const course = tournament.course;

    return (
      <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
        <NavBar title={`${selectedGroup.name} Scorecard`} onBack={() => navigate("tournament", { tournament })} />

        {[{ label: "Front 9", start: 0, end: 9 }, { label: "Back 9", start: 9, end: 18 }].map(half => (
          <div key={half.label} style={{ background: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 12, border: `1px solid ${COLORS.border}`, overflowX: "auto" }}>
            <div style={{ color: COLORS.textDim, fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{half.label}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 400 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: COLORS.textDim, padding: "4px 6px", fontWeight: 600 }}>Hole</th>
                  {course.holes.slice(half.start, half.end).map(h => (
                    <th key={h.num} style={{ color: COLORS.textDim, padding: "4px 3px", fontWeight: 500, textAlign: "center", minWidth: 26 }}>{h.num}</th>
                  ))}
                  <th style={{ color: COLORS.accent, fontWeight: 700, padding: "4px 6px", textAlign: "center" }}>TOT</th>
                </tr>
                <tr>
                  <td style={{ color: COLORS.textDim, padding: "2px 6px", fontSize: 10 }}>Par</td>
                  {course.holes.slice(half.start, half.end).map(h => (
                    <td key={h.num} style={{ color: COLORS.textDim, textAlign: "center", fontSize: 10 }}>{h.par}</td>
                  ))}
                  <td style={{ color: COLORS.textDim, textAlign: "center", fontSize: 10, fontWeight: 600 }}>
                    {course.holes.slice(half.start, half.end).reduce((s, h) => s + h.par, 0)}
                  </td>
                </tr>
              </thead>
              <tbody>
                {selectedGroup.players.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${COLORS.border}44` }}>
                    <td style={{ color: COLORS.text, padding: "6px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <TeamDot team={p.team} teams={tournament.teams} size={6} />
                        {p.name}
                      </div>
                    </td>
                    {p.scores.slice(half.start, half.end).map((s, si) => {
                      const par = course.holes[half.start + si].par;
                      const diff = s - par;
                      return (
                        <td key={si} style={{ textAlign: "center", padding: "6px 2px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24,
                            borderRadius: diff <= -2 ? "50%" : diff === -1 ? "50%" : diff >= 2 ? 4 : 0,
                            border: diff <= -2 ? `2px solid ${COLORS.gold}` : diff === -1 ? `2px solid ${COLORS.accent}` : diff >= 2 ? `2px solid ${COLORS.danger}` : "none",
                            color: diff <= -2 ? COLORS.gold : diff === -1 ? COLORS.accent : diff === 0 ? COLORS.text : diff === 1 ? COLORS.warn : COLORS.danger,
                            fontWeight: diff !== 0 ? 700 : 400, fontSize: 12,
                          }}>
                            {s}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ color: COLORS.text, textAlign: "center", fontWeight: 800, fontSize: 14 }}>
                      {p.scores.slice(half.start, half.end).reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("scan")} style={{
            flex: 1, background: COLORS.accent, color: "#000", border: "none", borderRadius: 10,
            padding: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Scan size={16} /> Re-Scan
          </button>
          <button style={{
            flex: 1, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10,
            padding: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Edit3 size={16} /> Edit Scores
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // NEW TOURNAMENT SCREEN
  // ═══════════════════════════════════════════════════════════════

  const NewTournamentScreen = () => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState("");
    const [numGroups, setNumGroups] = useState(2);
    const [playersPerGroup, setPlayersPerGroup] = useState(4);
    const [selectedGames, setSelectedGames] = useState(["nassau", "skins_carry"]);
    const [betUnit, setBetUnit] = useState(5);
    const [hasTeams, setHasTeams] = useState(true);
    const [teamAName, setTeamAName] = useState("Eagles");
    const [teamBName, setTeamBName] = useState("Birdies");

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <NavBar title="New Contest" onBack={() => navigate("home")} />

        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? COLORS.accent : COLORS.border }} />
          ))}
        </div>

        {/* Step 1: Basics */}
        {step === 1 && (
          <div>
            <StepHeader num={1} title="Contest Details" />
            <InputField label="Contest Name" value={name} onChange={setName} placeholder="e.g. Saturday Squad Classic" />
            <InputField label="Course" value="Augusta National GC" onChange={() => {}} placeholder="Search courses..." />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div>
                <label style={{ color: COLORS.textDim, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Groups</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StepperBtn label="-" onClick={() => setNumGroups(Math.max(1, numGroups - 1))} />
                  <span style={{ color: COLORS.text, fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: "center" }}>{numGroups}</span>
                  <StepperBtn label="+" onClick={() => setNumGroups(numGroups + 1)} />
                </div>
              </div>
              <div>
                <label style={{ color: COLORS.textDim, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Players/Group</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StepperBtn label="-" onClick={() => setPlayersPerGroup(Math.max(2, playersPerGroup - 1))} />
                  <span style={{ color: COLORS.text, fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: "center" }}>{playersPerGroup}</span>
                  <StepperBtn label="+" onClick={() => setPlayersPerGroup(Math.min(5, playersPerGroup + 1))} />
                </div>
              </div>
            </div>
            <div style={{ color: COLORS.textDim, fontSize: 13, marginTop: 12, textAlign: "center" }}>
              {numGroups * playersPerGroup} total players across {numGroups} group{numGroups > 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Step 2: Teams */}
        {step === 2 && (
          <div>
            <StepHeader num={2} title="Team Setup" />
            <div
              onClick={() => setHasTeams(!hasTeams)}
              style={{
                background: hasTeams ? COLORS.accentGlow : COLORS.card,
                border: `1px solid ${hasTeams ? COLORS.accent : COLORS.border}`,
                borderRadius: 12, padding: 16, marginBottom: 16, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <div style={{
                width: 44, height: 24, borderRadius: 12, padding: 2,
                background: hasTeams ? COLORS.accent : COLORS.border, transition: "all 0.2s",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 10, background: "#fff",
                  transform: hasTeams ? "translateX(20px)" : "translateX(0)", transition: "all 0.2s",
                }} />
              </div>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>Cross-Group Teams</div>
                <div style={{ color: COLORS.textDim, fontSize: 12 }}>Players across groups compete as teams</div>
              </div>
            </div>

            {hasTeams && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: COLORS.accent, marginBottom: 6 }} />
                  <InputField label="Team A" value={teamAName} onChange={setTeamAName} />
                </div>
                <div>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: COLORS.blue, marginBottom: 6 }} />
                  <InputField label="Team B" value={teamBName} onChange={setTeamBName} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <div style={{ color: COLORS.textDim, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>TEAM ASSIGNMENT MODE</div>
              {["Captains Draft", "Random", "Manual"].map(mode => (
                <div key={mode} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10,
                  padding: "12px 14px", marginBottom: 8, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <Circle size={16} color={COLORS.textDim} />
                  <span style={{ color: COLORS.text, fontSize: 14 }}>{mode}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Games */}
        {step === 3 && (
          <div>
            <StepHeader num={3} title="Select Games" />
            <InputField label="Bet Unit" value={`$${betUnit}`} onChange={v => setBetUnit(parseInt(v.replace("$",""))||0)} />
            <div style={{ marginTop: 12 }}>
              {ALL_GAMES.slice(0, 15).map(g => {
                const active = selectedGames.includes(g.id);
                return (
                  <div key={g.id} onClick={() => setSelectedGames(prev => active ? prev.filter(x => x !== g.id) : [...prev, g.id])} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: active ? COLORS.accentGlow : "transparent",
                    border: `1px solid ${active ? COLORS.accent + "44" : "transparent"}`,
                    borderRadius: 10, marginBottom: 4, cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 18 }}>{g.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: COLORS.text, fontSize: 13, fontWeight: active ? 600 : 400 }}>{g.name}</div>
                    </div>
                    {active && <Check size={16} color={COLORS.accent} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Review & Create */}
        {step === 4 && (
          <div>
            <StepHeader num={4} title="Review & Create" />
            <div style={{ background: COLORS.card, borderRadius: 14, padding: 16, border: `1px solid ${COLORS.border}` }}>
              <ReviewRow label="Contest" value={name || "Untitled"} />
              <ReviewRow label="Course" value="Augusta National GC" />
              <ReviewRow label="Players" value={`${numGroups * playersPerGroup} (${numGroups} groups × ${playersPerGroup})`} />
              {hasTeams && <ReviewRow label="Teams" value={`${teamAName} vs ${teamBName}`} />}
              <ReviewRow label="Games" value={selectedGames.map(id => ALL_GAMES.find(g => g.id === id)?.icon).join(" ")} />
              <ReviewRow label="Bet Unit" value={`$${betUnit}`} />
            </div>

            <div style={{ background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}33`, borderRadius: 12, padding: 14, marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <Link size={18} color={COLORS.accent} />
              <div>
                <div style={{ color: COLORS.accent, fontWeight: 600, fontSize: 13 }}>Invite Link</div>
                <div style={{ color: COLORS.textDim, fontSize: 12 }}>Share with players to join and submit scorecards</div>
              </div>
            </div>
          </div>
        )}

        {/* Nav Buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} style={{
              background: COLORS.card, color: COLORS.textDim, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: "12px 20px", fontWeight: 600, cursor: "pointer",
            }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <button onClick={() => step < 4 ? setStep(step + 1) : navigate("home")} style={{
            flex: 1, background: step === 4 ? COLORS.accent : COLORS.blue, color: step === 4 ? "#000" : "#fff",
            border: "none", borderRadius: 12, padding: "14px 20px", fontWeight: 700, fontSize: 15,
            cursor: "pointer",
          }}>
            {step === 4 ? "Create Contest 🎉" : "Next"}
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // RESULTS SCREEN
  // ═══════════════════════════════════════════════════════════════

  const ResultsScreen = () => {
    const demoPlayers = [
      { name: "Mike T.", scores: [5,6,4,3,5,3,5,6,4, 5,4,3,5,5,6,3,5,5] },
      { name: "Dave R.", scores: [4,5,5,4,4,3,4,5,5, 4,5,3,5,4,5,4,4,4] },
      { name: "Chris L.", scores: [5,7,4,4,6,4,5,5,5, 5,5,4,6,5,5,3,5,5] },
      { name: "Jay P.", scores: [4,5,4,3,5,4,5,6,4, 4,4,4,5,4,6,4,4,5] },
    ];

    const strokeRes = calcStrokePlay(demoPlayers, DEMO_COURSE);
    const stableRes = calcStableford(demoPlayers, DEMO_COURSE);
    const skinRes = calcSkins(demoPlayers, DEMO_COURSE, true);
    const nassauRes = calcNassau(demoPlayers[0], demoPlayers[1]);

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <NavBar title="Game Results" onBack={() => navigate("home")} />

        {/* Winner Banner */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.gold}22, ${COLORS.gold}08)`,
          border: `1px solid ${COLORS.gold}33`, borderRadius: 16, padding: 20, marginBottom: 20, textAlign: "center",
        }}>
          <Crown size={32} color={COLORS.gold} style={{ marginBottom: 8 }} />
          <div style={{ color: COLORS.gold, fontWeight: 800, fontSize: 22 }}>{strokeRes[0].name}</div>
          <div style={{ color: COLORS.textDim, fontSize: 14 }}>Stroke Play Champion · {strokeRes[0].total} ({strokeRes[0].toPar > 0 ? "+" : ""}{strokeRes[0].toPar})</div>
        </div>

        {/* Stroke Play */}
        <GameResultCard title="Stroke Play" icon="🏌️" results={strokeRes.map((r, i) => ({
          rank: i + 1, name: r.name, value: `${r.total} (${r.toPar > 0 ? "+" : ""}${r.toPar})`,
        }))} />

        {/* Stableford */}
        <GameResultCard title="Stableford" icon="⭐" results={stableRes.map((r, i) => ({
          rank: i + 1, name: r.name, value: `${r.points} pts`,
        }))} />

        {/* Skins */}
        <div style={{ background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>💰</span>
            <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>Skins (Carryover)</span>
          </div>
          {Object.entries(skinRes.totals).sort((a, b) => b[1] - a[1]).map(([name, val], i) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}22` : "none" }}>
              <span style={{ color: COLORS.text, fontSize: 14 }}>{name}</span>
              <span style={{ color: val > 0 ? COLORS.accent : COLORS.textDim, fontWeight: 700 }}>{val} skin{val !== 1 ? "s" : ""}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {skinRes.skins.filter(s => s.winner !== "Carry").map(s => (
              <span key={s.hole} style={{
                background: s.winner !== "Push" ? COLORS.accentGlow : COLORS.bg,
                border: `1px solid ${s.winner !== "Push" ? COLORS.accent + "33" : COLORS.border}`,
                borderRadius: 6, padding: "3px 8px", fontSize: 10, color: s.winner !== "Push" ? COLORS.accent : COLORS.textDim,
              }}>
                #{s.hole}: {s.winner} ({s.value})
              </span>
            ))}
          </div>
        </div>

        {/* Nassau */}
        <div style={{ background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🎰</span>
            <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>Nassau</span>
            <span style={{ color: COLORS.textDim, fontSize: 12, marginLeft: "auto" }}>{nassauRes.p1} vs {nassauRes.p2}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["Front 9", nassauRes.front], ["Back 9", nassauRes.back], ["Overall", nassauRes.overall]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, background: COLORS.bg, borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ color: COLORS.textDim, fontSize: 11, marginBottom: 4 }}>{label}</div>
                <div style={{ color: val > 0 ? COLORS.accent : val < 0 ? COLORS.danger : COLORS.textDim, fontWeight: 800, fontSize: 18 }}>
                  {val > 0 ? `${nassauRes.p1.split(" ")[0]}` : val < 0 ? `${nassauRes.p2.split(" ")[0]}` : "Push"}
                </div>
                <div style={{ color: COLORS.textDim, fontSize: 10 }}>{Math.abs(val)} {val !== 0 ? "up" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // TEAM SETUP SCREEN
  // ═══════════════════════════════════════════════════════════════

  const TeamSetupScreen = () => {
    const [mode, setMode] = useState("manual"); // manual, draft, random
    const demoPlayers = [
      { id: 1, name: "Mike T.", hcp: 12, team: null },
      { id: 2, name: "Dave R.", hcp: 8, team: null },
      { id: 3, name: "Chris L.", hcp: 15, team: null },
      { id: 4, name: "Jay P.", hcp: 10, team: null },
      { id: 5, name: "Tom H.", hcp: 6, team: null },
      { id: 6, name: "Rob K.", hcp: 14, team: null },
      { id: 7, name: "Nick B.", hcp: 11, team: null },
      { id: 8, name: "Sam W.", hcp: 9, team: null },
    ];
    const [players, setPlayers] = useState(demoPlayers);

    const assignTeam = (id, team) => {
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, team } : p));
    };

    const teamA = players.filter(p => p.team === "A");
    const teamB = players.filter(p => p.team === "B");

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <NavBar title="Team Assignment" onBack={() => navigate("home")} />

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["manual", "draft", "random"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, background: mode === m ? COLORS.accent : COLORS.card,
              color: mode === m ? "#000" : COLORS.textDim,
              border: `1px solid ${mode === m ? COLORS.accent : COLORS.border}`,
              borderRadius: 10, padding: "8px 4px", fontWeight: 600, fontSize: 12,
              cursor: "pointer", textTransform: "capitalize",
            }}>
              {m}
            </button>
          ))}
        </div>

        {/* Team Headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ background: COLORS.accentGlow, border: `1px solid ${COLORS.accent}33`, borderRadius: 12, padding: 12, textAlign: "center" }}>
            <div style={{ color: COLORS.accent, fontWeight: 700, fontSize: 14 }}>Eagles</div>
            <div style={{ color: COLORS.textDim, fontSize: 12 }}>{teamA.length} players · Avg HCP {teamA.length ? Math.round(teamA.reduce((s, p) => s + p.hcp, 0) / teamA.length) : "—"}</div>
          </div>
          <div style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}33`, borderRadius: 12, padding: 12, textAlign: "center" }}>
            <div style={{ color: COLORS.blue, fontWeight: 700, fontSize: 14 }}>Birdies</div>
            <div style={{ color: COLORS.textDim, fontSize: 12 }}>{teamB.length} players · Avg HCP {teamB.length ? Math.round(teamB.reduce((s, p) => s + p.hcp, 0) / teamB.length) : "—"}</div>
          </div>
        </div>

        {/* Player List */}
        {players.map(p => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            background: COLORS.card, borderRadius: 10, marginBottom: 6,
            border: `1px solid ${p.team === "A" ? COLORS.accent + "44" : p.team === "B" ? COLORS.blue + "44" : COLORS.border}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              <div style={{ color: COLORS.textDim, fontSize: 12 }}>HCP {p.hcp}</div>
            </div>
            <button onClick={() => assignTeam(p.id, "A")} style={{
              width: 32, height: 32, borderRadius: 8,
              background: p.team === "A" ? COLORS.accent : "transparent",
              border: `2px solid ${p.team === "A" ? COLORS.accent : COLORS.border}`,
              color: p.team === "A" ? "#000" : COLORS.textDim,
              cursor: "pointer", fontWeight: 700, fontSize: 12,
            }}>A</button>
            <button onClick={() => assignTeam(p.id, "B")} style={{
              width: 32, height: 32, borderRadius: 8,
              background: p.team === "B" ? COLORS.blue : "transparent",
              border: `2px solid ${p.team === "B" ? COLORS.blue : COLORS.border}`,
              color: p.team === "B" ? "#fff" : COLORS.textDim,
              cursor: "pointer", fontWeight: 700, fontSize: 12,
            }}>B</button>
          </div>
        ))}

        {teamA.length > 0 && teamB.length > 0 && (
          <button style={{
            width: "100%", background: COLORS.accent, color: "#000", border: "none", borderRadius: 12,
            padding: 14, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 16,
          }}>
            Confirm Teams ✓
          </button>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // SHARED COMPONENTS
  // ═══════════════════════════════════════════════════════════════

  const NavBar = ({ title, onBack }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <button onClick={onBack} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 8, cursor: "pointer", display: "flex" }}>
        <ChevronLeft size={20} color={COLORS.textDim} />
      </button>
      <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 700, margin: 0, flex: 1 }}>{title}</h2>
    </div>
  );

  const ActionCard = ({ icon, label, color, onClick }) => (
    <div onClick={onClick} style={{
      background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 14,
      padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
    }}
      onMouseOver={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseOut={e => { e.currentTarget.style.background = `${color}11`; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ color, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 13 }}>{label}</div>
    </div>
  );

  const SectionHeader = ({ title, count }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 24 }}>
      <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 16 }}>{title}</span>
      {count && <span style={{ color: COLORS.textDim, fontSize: 12, background: COLORS.card, borderRadius: 10, padding: "3px 8px" }}>{count}</span>}
    </div>
  );

  const MiniStat = ({ icon, label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ color: COLORS.textDim, fontSize: 12 }}>{label}</span>
    </div>
  );

  const TeamBadge = ({ name, color }) => (
    <span style={{ background: `${color}22`, border: `1px solid ${color}44`, color, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
      {name}
    </span>
  );

  const TeamDot = ({ team, teams, size = 8 }) => (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: team === "A" ? COLORS.accent : COLORS.blue, flexShrink: 0 }} title={teams?.[team]} />
  );

  const StepHeader = ({ num, title }) => (
    <div style={{ marginBottom: 20 }}>
      <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700 }}>STEP {num}</span>
      <h3 style={{ color: COLORS.text, fontSize: 22, fontWeight: 700, margin: "4px 0 0" }}>{title}</h3>
    </div>
  );

  const InputField = ({ label, value, onChange, placeholder }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ color: COLORS.textDim, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", background: COLORS.inputBg, border: `1px solid ${COLORS.border}`, borderRadius: 10,
        padding: "10px 14px", color: COLORS.text, fontSize: 14, outline: "none", boxSizing: "border-box",
      }} />
    </div>
  );

  const StepperBtn = ({ label, onClick }) => (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 10, background: COLORS.card,
      border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 18,
      fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {label}
    </button>
  );

  const ReviewRow = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
      <span style={{ color: COLORS.textDim, fontSize: 13 }}>{label}</span>
      <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );

  const GameResultCard = ({ title, icon, results }) => (
    <div style={{ background: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${COLORS.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{title}</span>
      </div>
      {results.map((r, i) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}22` : "none" }}>
          <span style={{
            width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            background: r.rank === 1 ? COLORS.gold + "22" : COLORS.bg,
            color: r.rank === 1 ? COLORS.gold : COLORS.textDim, fontWeight: 700, fontSize: 11,
          }}>{r.rank}</span>
          <span style={{ color: COLORS.text, fontSize: 14, flex: 1 }}>{r.name}</span>
          <span style={{ color: r.rank === 1 ? COLORS.accent : COLORS.textDim, fontWeight: 700, fontSize: 14 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const screens = {
    home: HomeScreen,
    scan: ScanScreen,
    game_select: GameSelectScreen,
    tournament: TournamentScreen,
    scorecard: ScorecardScreen,
    new_tournament: NewTournamentScreen,
    results: ResultsScreen,
    team_setup: TeamSetupScreen,
  };

  const CurrentScreen = screens[screen] || HomeScreen;

  return (
    <div style={{
      background: COLORS.bg, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: COLORS.text, maxWidth: 520, margin: "0 auto",
      boxShadow: "0 0 60px rgba(0,0,0,0.5)",
    }}>
      {/* Status Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px 6px", fontSize: 12, color: COLORS.textDim }}>
        <span>9:41</span>
        <div style={{ display: "flex", gap: 6 }}>
          <span>📶</span><span>🔋</span>
        </div>
      </div>

      <CurrentScreen />

      {/* Bottom Nav */}
      <div style={{
        position: "sticky", bottom: 0, background: COLORS.card,
        borderTop: `1px solid ${COLORS.border}`, padding: "8px 0 12px",
        display: "flex", justifyContent: "space-around",
      }}>
        {[
          { id: "home", icon: <Flag size={20} />, label: "Home" },
          { id: "scan", icon: <Scan size={20} />, label: "Scan" },
          { id: "new_tournament", icon: <Trophy size={20} />, label: "Contest" },
          { id: "team_setup", icon: <Users size={20} />, label: "Teams" },
        ].map(tab => (
          <button key={tab.id} onClick={() => navigate(tab.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: screen === tab.id ? COLORS.accent : COLORS.textDim,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 12px",
          }}>
            {tab.icon}
            <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
