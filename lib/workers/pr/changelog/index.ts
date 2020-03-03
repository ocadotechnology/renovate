import { logger } from '../../../logger';
import * as allVersioning from '../../../versioning';
import * as sourceGithub from './source-github';
import * as sourceGitlab from './source-gitlab';
import { getReleases } from './releases';
import { ChangeLogConfig, ChangeLogResult } from './common';

export * from './common';

export async function getChangeLogJSON(
  args: ChangeLogConfig
): Promise<ChangeLogResult | null> {
  const { sourceUrl, versioning, fromVersion, toVersion } = args;
  if (!sourceUrl) {
    return null;
  }
  const version = allVersioning.get(versioning);
  logger.debug({ version }, 'version from Versioning.get versioning');
  if (!fromVersion || version.equals(fromVersion, toVersion)) {
    return null;
  }
  // logger.debug({ args }, 'Args to index getChangeLogJSON (looking for releases)');

  const releases = args.releases || (await getReleases(args));

  try {
    let res = null;
    if (
      args.sourceUrl === undefined ||
      args.sourceUrl.search(/github/) !== -1
    ) {
      res = await sourceGithub.getChangeLogJSON({ ...args, releases });
    }
    if (res === null && args.sourceUrl.search(/gitlab/) !== -1) {
      res = await sourceGitlab.getChangeLogJSON({ ...args, releases });
    }
    return res;
  } catch (err) /* istanbul ignore next */ {
    logger.error({ err }, 'getChangeLogJSON error');
    return null;
  }
}
