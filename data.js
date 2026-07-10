/**
 * ESPN Data Fetcher — Pulls real 2025 college football schedule data.
 * Uses ESPN's public site API.
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
const ESPN_RANKINGS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings';

// Team ID -> rank mapping (fetched from ESPN rankings API)
let TEAM_RANKINGS = {};  // { teamId: rank }

// ESPN conference IDs to names
const CONF_ID_MAP = {
    '1': 'ACC',
    '4': 'Big 12',
    '5': 'Big Ten',
    '8': 'SEC',
    '9': 'Pac-12',
    '12': 'C-USA',
    '15': 'MAC',
    '17': 'MWC',
    '37': 'Sun Belt',
    '151': 'AAC',
    '18': 'Ind',  // Independent (UConn etc.)
};

const CONFERENCES = ['All', 'SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'AAC', 'MWC', 'Sun Belt', 'MAC', 'C-USA', 'Ind'];

// We'll map team conferenceId -> conference name at runtime
const TEAM_CONFERENCES = {};

// Venue coordinate cache (populated from ESPN data where available, supplemented)
const VENUES = {};

// Known venue coordinates for major stadiums (ESPN doesn't always provide coords)
const VENUE_COORDS = {
    'Ohio Stadium': { lat: 40.0017, lng: -83.0196 },
    'Michigan Stadium': { lat: 42.2658, lng: -83.7486 },
    'Kyle Field': { lat: 30.6100, lng: -96.3400 },
    'Tiger Stadium': { lat: 30.4120, lng: -91.1837 },
    'Neyland Stadium': { lat: 35.9550, lng: -83.9250 },
    'Bryant-Denny Stadium': { lat: 33.2084, lng: -87.5504 },
    'Sanford Stadium': { lat: 33.9497, lng: -83.3733 },
    'Darrell K Royal-Texas Memorial Stadium': { lat: 30.2836, lng: -97.7325 },
    'Cotton Bowl': { lat: 32.7773, lng: -96.7587 },
    'Jordan-Hare Stadium': { lat: 32.6021, lng: -85.4900 },
    'Beaver Stadium': { lat: 40.8122, lng: -77.8561 },
    'Memorial Stadium': { lat: 34.6785, lng: -82.8436 },
    'Rose Bowl': { lat: 34.1613, lng: -118.1676 },
    'Los Angeles Memorial Coliseum': { lat: 34.0141, lng: -118.2879 },
    'United Airlines Field at the Los Angeles Memorial Coliseum': { lat: 34.0141, lng: -118.2879 },
    'Autzen Stadium': { lat: 44.0584, lng: -123.0678 },
    'Husky Stadium': { lat: 47.6503, lng: -122.3016 },
    'Camp Randall Stadium': { lat: 43.0700, lng: -89.4128 },
    'Memorial Stadium, Lincoln': { lat: 40.8206, lng: -96.7057 },
    'Doak S. Campbell Stadium': { lat: 30.4380, lng: -84.3043 },
    'Doak Campbell Stadium': { lat: 30.4380, lng: -84.3043 },
    'Ben Hill Griffin Stadium': { lat: 29.6500, lng: -82.3486 },
    'Williams-Brice Stadium': { lat: 33.9726, lng: -81.0199 },
    'Davis Wade Stadium': { lat: 33.4558, lng: -88.7934 },
    'Vaught-Hemingway Stadium': { lat: 34.3618, lng: -89.5345 },
    'Boone Pickens Stadium': { lat: 36.1260, lng: -97.0659 },
    'Gaylord Family-Oklahoma Memorial Stadium': { lat: 35.2058, lng: -97.4423 },
    'LaVell Edwards Stadium': { lat: 40.2573, lng: -111.6545 },
    'Rice-Eccles Stadium': { lat: 40.7601, lng: -111.8488 },
    'Notre Dame Stadium': { lat: 41.6983, lng: -86.2340 },
    'AT&T Stadium': { lat: 32.7473, lng: -97.0945 },
    'Mercedes-Benz Stadium': { lat: 33.7553, lng: -84.4006 },
    'Hard Rock Stadium': { lat: 25.9580, lng: -80.2389 },
    'Camping World Stadium': { lat: 28.5392, lng: -81.4031 },
    'Lincoln Financial Field': { lat: 39.9008, lng: -75.1675 },
    'Jack Trice Stadium': { lat: 42.0140, lng: -93.6358 },
    'Kinnick Stadium': { lat: 41.6588, lng: -91.5509 },
    'Spartan Stadium': { lat: 42.7284, lng: -84.4823 },
    'Huntington Bank Stadium': { lat: 44.9765, lng: -93.2246 },
    'McLane Stadium': { lat: 31.5588, lng: -97.1153 },
    'Jones AT&T Stadium': { lat: 33.5908, lng: -101.8725 },
    'Stanford Stadium': { lat: 37.4346, lng: -122.1609 },
    'Folsom Field': { lat: 40.0094, lng: -105.2669 },
    'Mountain America Stadium': { lat: 33.4264, lng: -111.9325 },
    'Arizona Stadium': { lat: 32.2284, lng: -110.9488 },
    'DKR-Texas Memorial Stadium': { lat: 30.2836, lng: -97.7325 },
    'Donald W. Reynolds Razorback Stadium': { lat: 36.2114, lng: -94.1793 },
    'Razorback Stadium': { lat: 36.2114, lng: -94.1793 },
    'EverBank Stadium': { lat: 30.3240, lng: -81.6374 },
    'TIAA Bank Field': { lat: 30.3240, lng: -81.6374 },
    'Bobby Dodd Stadium': { lat: 33.7724, lng: -84.3927 },
    'Acrisure Stadium': { lat: 40.4468, lng: -80.0158 },
    'Bill Snyder Family Stadium': { lat: 39.2017, lng: -96.5938 },
    'Gerald J. Ford Stadium': { lat: 32.8361, lng: -96.7830 },
    'Allegiant Stadium': { lat: 36.0907, lng: -115.1833 },
    'Caesars Superdome': { lat: 29.9511, lng: -90.0812 },
    'Protective Stadium': { lat: 33.5244, lng: -86.8029 },
    'Reliant Stadium': { lat: 29.6847, lng: -95.4107 },
    'NRG Stadium': { lat: 29.6847, lng: -95.4107 },
};

// Major rivalries to flag
const RIVALRY_NAMES = {
    'Texas vs Oklahoma': 'Red River Rivalry',
    'Oklahoma vs Texas': 'Red River Rivalry',
    'Michigan vs Ohio State': 'The Game',
    'Ohio State vs Michigan': 'The Game',
    'Auburn vs Alabama': 'Iron Bowl',
    'Alabama vs Auburn': 'Iron Bowl',
    'Florida State vs Florida': 'Sunshine Showdown',
    'Florida vs Florida State': 'Sunshine Showdown',
    'Clemson vs South Carolina': 'Palmetto Bowl',
    'South Carolina vs Clemson': 'Palmetto Bowl',
    'Georgia vs Georgia Tech': "Clean Old-Fashioned Hate",
    'Georgia Tech vs Georgia': "Clean Old-Fashioned Hate",
    'Oklahoma vs Oklahoma State': 'Bedlam',
    'Oklahoma State vs Oklahoma': 'Bedlam',
    'USC vs UCLA': 'Victory Bell',
    'UCLA vs USC': 'Victory Bell',
    'Oregon vs Oregon State': 'Civil War',
    'Oregon State vs Oregon': 'Civil War',
    'Iowa vs Iowa State': "Cy-Hawk",
    'Iowa State vs Iowa': "Cy-Hawk",
    'Notre Dame vs USC': 'Greatest Intersectional Rivalry',
    'USC vs Notre Dame': 'Greatest Intersectional Rivalry',
    'Texas vs Texas A&M': 'Lone Star Showdown',
    'Texas A&M vs Texas': 'Lone Star Showdown',
    'Alabama vs Tennessee': 'Third Saturday in October',
    'Tennessee vs Alabama': 'Third Saturday in October',
    'Alabama vs LSU': "Tiger-Tide",
    'LSU vs Alabama': "Tiger-Tide",
    'Georgia vs Florida': "World's Largest Cocktail Party",
    'Florida vs Georgia': "World's Largest Cocktail Party",
    'Michigan vs Michigan State': 'Paul Bunyan Trophy',
    'Michigan State vs Michigan': 'Paul Bunyan Trophy',
    'Army vs Navy': 'Army-Navy Game',
    'Navy vs Army': 'Army-Navy Game',
};

// Power conference teams filter — only show games with at least one ranked team
// or at least one team from these conference IDs
const POWER_CONF_IDS = new Set(['1', '4', '5', '8']);

// The schedule object populated by fetch
let SCHEDULE = {};
let CIRCLE_GAMES = [];
let DATA_LOADED = false;

/**
 * Fetch the full 2025 regular season schedule from ESPN
 */
async function fetchESPNSchedule() {
    // First, fetch rankings to supplement scoreboard data
    try {
        const rankData = await fetch(ESPN_RANKINGS_URL).then(r => r.json());
        const rankings = rankData.rankings || [];
        // Use AP Top 25 if available, else first poll
        const apPoll = rankings.find(r => r.type === 'ap') || rankings[0];
        if (apPoll && apPoll.ranks) {
            for (const entry of apPoll.ranks) {
                if (entry.current <= 25 && entry.team) {
                    TEAM_RANKINGS[entry.team.id] = entry.current;
                }
            }
        }
    } catch (e) {
        console.warn('Could not fetch rankings:', e);
    }

    const weeks = [];

    // ESPN weeks 1-15 for 2025 regular season
    // We fetch FBS games (groups=80)
    for (let week = 1; week <= 15; week++) {
        weeks.push(week);
    }

    const schedule = {};
    const circleGames = [];

    // Fetch all weeks in parallel (batched)
    const batchSize = 5;
    for (let i = 0; i < weeks.length; i += batchSize) {
        const batch = weeks.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(week =>
                fetch(`${ESPN_BASE}?week=${week}&seasontype=2&groups=80&limit=100&year=2025`)
                    .then(r => r.json())
                    .catch(() => null)
            )
        );

        for (let j = 0; j < batch.length; j++) {
            const weekNum = batch[j];
            const data = results[j];
            if (!data || !data.events) continue;

            const weekGames = [];
            const weekLabel = `Week ${weekNum}`;
            let weekDate = '';

            // Find the date range from calendar
            if (data.leagues && data.leagues[0] && data.leagues[0].calendar) {
                const cal = data.leagues[0].calendar;
                for (const season of cal) {
                    if (season.entries) {
                        const entry = season.entries.find(e => e.value === String(weekNum));
                        if (entry) {
                            weekDate = entry.detail || '';
                        }
                    }
                }
            }

            for (const event of data.events) {
                const comp = event.competitions[0];
                if (!comp || !comp.competitors || comp.competitors.length < 2) continue;

                const homeTeamData = comp.competitors.find(c => c.homeAway === 'home');
                const awayTeamData = comp.competitors.find(c => c.homeAway === 'away');
                if (!homeTeamData || !awayTeamData) continue;

                const homeTeam = homeTeamData.team.shortDisplayName || homeTeamData.team.displayName;
                const awayTeam = awayTeamData.team.shortDisplayName || awayTeamData.team.displayName;
                const homeConfId = String(homeTeamData.team.conferenceId || '');
                const awayConfId = String(awayTeamData.team.conferenceId || '');

                // Filter: only show games where at least one team is from a power conference
                // or the game is between two ranked teams
                // Use curatedRank from scoreboard, fall back to fetched AP rankings
                const homeCuratedRank = homeTeamData.curatedRank && homeTeamData.curatedRank.current < 99
                    ? homeTeamData.curatedRank.current
                    : (TEAM_RANKINGS[homeTeamData.id] || null);
                const awayCuratedRank = awayTeamData.curatedRank && awayTeamData.curatedRank.current < 99
                    ? awayTeamData.curatedRank.current
                    : (TEAM_RANKINGS[awayTeamData.id] || null);
                const homeRanked = homeCuratedRank !== null && homeCuratedRank <= 25;
                const awayRanked = awayCuratedRank !== null && awayCuratedRank <= 25;
                const hasPowerTeam = POWER_CONF_IDS.has(homeConfId) || POWER_CONF_IDS.has(awayConfId);

                if (!hasPowerTeam && !homeRanked && !awayRanked) continue;

                // Skip games where a power team plays a non-FBS or very weak opponent
                // (keep if both are power, or opponent is ranked, or it's a rivalry)
                const rivalryKey = `${awayTeam} vs ${homeTeam}`;
                const rivalry = RIVALRY_NAMES[rivalryKey] || '';

                const bothPower = POWER_CONF_IDS.has(homeConfId) && POWER_CONF_IDS.has(awayConfId);
                const isRankedMatchup = homeRanked || awayRanked;

                // Only include meaningful games
                if (!bothPower && !isRankedMatchup && !rivalry) continue;

                // Build venue info
                const venue = comp.venue ? comp.venue.fullName : 'TBD';
                const venueCity = comp.venue && comp.venue.address
                    ? `${comp.venue.address.city}, ${comp.venue.address.state}`
                    : '';

                // Register venue coordinates
                if (venue && !VENUES[venue]) {
                    if (VENUE_COORDS[venue]) {
                        VENUES[venue] = { city: venueCity, ...VENUE_COORDS[venue] };
                    } else {
                        VENUES[venue] = { city: venueCity, lat: null, lng: null };
                    }
                }

                // Register team conferences
                if (homeTeam && homeConfId) {
                    TEAM_CONFERENCES[homeTeam] = CONF_ID_MAP[homeConfId] || 'Other';
                }
                if (awayTeam && awayConfId) {
                    TEAM_CONFERENCES[awayTeam] = CONF_ID_MAP[awayConfId] || 'Other';
                }

                // Parse kickoff time
                const gameDate = new Date(event.date);
                const kickoff = gameDate.toLocaleString('en-US', {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                });

                const ranked = homeRanked || awayRanked;
                const neutralSite = comp.neutralSite || false;

                // Get team logos
                const homeLogo = homeTeamData.team.logos && homeTeamData.team.logos[0]
                    ? homeTeamData.team.logos[0].href
                    : `https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeamData.id}.png`;
                const awayLogo = awayTeamData.team.logos && awayTeamData.team.logos[0]
                    ? awayTeamData.team.logos[0].href
                    : `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeamData.id}.png`;

                const gameObj = {
                    id: `espn-${event.id}`,
                    week: weekNum,
                    away: awayTeam,
                    home: homeTeam,
                    awayLogo: awayLogo,
                    homeLogo: homeLogo,
                    venue: venue,
                    venueCity: venueCity,
                    kickoff: kickoff,
                    ranked: ranked,
                    homeRank: homeRanked ? homeCuratedRank : null,
                    awayRank: awayRanked ? awayCuratedRank : null,
                    rivalry: rivalry,
                    neutralSite: neutralSite,
                    espnId: event.id,
                };

                weekGames.push(gameObj);

                // Identify circle game candidates (rivalries or both teams ranked)
                if (rivalry || (homeRanked && awayRanked)) {
                    circleGames.push(gameObj);
                }
            }

            // Sort games: rivalries first, then ranked matchups, then by time
            weekGames.sort((a, b) => {
                if (a.rivalry && !b.rivalry) return -1;
                if (!a.rivalry && b.rivalry) return 1;
                if (a.homeRank && a.awayRank && !(b.homeRank && b.awayRank)) return -1;
                if (!(a.homeRank && a.awayRank) && b.homeRank && b.awayRank) return 1;
                return 0;
            });

            schedule[weekNum] = {
                label: weekLabel,
                date: weekDate,
                games: weekGames,
            };
        }
    }

    SCHEDULE = schedule;
    CIRCLE_GAMES = circleGames;
    DATA_LOADED = true;
}
