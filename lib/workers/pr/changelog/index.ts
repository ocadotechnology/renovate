import { logger } from '../../../logger';
import * as versioning from '../../../versioning';
import * as sourceGithub from './source-github';
import * as sourceGitlab from './source-gitlab';
import { getReleases } from './releases';
import { hostRules } from '../../../util/host-rules';
import { ChangeLogConfig, ChangeLogResult } from './common';
import { util } from 'util';
import { URL } from 'url';
export * from './common';

export async function getChangeLogJSON(
  args: ChangeLogConfig
): Promise<ChangeLogResult | null> {
  logger.debug(
    `get platform name as ${args.platform} in function getChangeLogJSON`
  );
  logger.debug(`args for getChangeLogJSON`);
  logger.debug(util.inspect(args, { showHidden: false, depth: null }));
  const { sourceUrl, versionScheme, fromVersion, toVersion, homepage } = args;
  const version = versioning.get(versionScheme);
  // let { sourceUrl, versionScheme, fromVersion, toVersion, homepage } = args;
  // if (!sourceUrl) {
  if (!sourceUrl && !homepage) {
    logger.debug(
      `no sourceUrl or homepage provided for ${args.depName}, can't provide release notes!`
    );
    return null;
  }
  if (!fromVersion || version.equals(fromVersion, toVersion)) {
    return null;
  }
  const releases = args.releases || (await getReleases(args));
  const host_type = hostRules.getPlatformByHostOrUrl(sourceUrl).hostType;
  logger.debug(`Using ${host_type} changelog extractor.`)
  try {
    if (host_type=='gitlab') {
      logger.debug(
        `Running changelog creation for gitlab with parameters ${JSON.stringify(args)}`
      );
      const res = await sourceGitlab.getChangeLogJSON({ ...args, releases });
      return res;
    } else {
      const res = await sourceGithub.getChangeLogJSON({ ...args, releases });
      return res;
    }
  } catch (err) /* istanbul ignore next */ {
    logger.error({ err }, 'getChangeLogJSON error');
    return null;
  }
}
