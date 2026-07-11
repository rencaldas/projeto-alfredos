import { Buffer } from 'node:buffer';
import { loadHistory, markSent, saveHistory, uniqueUnsent } from './history.mjs';
import { optionalEnv, requireEnv, sendTelegramMessage } from './telegram.mjs';

const HISTORY_PATH = '.github/state/sentinela-history.json';
const DEFAULT_MAX_REPOS = 100;
const DEFAULT_MAX_ALERTS = 25;
const DEFAULT_MAX_DEPENDENCIES_PER_REPO = 800;
const DEFAULT_UPDATE_MAJOR_GAP = 1;
const OSV_BATCH_SIZE = 1000;
const GITHUB_API = 'https://api.github.com';

const botToken = optionalEnv(
  'ALFREDO_SENTINELA_BOT_TOKEN',
  optionalEnv('TELEGRAM_SENTINELA_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)
);
const chatId = optionalEnv(
  'ALFREDO_SENTINELA_BOT_CHAT_ID',
  optionalEnv('TELEGRAM_SENTINELA_CHAT_ID', process.env.TELEGRAM_CHAT_ID)
);
const githubToken = optionalEnv('ALFREDO_SENTINELA_GITHUB_TOKEN', process.env.GITHUB_TOKEN);
const maxRepos = numberEnv('SENTINELA_MAX_REPOS', DEFAULT_MAX_REPOS);
const maxAlerts = numberEnv('SENTINELA_MAX_ALERTS', DEFAULT_MAX_ALERTS);
const maxDependenciesPerRepo = numberEnv('SENTINELA_MAX_DEPENDENCIES_PER_REPO', DEFAULT_MAX_DEPENDENCIES_PER_REPO);
const includeArchived = boolEnv('SENTINELA_INCLUDE_ARCHIVED', false);
const updateMajorGap = numberEnv('SENTINELA_UPDATE_MAJOR_GAP', DEFAULT_UPDATE_MAJOR_GAP);

if (!botToken) {
  requireEnv('ALFREDO_SENTINELA_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('ALFREDO_SENTINELA_BOT_CHAT_ID');
}

if (!githubToken) {
  requireEnv('ALFREDO_SENTINELA_GITHUB_TOKEN');
}

const history = await loadHistory(HISTORY_PATH);
const targets = parseTargets(optionalEnv('SENTINELA_TARGETS', ''));
const repositories = await discoverRepositories(targets);
const selectedRepositories = repositories
  .filter((repo) => includeArchived || !repo.archived)
  .slice(0, maxRepos);

const audits = [];
const allDependencies = [];

for (const repo of selectedRepositories) {
  try {
    const audit = await auditRepository(repo);
    audits.push(audit);
    allDependencies.push(...audit.dependencies);
    console.log(`${repo.full_name}: ${audit.dependencies.length} dependências detectadas.`);
  } catch (error) {
    audits.push({
      repo,
      dependencies: [],
      ecosystems: [],
      vulnerable: [],
      outdated: [],
      errors: [error.message]
    });
    console.warn(`${repo.full_name}: ${error.message}`);
  }
}

const vulnerabilityMatches = await queryOsv(allDependencies);
for (const match of vulnerabilityMatches) {
  match.dependency.vulnerabilities = match.vulnerabilities;
}

await annotateLatestVersions(allDependencies);

for (const audit of audits) {
  audit.vulnerable = audit.dependencies
    .filter((dependency) => dependency.vulnerabilities?.length > 0)
    .flatMap((dependency) => dependency.vulnerabilities.map((vulnerability) => ({ dependency, vulnerability })))
    .sort(compareVulnerabilityAlerts);
  audit.outdated = audit.dependencies
    .filter((dependency) => dependency.latestVersion && dependency.version !== dependency.latestVersion)
    .map((dependency) => ({ dependency, update: classifyUpdate(dependency.version, dependency.latestVersion) }))
    .filter((item) => item.update.isRelevant)
    .sort(compareUpdateAlerts);
}

const criticalAlerts = audits.flatMap((audit) =>
  audit.vulnerable
    .filter((item) => isCriticalVulnerability(item.vulnerability))
    .map((item) => ({ repo: audit.repo, ...item }))
);
const vulnerableAlerts = audits.flatMap((audit) =>
  audit.vulnerable.map((item) => ({ repo: audit.repo, ...item }))
);
const outdatedAlerts = audits.flatMap((audit) =>
  audit.outdated.map((item) => ({ repo: audit.repo, ...item }))
);

const alertCandidates = [...criticalAlerts, ...vulnerableAlerts, ...outdatedAlerts]
  .filter(uniqueAlertObject)
  .sort(compareAlerts)
  .slice(0, maxAlerts);
const unsentAlerts = uniqueUnsent(alertCandidates, history, alertHistoryId);

const summary = buildSummary({ audits, allDependencies, vulnerableAlerts, outdatedAlerts, selectedRepositories });
const message = buildTelegramReport(summary, unsentAlerts);

await sendTelegramMessage({ botToken, chatId, text: message });

for (const alert of unsentAlerts) {
  markSent(history, alertHistoryId(alert));
}

await saveHistory(history);
console.log(`Relatório enviado. Repositórios: ${selectedRepositories.length}. Alertas novos: ${unsentAlerts.length}.`);

async function discoverRepositories(targets) {
  if (targets.length === 0) {
    return githubPaginated('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=full_name');
  }

  const repos = [];
  for (const target of targets) {
    if (target.kind === 'repo') {
      repos.push(await githubJson(`/repos/${target.value}`));
      continue;
    }

    const endpoint =
      target.kind === 'org'
        ? `/orgs/${target.value}/repos?per_page=100&type=all&sort=full_name`
        : `/users/${target.value}/repos?per_page=100&type=owner&sort=full_name`;
    repos.push(...(await githubPaginated(endpoint)));
  }

  return Array.from(new Map(repos.map((repo) => [repo.full_name, repo])).values());
}

async function auditRepository(repo) {
  const branch = repo.default_branch;
  const tree = await githubJson(`/repos/${repo.full_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const files = Array.isArray(tree.tree) ? tree.tree.filter((entry) => entry.type === 'blob') : [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const selectedFiles = selectDependencyFiles(byPath);
  const dependencies = [];
  const ecosystems = new Set();
  const errors = tree.truncated ? ['A árvore de arquivos veio truncada pela API do GitHub; alguns manifestos podem não ter sido analisados.'] : [];

  for (const selected of selectedFiles) {
    const content = await readRepositoryFile(repo.full_name, selected.path, branch);
    const parsed = selected.parser(content, selected.path, repo.full_name);
    for (const dependency of parsed) {
      ecosystems.add(dependency.ecosystem);
      dependencies.push(dependency);
    }
  }

  return {
    repo,
    dependencies: dedupeDependencies(dependencies).slice(0, maxDependenciesPerRepo),
    ecosystems: Array.from(ecosystems).sort(),
    vulnerable: [],
    outdated: [],
    errors
  };
}

function selectDependencyFiles(byPath) {
  const selectors = [
    ['package-lock.json', parsePackageLock],
    ['pnpm-lock.yaml', parsePnpmLock],
    ['yarn.lock', parseYarnLock],
    ['composer.lock', parseComposerLock],
    ['go.sum', parseGoSum],
    ['poetry.lock', parsePoetryLock],
    ['Pipfile.lock', parsePipfileLock],
    ['Cargo.lock', parseCargoLock],
    ['packages.lock.json', parseNugetLock]
  ];
  const selected = [];
  const paths = Array.from(byPath.keys()).filter((path) => !isIgnoredPath(path));

  for (const [name, parser] of selectors) {
    for (const path of paths) {
      if (path.endsWith(name)) {
        selected.push({ path, parser });
      }
    }
  }

  for (const path of paths) {
    const basename = path.split('/').pop();
    if (basename === 'requirements.txt') selected.push({ path, parser: parseRequirementsTxt });
    if (basename === 'pom.xml') selected.push({ path, parser: parsePomXml });
    if (basename === 'build.gradle' || basename === 'build.gradle.kts') selected.push({ path, parser: parseGradle });
    if (basename.endsWith('.csproj')) selected.push({ path, parser: parseCsproj });
    if (basename === 'Dockerfile' || basename.endsWith('.Dockerfile')) selected.push({ path, parser: parseDockerfile });
  }

  return selected;
}

function isIgnoredPath(path) {
  return /(^|\/)(node_modules|vendor|target|bin|obj|dist|build|coverage)\//.test(path);
}

async function readRepositoryFile(fullName, path, ref) {
  const file = await githubJson(`/repos/${fullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
  if (file.encoding !== 'base64' || !file.content) {
    throw new Error(`Nao foi possível ler ${path}.`);
  }

  return Buffer.from(file.content, 'base64').toString('utf8');
}

function parsePackageLock(content, path, repoName) {
  const json = safeJson(content);
  const dependencies = [];

  for (const [packagePath, info] of Object.entries(json.packages || {})) {
    if (!packagePath || !packagePath.includes('node_modules/') || !info?.version) continue;
    dependencies.push(dependency(repoName, 'npm', npmNameFromNodeModulesPath(packagePath), info.version, path));
  }

  if (dependencies.length === 0) {
    walkObject(json.dependencies || {}, (name, info) => {
      if (info?.version) dependencies.push(dependency(repoName, 'npm', name, info.version, path));
    });
  }

  return dependencies;
}

function parsePnpmLock(content, path, repoName) {
  return Array.from(content.matchAll(/^\s{2}\/((?:@[^/\s]+\/)?[^@\s/]+)@([^:\s(]+).*:/gm), (match) =>
    dependency(repoName, 'npm', match[1], match[2], path)
  );
}

function parseYarnLock(content, path, repoName) {
  const dependencies = [];
  const blocks = content.split(/\n(?=\S)/g);

  for (const block of blocks) {
    const header = block.split('\n')[0] || '';
    const version = block.match(/^\s{2}version\s+"?([^"\n]+)"?/m)?.[1];
    if (!version) continue;

    const names = header
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .map((entry) => entry.startsWith('@') ? entry.replace(/@[^@]+$/, '') : entry.replace(/@.*$/, ''))
      .filter(Boolean);

    for (const name of names) {
      dependencies.push(dependency(repoName, 'npm', name, version, path));
    }
  }

  return dependencies;
}

function parseComposerLock(content, path, repoName) {
  const json = safeJson(content);
  return [...(json.packages || []), ...(json['packages-dev'] || [])]
    .filter((pkg) => pkg.name && pkg.version)
    .map((pkg) => dependency(repoName, 'Packagist', pkg.name, normalizeVersion(pkg.version), path));
}

function parseGoSum(content, path, repoName) {
  return Array.from(content.matchAll(/^(\S+)\s+(v[^\s/]+)(?:\/go\.mod)?\s+h1:/gm), (match) =>
    dependency(repoName, 'Go', match[1], match[2], path)
  );
}

function parsePoetryLock(content, path, repoName) {
  const packages = content.split(/\n\[\[package\]\]\n/g);
  return packages.flatMap((block) => {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    return name && version ? [dependency(repoName, 'PyPI', name, version, path)] : [];
  });
}

function parsePipfileLock(content, path, repoName) {
  const json = safeJson(content);
  return ['default', 'develop'].flatMap((section) =>
    Object.entries(json[section] || {})
      .map(([name, info]) => [name, String(info.version || '').replace(/^==/, '')])
      .filter(([, version]) => version)
      .map(([name, version]) => dependency(repoName, 'PyPI', name, version, path))
  );
}

function parseRequirementsTxt(content, path, repoName) {
  return Array.from(content.matchAll(/^([A-Za-z0-9_.-]+)==([^\s;#]+)/gm), (match) =>
    dependency(repoName, 'PyPI', match[1], match[2], path)
  );
}

function parseCargoLock(content, path, repoName) {
  const packages = content.split(/\n\[\[package\]\]\n/g);
  return packages.flatMap((block) => {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    return name && version ? [dependency(repoName, 'crates.io', name, version, path)] : [];
  });
}

function parseNugetLock(content, path, repoName) {
  const json = safeJson(content);
  const dependencies = [];
  for (const target of Object.values(json.dependencies || {})) {
    for (const [name, info] of Object.entries(target || {})) {
      if (info.resolved) dependencies.push(dependency(repoName, 'NuGet', name, info.resolved, path));
    }
  }

  return dependencies;
}

function parseCsproj(content, path, repoName) {
  return Array.from(content.matchAll(/<PackageReference\b[^>]*Include="([^"]+)"[^>]*(?:Version="([^"]+)")?[^>]*>(?:[\s\S]*?<Version>([^<]+)<\/Version>)?/g), (match) =>
    dependency(repoName, 'NuGet', match[1], match[2] || match[3], path)
  ).filter((item) => item.version && !item.version.includes('$('));
}

function parsePomXml(content, path, repoName) {
  return Array.from(content.matchAll(/<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g), (match) =>
    dependency(repoName, 'Maven', `${match[1]}:${match[2]}`, match[3], path)
  ).filter((item) => item.version && !item.version.includes('${'));
}

function parseGradle(content, path, repoName) {
  const quoted = Array.from(content.matchAll(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^:'"]+):([^:'"]+):([^'"]+)['"]/g), (match) =>
    dependency(repoName, 'Maven', `${match[1]}:${match[2]}`, match[3], path)
  );
  const named = Array.from(content.matchAll(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*group:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*version:\s*['"]([^'"]+)['"]/g), (match) =>
    dependency(repoName, 'Maven', `${match[1]}:${match[2]}`, match[3], path)
  );

  return [...quoted, ...named].filter((item) => !item.version.includes('$'));
}

function parseDockerfile(content, path, repoName) {
  return Array.from(content.matchAll(/^FROM\s+(?:--platform=\S+\s+)?([^\s:@]+(?:\/[^\s:@]+)*)(?::([^\s@]+))?/gim), (match) =>
    dependency(repoName, 'Docker', match[1], match[2] || 'latest', path)
  );
}

async function queryOsv(dependencies) {
  const supported = dependencies.filter((item) => osvEcosystem(item.ecosystem));
  const matches = [];

  for (let index = 0; index < supported.length; index += OSV_BATCH_SIZE) {
    const batch = supported.slice(index, index + OSV_BATCH_SIZE);
    const result = await fetchJson('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: batch.map((item) => ({
          package: { ecosystem: osvEcosystem(item.ecosystem), name: item.name },
          version: item.version
        }))
      })
    });

    (result.results || []).forEach((entry, offset) => {
      const vulnerabilities = entry.vulns || [];
      if (vulnerabilities.length > 0) {
        matches.push({ dependency: batch[offset], vulnerabilities });
      }
    });
  }

  return matches;
}

async function annotateLatestVersions(dependencies) {
  const unique = Array.from(new Map(dependencies.map((item) => [`${item.ecosystem}:${item.name}`, item])).values());
  const cache = new Map();

  for (const item of unique) {
    try {
      const latest = await latestVersion(item);
      if (latest) cache.set(`${item.ecosystem}:${item.name}`, latest);
    } catch (error) {
      console.warn(`Nao foi possível consultar versão recente de ${item.ecosystem}:${item.name}: ${error.message}`);
    }
  }

  for (const item of dependencies) {
    item.latestVersion = cache.get(`${item.ecosystem}:${item.name}`) || null;
  }
}

async function latestVersion(item) {
  if (item.ecosystem === 'npm') {
    const payload = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(item.name).replaceAll('%2F', '/')}`);
    return payload['dist-tags']?.latest || null;
  }

  if (item.ecosystem === 'PyPI') {
    const payload = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(item.name)}/json`);
    return payload.info?.version || null;
  }

  if (item.ecosystem === 'Packagist') {
    const payload = await fetchJson(`https://repo.packagist.org/p2/${item.name}.json`);
    return payload.packages?.[item.name]?.[0]?.version_normalized?.replace(/\.0$/, '') || payload.packages?.[item.name]?.[0]?.version || null;
  }

  if (item.ecosystem === 'crates.io') {
    const payload = await fetchJson(`https://crates.io/api/v1/crates/${encodeURIComponent(item.name)}`);
    return payload.crate?.newest_version || payload.crate?.max_version || null;
  }

  if (item.ecosystem === 'NuGet') {
    const index = await fetchJson('https://api.nuget.org/v3/index.json');
    const base = index.resources?.find((resource) => resource['@type'] === 'PackageBaseAddress/3.0.0')?.['@id'];
    if (!base) return null;
    const payload = await fetchJson(`${base}${item.name.toLowerCase()}/index.json`);
    return payload.versions?.at(-1) || null;
  }

  if (item.ecosystem === 'Go') {
    const payload = await fetchJson(`https://proxy.golang.org/${encodeURIComponent(item.name).replaceAll('%2F', '/')}/@latest`);
    return payload.Version || null;
  }

  if (item.ecosystem === 'Maven') {
    const [group, artifact] = item.name.split(':');
    const query = new URLSearchParams({ q: `g:"${group}" AND a:"${artifact}"`, rows: '1', wt: 'json' });
    const payload = await fetchJson(`https://search.maven.org/solrsearch/select?${query}`);
    return payload.response?.docs?.[0]?.latestVersion || null;
  }

  return null;
}

function buildSummary({ audits, allDependencies, vulnerableAlerts, outdatedAlerts, selectedRepositories }) {
  const criticalProjects = new Set(
    vulnerableAlerts.filter((alert) => isCriticalVulnerability(alert.vulnerability)).map((alert) => alert.repo.full_name)
  );

  return {
    repositories: selectedRepositories.length,
    dependencies: allDependencies.length,
    ecosystems: Array.from(new Set(allDependencies.map((item) => item.ecosystem))).sort(),
    criticalProjects: criticalProjects.size,
    vulnerableProjects: new Set(vulnerableAlerts.map((alert) => alert.repo.full_name)).size,
    outdatedProjects: new Set(outdatedAlerts.map((alert) => alert.repo.full_name)).size,
    vulnerabilities: vulnerableAlerts.length,
    criticalVulnerabilities: vulnerableAlerts.filter((alert) => isCriticalVulnerability(alert.vulnerability)).length,
    updates: outdatedAlerts.length,
    errors: audits.flatMap((audit) => audit.errors.map((error) => `${audit.repo.full_name}: ${error}`))
  };
}

function buildTelegramReport(summary, alerts) {
  const lines = [
    'Alfredo Sentinela - relatório de segurança',
    '',
    `Repositórios analisados: ${summary.repositories}`,
    `Dependências verificadas: ${summary.dependencies}`,
    `Ecossistemas detectados: ${summary.ecosystems.join(', ') || 'nenhum'}`,
    `Projetos com vulnerabilidades críticas: ${summary.criticalProjects}`,
    `Projetos com vulnerabilidades: ${summary.vulnerableProjects}`,
    `Projetos com atualizações disponiveis: ${summary.outdatedProjects}`,
    `Vulnerabilidades encontradas: ${summary.vulnerabilities} (${summary.criticalVulnerabilities} críticas ou exploradas)`,
    `Atualizações relevantes: ${summary.updates}`,
    ''
  ];

  if (alerts.length === 0) {
    lines.push('Nenhum alerta inédito para enviar nesta execução.');
  } else {
    lines.push('Alertas inéditos:');
    for (const alert of alerts) {
      lines.push('', formatAlert(alert));
    }
  }

  if (summary.errors.length > 0) {
    lines.push('', 'Repositórios com erro de auditoria:');
    for (const error of summary.errors.slice(0, 5)) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join('\n');
}

function formatAlert(alert) {
  if (alert.vulnerability) {
    const dep = alert.dependency;
    const vulnerability = alert.vulnerability;
    const fixed = fixedVersions(vulnerability, dep);
    const severity = highestSeverity(vulnerability);
    const aliases = [vulnerability.id, ...(vulnerability.aliases || [])].filter(Boolean).join(', ');
    return [
      `- [${severity}] ${alert.repo.full_name}`,
      `  Dependência: ${dep.name} (${dep.ecosystem})`,
      `  Versão instalada: ${dep.version}`,
      `  Versão que corrige: ${fixed || 'verificar advisory'}`,
      `  Vulnerabilidade: ${aliases}`,
      `  Arquivo: ${dep.file}`,
      `  Recomendação: atualizar ${dep.name}${fixed ? ` para ${fixed} ou superior` : ' para a versão segura indicada pelo mantenedor'}.`
    ].join('\n');
  }

  const dep = alert.dependency;
  return [
    `- [UPDATE] ${alert.repo.full_name}`,
    `  Repositório: ${alert.repo.html_url}`,
    `  Dependência: ${dep.name} (${dep.ecosystem})`,
    `  Versão instalada: ${dep.version}`,
    `  Versão mais recente: ${dep.latestVersion}`,
    `  Tipo: ${alert.update.kind}`,
    `  Arquivo: ${dep.file}`,
    `  Recomendação: planejar atualizacao e validar testes do projeto.`
  ].join('\n');
}

function fixedVersions(vulnerability, dependency) {
  const ranges = vulnerability.affected
    ?.filter((affected) => affected.package?.name === dependency.name)
    ?.flatMap((affected) => affected.ranges || []) || [];
  const fixed = ranges.flatMap((range) =>
    (range.events || []).filter((event) => event.fixed).map((event) => event.fixed)
  );

  return fixed.sort(compareVersions).at(0) || '';
}

function alertHistoryId(alert) {
  if (alert.vulnerability) {
    return [
      'vuln',
      alert.repo.full_name,
      alert.dependency.ecosystem,
      alert.dependency.name,
      alert.dependency.version,
      alert.vulnerability.id
    ].join('|');
  }

  return [
    'update',
    alert.repo.full_name,
    alert.dependency.ecosystem,
    alert.dependency.name,
    alert.dependency.version,
    alert.dependency.latestVersion
  ].join('|');
}

function uniqueAlertObject(value, index, array) {
  const id = alertHistoryId(value);
  return array.findIndex((item) => alertHistoryId(item) === id) === index;
}

function compareAlerts(a, b) {
  const aScore = alertScore(a);
  const bScore = alertScore(b);
  return bScore - aScore || a.repo.full_name.localeCompare(b.repo.full_name);
}

function compareVulnerabilityAlerts(a, b) {
  return vulnerabilityScore(b.vulnerability) - vulnerabilityScore(a.vulnerability);
}

function compareUpdateAlerts(a, b) {
  return updateScore(b.update) - updateScore(a.update);
}

function alertScore(alert) {
  return alert.vulnerability ? vulnerabilityScore(alert.vulnerability) : updateScore(alert.update);
}

function vulnerabilityScore(vulnerability) {
  const severity = highestSeverity(vulnerability);
  const exploited = vulnerability.database_specific?.known_exploited ? 50 : 0;
  return exploited + ({ CRITICAL: 100, HIGH: 80, MEDIUM: 50, LOW: 20, UNKNOWN: 10 }[severity] || 10);
}

function updateScore(update) {
  return { major: 40, minor: 20, patch: 10, unknown: 5 }[update.kind] || 5;
}

function isCriticalVulnerability(vulnerability) {
  return highestSeverity(vulnerability) === 'CRITICAL' || vulnerability.database_specific?.known_exploited === true;
}

function highestSeverity(vulnerability) {
  const explicit = String(vulnerability.database_specific?.severity || '').toUpperCase();
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(explicit)) return explicit;

  const numericScores = (vulnerability.severity || [])
    .map((item) => Number(item.score))
    .filter((score) => Number.isFinite(score));
  const highest = Math.max(0, ...numericScores);

  if (highest >= 9) return 'CRITICAL';
  if (highest >= 7) return 'HIGH';
  if (highest >= 4) return 'MEDIUM';
  if (highest > 0) return 'LOW';
  return 'UNKNOWN';
}

function classifyUpdate(current, latest) {
  const currentParts = semanticParts(current);
  const latestParts = semanticParts(latest);
  if (!currentParts || !latestParts || compareVersions(current, latest) >= 0) {
    return { kind: 'unknown', isRelevant: false };
  }

  if (latestParts[0] - currentParts[0] >= updateMajorGap) {
    return { kind: 'major', isRelevant: true };
  }

  if (latestParts[1] > currentParts[1]) {
    return { kind: 'minor', isRelevant: true };
  }

  if (latestParts[2] > currentParts[2]) {
    return { kind: 'patch', isRelevant: true };
  }

  return { kind: 'unknown', isRelevant: false };
}

function compareVersions(a, b) {
  const aa = semanticParts(a);
  const bb = semanticParts(b);
  if (!aa || !bb) return String(a).localeCompare(String(b));

  for (let index = 0; index < Math.max(aa.length, bb.length); index += 1) {
    const diff = (aa[index] || 0) - (bb[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function semanticParts(version) {
  const match = String(version).replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

function dependency(repo, ecosystem, name, version, file) {
  return {
    repo,
    ecosystem,
    name: String(name || '').trim(),
    version: normalizeVersion(version),
    file,
    vulnerabilities: [],
    latestVersion: null
  };
}

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^=+/, '');
}

function dedupeDependencies(dependencies) {
  const map = new Map();
  for (const item of dependencies) {
    if (!item.name || !item.version) continue;
    map.set(`${item.ecosystem}:${item.name}:${item.version}:${item.file}`, item);
  }

  return Array.from(map.values());
}

function npmNameFromNodeModulesPath(path) {
  const parts = path.split('node_modules/').at(-1).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

function walkObject(value, visitor) {
  for (const [name, info] of Object.entries(value || {})) {
    visitor(name, info);
    walkObject(info?.dependencies || {}, visitor);
  }
}

function parseTargets(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.startsWith('org:')) return { kind: 'org', value: item.slice(4) };
      if (item.startsWith('user:')) return { kind: 'user', value: item.slice(5) };
      return { kind: 'repo', value: item };
    });
}

function osvEcosystem(ecosystem) {
  return {
    npm: 'npm',
    Packagist: 'Packagist',
    Go: 'Go',
    PyPI: 'PyPI',
    Maven: 'Maven',
    NuGet: 'NuGet',
    'crates.io': 'crates.io'
  }[ecosystem];
}

async function githubPaginated(endpoint) {
  const items = [];
  let next = `${GITHUB_API}${endpoint}`;

  while (next) {
    const response = await fetch(next, githubHeaders());
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GitHub falhou (${response.status}): ${payload.message || response.statusText}`);

    items.push(...payload);
    next = parseNextLink(response.headers.get('link'));
  }

  return items;
}

async function githubJson(endpoint) {
  return fetchJson(`${GITHUB_API}${endpoint}`, githubHeaders());
}

function githubHeaders() {
  return {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'user-agent': 'Projeto Alfredo Sentinela',
      'x-github-api-version': '2022-11-28'
    }
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': 'Projeto Alfredo Sentinela',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(60000)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${url} falhou (${response.status}): ${payload.message || response.statusText}`);
  }

  return payload;
}

function parseNextLink(link) {
  if (!link) return null;
  const next = link.split(',').find((part) => part.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1] || null;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function safeJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function numberEnv(name, fallback) {
  const value = optionalEnv(name, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolEnv(name, fallback) {
  const value = optionalEnv(name, '');
  if (!value) return fallback;
  return ['1', 'true', 'sim', 'yes'].includes(value.toLowerCase());
}
