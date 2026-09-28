import { parsePackageVersion } from './version-contract.mjs';

export function validateReleaseCandidate({ currentVersion, baseVersion, changelog }) {
  parsePackageVersion(currentVersion);
  parsePackageVersion(baseVersion);
  if (currentVersion === baseVersion) return { changed: false, version: currentVersion };

  const heading = new RegExp(
    `^## \\[${currentVersion.replaceAll('.', '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})$`,
    'mu',
  ).exec(changelog);
  if (!heading) {
    throw new Error(`Version-changing pull requests require a dated [${currentVersion}] - YYYY-MM-DD Changelog entry.`);
  }
  if (/^## Unreleased$/mu.test(changelog)) {
    throw new Error('Version-changing pull requests must not retain an Unreleased entry.');
  }
  assertCalendarDate(heading[1]);
  return { changed: true, version: currentVersion, date: heading[1] };
}

function assertCalendarDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Changelog date ${value} is not a valid calendar date.`);
  }
}
