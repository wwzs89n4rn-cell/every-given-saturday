/**
 * Every Given Saturday — College Football Road Trip Planner
 * Implements Josh Pate's rules for the ideal seasonal road trip.
 */

(function () {
    'use strict';

    // ─── State ─────────────────────────────────────────────────────────
    const state = {
        circleGames: [],       // Array of game IDs locked as circle games
        weeklyPicks: {},       // { weekNum: gameId }
        usedTeams: new Set(),  // Teams already picked
        usedVenues: new Set(), // Venues already visited
        activeWeek: 1,
        conferenceFilter: 'All',
        expandedGame: null,    // Game ID currently expanded to show impact
    };

    // ─── DOM References ────────────────────────────────────────────────
    const circleGamesListEl = document.getElementById('circle-games-list');
    const weekTabsEl = document.getElementById('week-tabs');
    const weekContentEl = document.getElementById('week-content');
    const summaryContentEl = document.getElementById('summary-content');
    const violationsPanelEl = document.getElementById('violations-panel');
    const violationsListEl = document.getElementById('violations-list');
    const toggleRulesBtn = document.getElementById('toggle-rules');

    // ─── Initialization ────────────────────────────────────────────────
    async function init() {
        showLoading(true);
        try {
            await fetchESPNSchedule();
        } catch (e) {
            weekContentEl.innerHTML = '<p class="empty-state" style="color:var(--danger);">Failed to load ESPN data. Please refresh.</p>';
            console.error('ESPN fetch error:', e);
            showLoading(false);
            return;
        }
        showLoading(false);
        loadState();
        renderCircleGames();
        renderWeekTabs();
        renderWeekContent(state.activeWeek);
        renderSummary();
        checkViolations();
        setupEventListeners();
    }

    function showLoading(show) {
        if (show) {
            weekContentEl.innerHTML = '<p class="empty-state">⏳ Loading schedule from ESPN...</p>';
            circleGamesListEl.innerHTML = '<p class="empty-state">⏳ Loading...</p>';
            summaryContentEl.innerHTML = '<p class="empty-state">⏳ Loading...</p>';
        }
    }

    function setupEventListeners() {
        toggleRulesBtn.addEventListener('click', () => {
            const grid = document.querySelector('.rules-grid');
            const isHidden = grid.style.display === 'none';
            grid.style.display = isHidden ? '' : 'none';
            toggleRulesBtn.textContent = isHidden ? 'Hide Rules' : 'Show Rules';
            toggleRulesBtn.setAttribute('aria-expanded', isHidden);
        });
    }

    // ─── Persistence ───────────────────────────────────────────────────
    function saveState() {
        const data = {
            circleGames: state.circleGames,
            weeklyPicks: state.weeklyPicks,
            activeWeek: state.activeWeek,
        };
        localStorage.setItem('egs-roadtrip', JSON.stringify(data));
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem('egs-roadtrip'));
            if (saved) {
                state.circleGames = saved.circleGames || [];
                state.weeklyPicks = saved.weeklyPicks || {};
                state.activeWeek = saved.activeWeek || 1;
            }
        } catch (e) {
            // Start fresh
        }
        rebuildUsedSets();
    }

    function rebuildUsedSets() {
        state.usedTeams.clear();
        state.usedVenues.clear();

        const pickedIds = new Set([
            ...state.circleGames,
            ...Object.values(state.weeklyPicks),
        ]);

        const allGames = getAllGames();
        for (const game of allGames) {
            if (pickedIds.has(game.id)) {
                state.usedTeams.add(game.home);
                state.usedTeams.add(game.away);
                state.usedVenues.add(game.venue);
            }
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────
    function getAllGames() {
        const games = [...CIRCLE_GAMES];
        for (const week of Object.values(SCHEDULE)) {
            games.push(...week.games);
        }
        const seen = new Set();
        return games.filter(g => {
            if (seen.has(g.id)) return false;
            seen.add(g.id);
            return true;
        });
    }

    function getGameById(id) {
        return getAllGames().find(g => g.id === id);
    }

    function findWeekForGame(gameId) {
        for (const [weekNum, week] of Object.entries(SCHEDULE)) {
            if (week.games.some(g => g.id === gameId)) {
                return Number(weekNum);
            }
        }
        const cg = CIRCLE_GAMES.find(g => g.id === gameId);
        return cg ? cg.week : null;
    }

    function isGameAvailable(game, excludeWeek) {
        const currentPick = excludeWeek !== undefined ? state.weeklyPicks[excludeWeek] : null;
        const pickedIds = new Set([
            ...state.circleGames,
            ...Object.values(state.weeklyPicks),
        ]);
        if (currentPick) pickedIds.delete(currentPick);

        const usedTeams = new Set();
        const usedVenues = new Set();
        const allGames = getAllGames();
        for (const g of allGames) {
            if (pickedIds.has(g.id) && g.id !== game.id) {
                usedTeams.add(g.home);
                usedTeams.add(g.away);
                usedVenues.add(g.venue);
            }
        }

        if (usedTeams.has(game.home) || usedTeams.has(game.away)) return false;
        if (usedVenues.has(game.venue)) return false;
        return true;
    }

    function isCircleGame(id) {
        return state.circleGames.includes(id);
    }

    function isWeeklyPick(id) {
        return Object.values(state.weeklyPicks).includes(id);
    }

    function isPicked(id) {
        return isCircleGame(id) || isWeeklyPick(id);
    }

    function getGameConference(game) {
        const homeConf = TEAM_CONFERENCES[game.home] || 'Other';
        const awayConf = TEAM_CONFERENCES[game.away] || 'Other';
        return { homeConf, awayConf };
    }

    function gameMatchesConference(game, conf) {
        if (conf === 'All') return true;
        const { homeConf, awayConf } = getGameConference(game);
        return homeConf === conf || awayConf === conf;
    }

    // ─── Conflict Resolution ──────────────────────────────────────────
    function getConflicts(game) {
        // Find all current picks that conflict with this game (team or venue overlap)
        const conflicts = [];
        const pickedIds = [...new Set([
            ...state.circleGames,
            ...Object.values(state.weeklyPicks),
        ])];

        const allGames = getAllGames();
        for (const id of pickedIds) {
            const picked = allGames.find(g => g.id === id);
            if (!picked || picked.id === game.id) continue;

            const reasons = [];
            if (picked.home === game.home || picked.home === game.away) reasons.push(`${picked.home} used`);
            if (picked.away === game.home || picked.away === game.away) reasons.push(`${picked.away} used`);
            if (picked.venue === game.venue) reasons.push(`${picked.venue} used`);

            if (reasons.length > 0) {
                const pickedWeek = findWeekForGame(id);
                conflicts.push({
                    gameId: id,
                    game: picked,
                    week: pickedWeek,
                    weekLabel: pickedWeek !== null && SCHEDULE[pickedWeek] ? SCHEDULE[pickedWeek].label : '?',
                    reasons,
                    isCircle: isCircleGame(id),
                });
            }
        }
        return conflicts;
    }

    function forcePickGame(weekNum, gameId) {
        // Remove all conflicting picks, then pick this game
        const game = getGameById(gameId);
        if (!game) return;

        const conflicts = getConflicts(game);
        for (const conflict of conflicts) {
            if (conflict.isCircle) {
                state.circleGames = state.circleGames.filter(id => id !== conflict.gameId);
            }
            for (const [wk, pickId] of Object.entries(state.weeklyPicks)) {
                if (pickId === conflict.gameId) {
                    delete state.weeklyPicks[wk];
                }
            }
        }

        // Also remove current pick for this week if any
        if (state.weeklyPicks[weekNum]) {
            const currentId = state.weeklyPicks[weekNum];
            if (state.circleGames.includes(currentId)) {
                state.circleGames = state.circleGames.filter(id => id !== currentId);
            }
        }

        state.weeklyPicks[weekNum] = gameId;
        state.expandedGame = null;
        rebuildUsedSets();
        saveState();
        renderAll();
    }

    function removeConflict(conflictGameId) {
        // Remove a single conflicting pick
        if (state.circleGames.includes(conflictGameId)) {
            state.circleGames = state.circleGames.filter(id => id !== conflictGameId);
        }
        for (const [wk, pickId] of Object.entries(state.weeklyPicks)) {
            if (pickId === conflictGameId) {
                delete state.weeklyPicks[wk];
            }
        }
        rebuildUsedSets();
        saveState();
        renderAll();
    }

    // ─── Ranking Score (lower = better matchup) ──────────────────────
    function getRankScore(game) {
        // Both ranked is best; use combined rank (lower total = better)
        // One ranked team: use that rank + 50 penalty
        // Neither ranked: 200 (worst)
        const hr = game.homeRank || 99;
        const ar = game.awayRank || 99;
        if (hr <= 25 && ar <= 25) return hr + ar;          // Both ranked: 2–50
        if (hr <= 25) return hr + 50;                       // Only home ranked: 51–75
        if (ar <= 25) return ar + 50;                       // Only away ranked: 51–75
        return 200;                                          // Unranked
    }

    // ─── Distance Calculation ──────────────────────────────────────────
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    }

    function getDrivingEstimate(miles) {
        // Rough estimate: driving distance ~1.3x straight-line, ~55mph avg
        const drivingMiles = Math.round(miles * 1.3);
        const hours = (drivingMiles / 55).toFixed(1);
        return { drivingMiles, hours };
    }

    function getDistanceToVenue(fromVenue, toVenue) {
        const from = VENUES[fromVenue];
        const to = VENUES[toVenue];
        if (!from || !to || !from.lat || !to.lat) return null;
        const miles = haversineDistance(from.lat, from.lng, to.lat, to.lng);
        return getDrivingEstimate(miles);
    }

    function getPreviousPickVenue(weekNum) {
        const weeks = Object.keys(SCHEDULE).map(Number).sort((a, b) => a - b);
        const idx = weeks.indexOf(weekNum);
        for (let i = idx - 1; i >= 0; i--) {
            const pickId = state.weeklyPicks[weeks[i]];
            if (pickId) {
                const game = getGameById(pickId);
                if (game) return game.venue;
            }
        }
        return null;
    }

    // ─── Impact Analysis ───────────────────────────────────────────────
    function getOptOutImpact(game, weekNum) {
        // What future games become unavailable if you pick this game?
        const teamsUsed = new Set([game.home, game.away]);
        const venueUsed = game.venue;
        const impact = [];

        const weeks = Object.keys(SCHEDULE).map(Number).sort((a, b) => a - b);
        for (const wk of weeks) {
            if (wk <= weekNum) continue; // Only look at future weeks
            const weekData = SCHEDULE[wk];
            for (const g of weekData.games) {
                if (g.id === game.id) continue;
                const reasons = [];
                if (teamsUsed.has(g.home)) reasons.push(`${g.home} used`);
                if (teamsUsed.has(g.away)) reasons.push(`${g.away} used`);
                if (g.venue === venueUsed) reasons.push(`${g.venue} used`);
                if (reasons.length > 0) {
                    impact.push({
                        week: wk,
                        weekLabel: weekData.label,
                        game: g,
                        reasons,
                    });
                }
            }
        }
        // Also check circle games
        for (const cg of CIRCLE_GAMES) {
            if (cg.id === game.id) continue;
            if (cg.week <= weekNum) continue;
            const reasons = [];
            if (teamsUsed.has(cg.home)) reasons.push(`${cg.home} used`);
            if (teamsUsed.has(cg.away)) reasons.push(`${cg.away} used`);
            if (cg.venue === venueUsed) reasons.push(`${cg.venue} used`);
            if (reasons.length > 0 && !impact.some(i => i.game.id === cg.id)) {
                impact.push({
                    week: cg.week,
                    weekLabel: SCHEDULE[cg.week] ? SCHEDULE[cg.week].label : `Week ${cg.week}`,
                    game: cg,
                    reasons,
                    isCircleCandidate: true,
                });
            }
        }

        impact.sort((a, b) => a.week - b.week);
        return impact;
    }

    // ─── Circle Games ──────────────────────────────────────────────────
    function renderCircleGames() {
        circleGamesListEl.innerHTML = '';
        for (const game of CIRCLE_GAMES) {
            const card = createGameCard(game, 'circle');
            circleGamesListEl.appendChild(card);
        }
    }

    // ─── Week Tabs ─────────────────────────────────────────────────────
    function renderWeekTabs() {
        weekTabsEl.innerHTML = '';
        const weeks = Object.keys(SCHEDULE).map(Number).sort((a, b) => a - b);
        for (const weekNum of weeks) {
            const tab = document.createElement('button');
            tab.className = 'week-tab';
            tab.role = 'tab';
            tab.textContent = SCHEDULE[weekNum].label;
            tab.dataset.week = weekNum;

            if (weekNum === state.activeWeek) tab.classList.add('active');
            const pick = state.weeklyPicks[weekNum];
            if (pick && isCircleGame(pick)) {
                tab.classList.add('has-circle');
            } else if (pick) {
                tab.classList.add('has-pick');
            }

            tab.addEventListener('click', () => {
                state.activeWeek = weekNum;
                state.expandedGame = null;
                saveState();
                renderWeekTabs();
                renderWeekContent(weekNum);
            });
            weekTabsEl.appendChild(tab);
        }
    }

    // ─── Week Content ──────────────────────────────────────────────────
    function renderWeekContent(weekNum) {
        const week = SCHEDULE[weekNum];
        if (!week) {
            weekContentEl.innerHTML = '<p class="empty-state">No data for this week.</p>';
            return;
        }

        const currentPick = state.weeklyPicks[weekNum];
        const currentGame = currentPick ? getGameById(currentPick) : null;
        const prevVenue = getPreviousPickVenue(weekNum);

        let html = `
            <div class="week-header">
                <h3>${week.label} — ${week.date}</h3>
                <span class="week-pick-info">
                    ${currentGame
                        ? `✓ Picked: <strong>${currentGame.away} @ ${currentGame.home}</strong>`
                        : 'No game selected yet'}
                </span>
            </div>
            <div class="filter-bar">
                <label for="conf-filter">Filter by Conference:</label>
                <select id="conf-filter" onchange="app.setConferenceFilter(this.value)">
                    ${CONFERENCES.map(c => `<option value="${c}" ${c === state.conferenceFilter ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                ${prevVenue ? '' : ''}
            </div>
        `;

        html += '<div class="games-list">';

        const filteredGames = week.games.filter(g => gameMatchesConference(g, state.conferenceFilter));

        // Sort: available games first, then by rivalry, then by ranking quality, unavailable last
        filteredGames.sort((a, b) => {
            const aAvail = isGameAvailable(a, weekNum) || state.weeklyPicks[weekNum] === a.id || isCircleGame(a.id);
            const bAvail = isGameAvailable(b, weekNum) || state.weeklyPicks[weekNum] === b.id || isCircleGame(b.id);

            // Unavailable games go to bottom
            if (aAvail && !bAvail) return -1;
            if (!aAvail && bAvail) return 1;

            // Currently picked game stays at top
            const aPicked = state.weeklyPicks[weekNum] === a.id || isCircleGame(a.id);
            const bPicked = state.weeklyPicks[weekNum] === b.id || isCircleGame(b.id);
            if (aPicked && !bPicked) return -1;
            if (!aPicked && bPicked) return 1;

            // Rivalry games next
            if (a.rivalry && !b.rivalry) return -1;
            if (!a.rivalry && b.rivalry) return 1;

            // Then sort by combined ranking (lower = better)
            const aRankScore = getRankScore(a);
            const bRankScore = getRankScore(b);
            return aRankScore - bRankScore;
        });

        if (filteredGames.length === 0) {
            html += '<p class="empty-state">No games match this conference filter.</p>';
        }

        for (const game of filteredGames) {
            const available = isGameAvailable(game, weekNum);
            const picked = state.weeklyPicks[weekNum] === game.id;
            const circled = isCircleGame(game.id);
            const pickedElsewhere = isPicked(game.id) && !picked && !circled;
            const isExpanded = state.expandedGame === game.id;

            let cardClass = 'game-card';
            if (picked) cardClass += ' selected';
            if (circled) cardClass += ' circle-locked';
            if (!available && !picked && !circled) cardClass += ' unavailable';

            // Conference badges
            const { homeConf, awayConf } = getGameConference(game);
            const confLabel = homeConf === awayConf ? homeConf : `${awayConf} vs ${homeConf}`;

            // Distance from previous pick
            // Distance removed — ESPN venue data doesn't reliably include coordinates

            html += `
                <div class="${cardClass}" data-game-id="${game.id}">
                    <div class="game-card-main">
                        <div class="matchup">
                            <span class="teams">${game.awayRank ? '#' + game.awayRank + ' ' : ''}${game.away} @ ${game.homeRank ? '#' + game.homeRank + ' ' : ''}${game.home}</span>
                            <span class="meta">${game.venue}${game.venueCity ? ' (' + game.venueCity + ')' : ''} — ${game.kickoff}</span>
                        </div>
                        <div class="badges">
                            <span class="badge badge-conf">${confLabel}</span>
                            ${game.rivalry ? `<span class="badge badge-rivalry">${game.rivalry}</span>` : ''}
                            ${game.ranked ? '<span class="badge badge-ranked">Ranked</span>' : ''}
                            ${circled ? '<span class="badge badge-circle">⭐ Circle Game</span>' : ''}
                            ${game.neutralSite ? '<span class="badge badge-neutral">Neutral</span>' : ''}
                        </div>
                        <div class="actions">
                            ${circled
                                ? `<button class="btn btn-small btn-remove" onclick="app.unlockCircle('${game.id}')">Remove Circle</button>`
                                : picked
                                    ? `<button class="btn btn-small btn-remove" onclick="app.unpickWeek(${weekNum})">Remove</button>`
                                    : (currentPick && !picked)
                                        ? `<span class="meta">Week filled</span>`
                                        : (available && !pickedElsewhere)
                                            ? `<button class="btn btn-small btn-primary" onclick="app.pickWeek(${weekNum}, '${game.id}')">Pick</button>`
                                            : `<button class="btn btn-small btn-secondary" onclick="app.toggleImpact('${game.id}')">${isExpanded ? '▲ Hide Conflicts' : '⚠️ Show Conflicts'}</button>`
                            }
                            ${(available || picked) && !circled
                                ? `<button class="btn btn-small btn-secondary" onclick="app.toggleImpact('${game.id}')">${isExpanded ? '▲ Hide Impact' : '▼ Show Impact'}</button>`
                                : ''
                            }
                        </div>
                    </div>
            `;

            // Impact table (expanded)
            if (isExpanded) {
                if (!available && !picked && !circled) {
                    // Show conflicts and how to resolve
                    const conflicts = getConflicts(game);
                    html += renderConflictPanel(conflicts, game.id, weekNum);
                } else {
                    const impact = getOptOutImpact(game, weekNum);
                    html += renderImpactTable(impact, game.id, weekNum);
                }
            }

            html += '</div>'; // close game-card
        }

        html += '</div>';
        weekContentEl.innerHTML = html;
    }

    function renderConflictPanel(conflicts, gameId, weekNum) {
        let html = '<div class="impact-panel conflict-panel">';
        html += '<h4>🔄 Changes Needed to Pick This Game</h4>';
        html += '<p class="conflict-desc">The following picks must be removed to free up this game:</p>';
        html += '<table class="impact-table"><thead><tr><th>Week</th><th>Current Pick</th><th>Conflict Reason</th><th>Action</th></tr></thead><tbody>';

        for (const conflict of conflicts) {
            const rankAway = conflict.game.awayRank ? '#' + conflict.game.awayRank + ' ' : '';
            const rankHome = conflict.game.homeRank ? '#' + conflict.game.homeRank + ' ' : '';
            html += `<tr>
                <td>${conflict.weekLabel}${conflict.isCircle ? ' ⭐' : ''}</td>
                <td>${rankAway}${conflict.game.away} @ ${rankHome}${conflict.game.home}</td>
                <td>${conflict.reasons.join(', ')}</td>
                <td><button class="btn btn-small btn-remove" onclick="app.removeConflict('${conflict.gameId}')">Remove</button></td>
            </tr>`;
        }

        html += '</tbody></table>';
        html += `<div style="margin-top:0.75rem; display:flex; gap:0.5rem; align-items:center;">
            <button class="btn btn-primary" onclick="app.forcePickGame(${weekNum}, '${gameId}')">
                🔄 Remove All Conflicts & Pick This Game
            </button>
            <span class="meta">This will remove ${conflicts.length} pick${conflicts.length > 1 ? 's' : ''} from your road trip.</span>
        </div>`;
        html += '</div>';
        return html;
    }

    function renderImpactTable(impact, currentGameId, weekNum) {
        let html = '<div class="impact-panel">';

        if (impact.length === 0) {
            html += '<p class="impact-clear">✅ No future games are blocked by this pick!</p>';
        } else {
            html += '<h4>⚠️ Games You Would Opt Out Of By Picking This</h4>';
            html += '<p class="impact-desc">These future games become unavailable. Pick one instead if it\'s a must-see.</p>';
            html += '<table class="impact-table"><thead><tr><th>Week</th><th>Matchup</th><th>Venue</th><th>Reason Blocked</th><th>Action</th></tr></thead><tbody>';

            for (const item of impact) {
                const isCircle = item.isCircleCandidate ? ' ⭐' : '';
                const rankAway = item.game.awayRank ? '#' + item.game.awayRank + ' ' : '';
                const rankHome = item.game.homeRank ? '#' + item.game.homeRank + ' ' : '';
                const alreadyPicked = state.weeklyPicks[item.week] === item.game.id;
                html += `<tr class="${item.isCircleCandidate ? 'impact-circle-row' : ''}">
                    <td>${item.weekLabel}${isCircle}</td>
                    <td>${rankAway}${item.game.away} @ ${rankHome}${item.game.home}</td>
                    <td>${item.game.venue}</td>
                    <td>${item.reasons.join(', ')}</td>
                    <td>${alreadyPicked
                        ? '<span class="meta">Already picked</span>'
                        : `<button class="btn btn-small btn-primary" onclick="app.pickWeek(${item.week}, '${item.game.id}')">Pick for ${item.weekLabel}</button>`
                    }</td>
                </tr>`;
            }

            html += '</tbody></table>';
        }

        // Show available future games that are NOT blocked — user can pick them in advance
        const weeks = Object.keys(SCHEDULE).map(Number).sort((a, b) => a - b);
        const futureWeeks = weeks.filter(w => w > weekNum);
        const availableFuture = [];

        for (const wk of futureWeeks) {
            if (state.weeklyPicks[wk]) continue; // already has a pick
            const weekData = SCHEDULE[wk];
            for (const g of weekData.games) {
                if (isPicked(g.id)) continue;
                if (isGameAvailable(g, wk)) {
                    availableFuture.push({ week: wk, weekLabel: weekData.label, game: g });
                }
            }
        }

        if (availableFuture.length > 0) {
            html += '<h4 style="margin-top:1rem;">📋 Available Future Games — Pick in Advance</h4>';
            html += '<table class="impact-table"><thead><tr><th>Week</th><th>Matchup</th><th>Venue</th><th>Action</th></tr></thead><tbody>';

            for (const item of availableFuture.slice(0, 20)) {
                const rankAway = item.game.awayRank ? '#' + item.game.awayRank + ' ' : '';
                const rankHome = item.game.homeRank ? '#' + item.game.homeRank + ' ' : '';
                html += `<tr>
                    <td>${item.weekLabel}</td>
                    <td>${rankAway}${item.game.away} @ ${rankHome}${item.game.home}</td>
                    <td>${item.game.venue}</td>
                    <td><button class="btn btn-small btn-primary" onclick="app.pickWeek(${item.week}, '${item.game.id}')">Pick for ${item.weekLabel}</button></td>
                </tr>`;
            }

            if (availableFuture.length > 20) {
                html += `<tr><td colspan="4" class="meta" style="padding:0.5rem;">...and ${availableFuture.length - 20} more. Navigate to the week tab to see all.</td></tr>`;
            }

            html += '</tbody></table>';
        }

        html += '</div>';
        return html;
    }

    // ─── Summary ───────────────────────────────────────────────────────
    function renderSummary() {
        const weeks = Object.keys(SCHEDULE).map(Number).sort((a, b) => a - b);
        let hasAnyPick = false;

        let html = '<div class="stats-bar">';
        const uniquePickedWeeks = new Set(Object.keys(state.weeklyPicks).map(Number));
        html += `
            <div class="stat"><span class="stat-value">${state.usedTeams.size}</span><span class="stat-label">Teams Used</span></div>
            <div class="stat"><span class="stat-value">${state.usedVenues.size}</span><span class="stat-label">Venues Visited</span></div>
            <div class="stat"><span class="stat-value">${uniquePickedWeeks.size}/${weeks.length}</span><span class="stat-label">Weeks Filled</span></div>
        `;
        html += '</div>';

        let prevVenue = null;
        for (const weekNum of weeks) {
            const week = SCHEDULE[weekNum];
            const pickId = state.weeklyPicks[weekNum];
            const game = pickId ? getGameById(pickId) : null;

            const circleInWeek = state.circleGames.find(cgId => {
                const cg = getGameById(cgId);
                return cg && (cg.week === weekNum || findWeekForGame(cgId) === weekNum);
            });
            const circleGame = circleInWeek ? getGameById(circleInWeek) : null;
            const displayGame = game || circleGame;
            const isCircle = !!circleGame && !game;

            let rowClass = 'summary-week';
            if (displayGame) {
                hasAnyPick = true;
                rowClass += isCircle ? ' is-circle' : ' has-game';
            }

            html += `
                <div class="${rowClass}">
                    <span class="week-label">${week.label}</span>
                    <span class="game-info">
                        ${displayGame
                            ? `${isCircle ? '⭐ ' : ''}${displayGame.away} @ ${displayGame.home}`
                            : '—'}
                    </span>
                    <span class="venue-info">
                        ${displayGame ? displayGame.venue : ''}
                    </span>
                </div>
            `;

            if (displayGame) prevVenue = displayGame.venue;
        }

        if (!hasAnyPick) {
            html = '<p class="empty-state">Start picking games to see your road trip take shape!</p>';
        }

        summaryContentEl.innerHTML = html;
    }

    // ─── Violations ────────────────────────────────────────────────────
    function checkViolations() {
        const violations = [];
        const teamCount = {};
        const venueCount = {};

        const pickedIds = [...new Set([
            ...state.circleGames,
            ...Object.values(state.weeklyPicks),
        ])];

        const allGames = getAllGames();
        for (const id of pickedIds) {
            const game = allGames.find(g => g.id === id);
            if (!game) continue;
            teamCount[game.home] = (teamCount[game.home] || 0) + 1;
            teamCount[game.away] = (teamCount[game.away] || 0) + 1;
            venueCount[game.venue] = (venueCount[game.venue] || 0) + 1;
        }

        for (const [team, count] of Object.entries(teamCount)) {
            if (count > 1) violations.push(`🚫 No Repeats: ${team} appears in ${count} picks.`);
        }
        for (const [venue, count] of Object.entries(venueCount)) {
            if (count > 1) violations.push(`🏟️ No Repeats: ${venue} appears in ${count} picks.`);
        }

        if (violations.length > 0) {
            violationsPanelEl.hidden = false;
            violationsListEl.innerHTML = violations.map(v => `<li>${v}</li>`).join('');
        } else {
            violationsPanelEl.hidden = true;
            violationsListEl.innerHTML = '';
        }
    }

    // ─── Actions ───────────────────────────────────────────────────────
    function lockCircle(gameId) {
        if (state.circleGames.includes(gameId)) return;
        const game = getGameById(gameId);
        if (!game) return;

        const weekNum = game.week || findWeekForGame(gameId);

        // If this week already has a pick, remove it (including any existing circle game for this week)
        if (weekNum !== null && state.weeklyPicks[weekNum] && state.weeklyPicks[weekNum] !== gameId) {
            const existingPickId = state.weeklyPicks[weekNum];
            // Also remove from circleGames if it was a locked circle game
            state.circleGames = state.circleGames.filter(id => id !== existingPickId);
            delete state.weeklyPicks[weekNum];
        }

        state.circleGames.push(gameId);
        if (weekNum !== null) state.weeklyPicks[weekNum] = gameId;

        rebuildUsedSets();
        saveState();
        renderAll();
    }

    function unlockCircle(gameId) {
        state.circleGames = state.circleGames.filter(id => id !== gameId);
        for (const [week, pickId] of Object.entries(state.weeklyPicks)) {
            if (pickId === gameId) delete state.weeklyPicks[week];
        }
        rebuildUsedSets();
        saveState();
        renderAll();
    }

    function pickWeek(weekNum, gameId) {
        state.weeklyPicks[weekNum] = gameId;
        state.expandedGame = null;
        rebuildUsedSets();
        saveState();
        renderAll();
    }

    function unpickWeek(weekNum) {
        const pickId = state.weeklyPicks[weekNum];
        if (pickId && state.circleGames.includes(pickId)) {
            state.circleGames = state.circleGames.filter(id => id !== pickId);
        }
        delete state.weeklyPicks[weekNum];
        state.expandedGame = null;
        rebuildUsedSets();
        saveState();
        renderAll();
    }

    function setConferenceFilter(conf) {
        state.conferenceFilter = conf;
        renderWeekContent(state.activeWeek);
    }

    function toggleImpact(gameId) {
        state.expandedGame = state.expandedGame === gameId ? null : gameId;
        renderWeekContent(state.activeWeek);
    }

    function resetAll() {
        if (!confirm('Are you sure you want to reset your entire road trip?')) return;
        state.circleGames = [];
        state.weeklyPicks = {};
        state.usedTeams.clear();
        state.usedVenues.clear();
        state.expandedGame = null;
        localStorage.removeItem('egs-roadtrip');
        renderAll();
    }

    function renderAll() {
        renderCircleGames();
        renderWeekTabs();
        renderWeekContent(state.activeWeek);
        renderSummary();
        checkViolations();
    }

    // ─── Circle Game Cards (for Step 1 section) ────────────────────────
    function createGameCard(game, mode) {
        const card = document.createElement('div');
        const locked = isCircleGame(game.id);
        const available = isGameAvailable(game);

        let cardClass = 'game-card';
        if (locked) cardClass += ' circle-locked';
        else if (!available) cardClass += ' unavailable';

        card.className = cardClass;
        const { homeConf, awayConf } = getGameConference(game);
        const confLabel = homeConf === awayConf ? homeConf : `${awayConf} vs ${homeConf}`;

        card.innerHTML = `
            <div class="game-card-main">
                <div class="matchup">
                    <span class="teams">${game.awayRank ? '#' + game.awayRank + ' ' : ''}${game.away} @ ${game.homeRank ? '#' + game.homeRank + ' ' : ''}${game.home}</span>
                    <span class="meta">${game.venue} — ${SCHEDULE[game.week] ? SCHEDULE[game.week].label + ', ' + SCHEDULE[game.week].date : 'Week ' + game.week} — ${game.kickoff}</span>
                </div>
                <div class="badges">
                    <span class="badge badge-conf">${confLabel}</span>
                    ${game.rivalry ? `<span class="badge badge-rivalry">${game.rivalry}</span>` : ''}
                    ${game.ranked ? '<span class="badge badge-ranked">Ranked</span>' : ''}
                    ${locked ? '<span class="badge badge-circle">⭐ Locked</span>' : ''}
                </div>
                <div class="actions">
                    ${locked
                        ? `<button class="btn btn-small btn-remove" onclick="app.unlockCircle('${game.id}')">Unlock</button>`
                        : !available
                            ? '<span class="meta">Team/Venue Used</span>'
                            : (state.weeklyPicks[game.week || findWeekForGame(game.id)])
                                ? '<span class="meta">Week filled</span>'
                                : `<button class="btn btn-small btn-circle" onclick="app.lockCircle('${game.id}')">🔒 Lock In</button>`
                    }
                </div>
            </div>
        `;
        return card;
    }

    // ─── Expose API ────────────────────────────────────────────────────
    window.app = {
        lockCircle,
        unlockCircle,
        pickWeek,
        unpickWeek,
        resetAll,
        setConferenceFilter,
        toggleImpact,
        forcePickGame,
        removeConflict,
    };

    // ─── Boot ──────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();
})();
