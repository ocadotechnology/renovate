import * as url from 'url';
import { logger } from '../logger';
import { addMetaData } from './metadata';
import * as versioning from '../versioning';
import * as cargo from './cargo';
import * as dart from './dart';
import * as docker from './docker';
import * as hex from './hex';
import * as github from './github';
import * as gitlab from './gitlab';
import * as gitTags from './git-tags';
import * as gitSubmodules from './git-submodules';
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
import * as hostRules from '../util/host-rules';
import * as terraformProvider from './terraform-provider';
import {
  Datasource,
  PkgReleaseConfig,
  Release,
  ReleaseResult,
  DigestConfig,
} from './common';
import { VERSION_SCHEME_SEMVER } from '../constants/version-schemes';

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
  gitSubmodules,
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
  terraformProvider,
};

const cacheNamespace = 'datasource-releases';

async function fetchReleases(
  config: PkgReleaseConfig
): Promise<ReleaseResult | null> {
  const { datasource } = config;
  if (!datasource) {
    logger.warn('No datasource found');
    return null;
  }
  if (!datasources[datasource]) {
    logger.warn('Unknown datasource: ' + datasource);
    return null;
  }
  const dep = await datasources[datasource].getPkgReleases(config);
  addMetaData(dep, datasource, config.lookupName);
  return dep;
}

function getRawReleases(
  config: PkgReleaseConfig
): Promise<ReleaseResult | null> {
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

export function sanitizesourceurl(rawSourceUrl): string {
  let repoUrlTmp: string;
  if (rawSourceUrl === undefined || rawSourceUrl === null) {
    // console.log('Parameter can not be null, exiting');
    return null;
  }
  if (
    RegExp('^(http(s)?://|git:|ssh:)').test(rawSourceUrl) ||
    rawSourceUrl.startsWith('git+ssh:')
  ) {
    repoUrlTmp = rawSourceUrl;
    // console.log(rawSourceUrl);
  } else {
    repoUrlTmp = `ssh://${rawSourceUrl}`;
    // convert scp shorthand, which is the most common case, to a full ssh: url.
  }
  const { protocol, host, port, path }: any = url.parse(repoUrlTmp);
  if (
    host === 'gitlab.com' ||
    host === 'github.com' ||
    host === 'bitbucket.org'
  ) {
    // probably redundant, but could be used as a start for a more general git url extraction librabry later on as per the discussion in https://github.com/renovatebot/renovate/issues/3323 TODO add search for hostRules as well?
    repoUrlTmp = `https://${host}${path}`;
  } else if (protocol === 'http:') {
    repoUrlTmp = `${protocol}//${host}${path}`;
  } else {
    const nonstandard_port = host.split(':');
    if (protocol !== 'https:' || protocol !== 'http:') {
      // Assuming everyone is using https over standard ports unless explicitly specified otherwise.A port knock/http(s) connection attempt might be useful here.
      if (!isNaN(port)) {
        repoUrlTmp = `https://${host.split(':')[0]}${path}`;
      } else {
        repoUrlTmp = `https://${host}${path}`;
        // exceedingly rare case where something like :~ is utilized as part of an SCP url.Probably not something we should worry about, but let us stay on the safe side.
      }
    } else {
      // http and https on non-standard ports.
      repoUrlTmp = `${protocol}//${host}${path}`;
    }
  }
  repoUrlTmp = repoUrlTmp.replace(RegExp('.git$'), '');
  // console.log(`Formatted source url for ${rawSourceUrl} : ${repoUrlTmp}`);
  return repoUrlTmp;
}

export async function getPkgReleases(
  config: PkgReleaseConfig
): Promise<ReleaseResult | null> {
  const res = await getRawReleases({
    ...config,
    lookupName: config.lookupName || config.depName,
  });
  if (!res) {
    return res;
  }
  const versionScheme =
    config && config.versionScheme
      ? config.versionScheme
      : VERSION_SCHEME_SEMVER;
  // Filter by version scheme
  const version = versioning.get(versionScheme);
  // Return a sorted list of valid Versions
  function sortReleases(release1: Release, release2: Release): number {
    return version.sortVersions(release1.version, release2.version);
  }
  res.sourceurl = sanitizesourceurl(res.sourceurl);
  if (res.releases) {
    res.releases = res.releases
      .filter(release => version.isVersion(release.version))
      .sort(sortReleases);
  }
  return res;
}

export function supportsDigests(config: DigestConfig): boolean {
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
