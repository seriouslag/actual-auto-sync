import fs from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN is required.');
}

const repos = [{ owner: 'seriouslag', repo: 'actual-auto-sync' }];

const timeZone = 'America/Indiana/Indianapolis';

const getParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const getLocalDateKey = (date) => {
  const parts = getParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const githubFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${body}`);
  }

  return response;
};

const getRepository = async ({ owner, repo }) => {
  const response = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
  return response.json();
};

const getStargazers = async ({ owner, repo }) => {
  const stargazers = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=100&page=${page}`;
    const response = await githubFetch(url, {
      headers: { accept: 'application/vnd.github.star+json' },
    });
    const pageItems = await response.json();

    stargazers.push(...pageItems);

    if (pageItems.length < 100) break;
    page += 1;
  }

  return stargazers;
};

const now = new Date();
const todayParts = getParts(now);
const todayUtcMidnight = new Date(
  `${todayParts.year}-${todayParts.month}-${todayParts.day}T00:00:00Z`,
);
const previousDayUtcMidnight = new Date(todayUtcMidnight.getTime() - 24 * 60 * 60 * 1000);
const previousDayKey = getLocalDateKey(previousDayUtcMidnight);

const repositories = [];

for (const repoRef of repos) {
  const repository = await getRepository(repoRef);
  const stargazers = await getStargazers(repoRef);
  const newStargazersPreviousDay = stargazers
    .filter((stargazer) => getLocalDateKey(new Date(stargazer.starred_at)) === previousDayKey)
    .map((stargazer) => ({
      htmlUrl: stargazer.user?.html_url ?? null,
      login: stargazer.user?.login ?? null,
      starredAt: stargazer.starred_at,
    }));

  repositories.push({
    fullName: `${repoRef.owner}/${repoRef.repo}`,
    newStargazersPreviousDay,
    newStarsPreviousDay: newStargazersPreviousDay.length,
    stars: repository.stargazers_count,
  });
}

const output = {
  generatedAt: now.toISOString(),
  repositories,
  window: {
    previousDay: previousDayKey,
    timezone: timeZone,
  },
};

await fs.writeFile('.github/repo-stats.json', `${JSON.stringify(output, null, 2)}\n`);
