import parse from 'github-url-from-git';
import * as URL from 'url';
import { logger } from '../logger';
import * as hostRules from '../util/host-rules';
import { addMetaData } from './metadata';
import * as versioning from '../versioning';
import * as cargo from './cargo';
import * as dart from './dart';
import * as docker from './docker';
import * as hex from './hex';
import * as github from './github';
import * as gitlab from './gitlab';
import * as gitTags from './git-tags';
import * as go from './go';
import * as gradleVersion from './gradle-version';
import * as helm from './helm';
import * as maven from './maven';
import * as npm from './npm';
import * as nuget from './nuget';
import * as orb from './orb';
import * as packagist from './packagist';
import * as pypi from './pypi';
import * as rubygems from './rubygems';
import * as rubyVersion from './ruby-version';
import * as sbt from './sbt';
import * as terraform from './terraform';
import {
  Datasource,
  PkgReleaseConfig,
  Release,
  ReleaseResult,
  DigestConfig,
} from './common';

export * from './common';

const datasources: Record<string, Datasource> = {
  cargo,
  dart,
  docker,
  helm,
  hex,
  github,
  gitlab,
  gitTags,
  go,
  gradleVersion,
  maven,
  npm,
  nuget,
  orb,
  packagist,
  pypi,
  rubygems,
  rubyVersion,
  sbt,
  terraform,
};

const cacheNamespace = 'datasource-releases';

export async function getPkgReleases(config: PkgReleaseConfig) {
  const res = await getRawReleases({
    ...config,
    lookupName: config.lookupName || config.depName,
  });
  if (!res) {
    return res;
  }
  const versionScheme =
    config && config.versionScheme ? config.versionScheme : 'semver';
  // Filter by version scheme
  const version = versioning.get(versionScheme);
  // Return a sorted list of valid Versions
  function sortReleases(release1: Release, release2: Release) {
    return version.sortVersions(release1.version, release2.version);
  }
  if (res.releases) {
    res.releases = res.releases
      .filter(release => version.isVersion(release.version))
      .sort(sortReleases);
  }
  return res;
}

function getRawReleases(config: PkgReleaseConfig): Promise<ReleaseResult> {
  const cacheKey =
    cacheNamespace +
    config.datasource +
    config.lookupName +
    config.registryUrls;
  // The repoCache is initialized for each repo
  // By returning a Promise and reusing it, we should only fetch each package at most once
  if (!global.repoCache[cacheKey]) {
    global.repoCache[cacheKey] = fetchReleases(config);
  }
  return global.repoCache[cacheKey];
}

async function fetchReleases(
  config: PkgReleaseConfig
): Promise<ReleaseResult | null> {
  const { datasource } = config;
  // istanbul ignore if
  if (!datasource) {
    logger.warn('No datasource found');
  }
  if (!datasources[datasource]) {
    logger.warn('Unknown datasource: ' + datasource);
    return null;
  }
  const dep = await datasources[datasource].getPkgReleases(config);
  addMetaData(dep, datasource, config.lookupName);
  if (dep && Object.entries(dep).length !== 0 && dep.sourceUrl !== undefined) {
    dep.sourceUrl = baseUrlLegacyMassager(dep.sourceUrl);
  }
  return dep;
}

export function supportsDigests(config: DigestConfig) {
  return !!datasources[config.datasource].getDigest;
}

export function getDigest(
  config: DigestConfig,
  value?: string
): Promise<string | null> {
  const lookupName = config.lookupName || config.depName;
  const { registryUrls } = config;
  return datasources[config.datasource].getDigest(
    { lookupName, registryUrls },
    value
  );
}
function baseUrlLegacyMassager(sourceUrl) {
  let url: string = sourceUrl;
  // Massage www out of github URL
  url = url.replace('www.github.com', 'github.com');
  //  istanbul ignore if
  if (url.startsWith('https://github.com/')) {
    url = url
      .split('/')
      .slice(0, 5)
      .join('/');
  } // a lot of this is probably redundant and can be better achieved with URL.
  const extraBaseUrls = [];
  const getHostsFromRulesGithub = hostRules.hosts({ hostType: 'github' });
  // istanbul ignore if
  if (getHostsFromRulesGithub && getHostsFromRulesGithub.length !== 0) {
    // istanbul ignore next
    if (getHostsFromRulesGithub.includes(URL.parse(url).hostname)) {
      getHostsFromRulesGithub.forEach(host => {
        extraBaseUrls.push(host, `gist.${host}`);
      });
      url = parse(url, {
        extraBaseUrls,
      });
    }
  } // istanbul ignore if
  if (url.startsWith('git:github.com/')) {
    url = 'https://' + url.substr(4);
  }
  return url;
}
