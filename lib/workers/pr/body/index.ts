import handlebars from 'handlebars';
import { logger } from '../../../logger';
import { platform } from '../../../platform';
import { get } from '../../../versioning';
import { getPrConfigDescription } from './config-description';
import { getPrBanner } from './banner';
import { getPrFooter } from './footer';
import { getPrUpdatesTable } from './updates-table';
import { getPrNotes, getPrExtraNotes } from './notes';
import { getChangelogs } from './changelogs';
import { getControls } from './controls';
import { PrBodyConfig } from './common';

handlebars.registerHelper('encodeURIComponent', encodeURIComponent);

function massageUpdateMetadata(config: PrBodyConfig): void {
  logger.debug('massageUpdateMetadata');
  config.upgrades.forEach(upgrade => {
    /* eslint-disable no-param-reassign */
    const { homepage, sourceUrl, sourceDirectory, changelogUrl } = upgrade;
    let depNameLinked = upgrade.depName;
    const primaryLink = homepage || sourceUrl;
    if (primaryLink) {
      depNameLinked = `[${depNameLinked}](${primaryLink})`;
    }
    const otherLinks = [];
    if (homepage && sourceUrl) {
      otherLinks.push(`[source](${sourceUrl})`);
    } else {
      logger.debug('Homepage or sourceUrl missing');
    }
    if (changelogUrl) {
      otherLinks.push(`[changelog](${changelogUrl})`);
    } else {
      logger.debug('No changelogUrl to massage');
    }
    if (otherLinks.length) {
      depNameLinked += ` (${otherLinks.join(', ')})`;
    }
    upgrade.depNameLinked = depNameLinked;
    const references: string[] = [];
    if (homepage) {
      references.push(`[homepage](${homepage})`);
    }
    if (sourceUrl) {
      let fullUrl = sourceUrl;
      if (sourceDirectory) {
        fullUrl =
          sourceUrl.replace(/\/?$/, '/') +
          'tree/HEAD/' +
          sourceDirectory.replace('^/?/', '');
      }
      logger.debug({ fullUrl }, 'fullUrl');
      references.push(`[source](${fullUrl})`);
    }
    if (changelogUrl) {
      references.push(`[changelog](${changelogUrl})`);
    }
    upgrade.references = references.join(', ');
    const { fromVersion, toVersion, updateType, versioning } = upgrade;
    // istanbul ignore if
    if (updateType === 'minor') {
      try {
        const version = get(versioning);
        if (version.getMinor(fromVersion) === version.getMinor(toVersion)) {
          upgrade.updateType = 'patch';
        }
      } catch (err) {
        // do nothing
      }
    }
    /* eslint-enable no-param-reassign */
  });
}

export async function getPrBody(config: PrBodyConfig): Promise<string> {
  massageUpdateMetadata(config);
  logger.debug('Getting PR body');
  const content = {
    banner: getPrBanner(config),
    table: getPrUpdatesTable(config),
    notes: getPrNotes(config) + getPrExtraNotes(config),
    changelogs: getChangelogs(config),
    configDescription: await getPrConfigDescription(config),
    controls: getControls(),
    footer: getPrFooter(config),
  };
  logger.debug({ content }, 'Content in getPrBody');
  const defaultPrBodyTemplate =
    '{{{banner}}}{{{table}}}{{{notes}}}{{{changelogs}}}{{{configDescription}}}{{{controls}}}{{{footer}}}';
  const prBodyTemplate = config.prBodyTemplate || defaultPrBodyTemplate;
  let prBody = handlebars.compile(prBodyTemplate)(content);
  prBody = prBody.trim();
  prBody = prBody.replace(/\n\n\n+/g, '\n\n');
  prBody = platform.getPrBody(prBody);
  return prBody;
}
