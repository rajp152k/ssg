import { buildSite } from '../lib/site';
import { resolveConfig, type CliConfigOptions, type SsgConfig } from '../config';

export interface BuildOptions extends CliConfigOptions {}

export function buildCommand(options: BuildOptions = {}): void {
  const config: SsgConfig = resolveConfig(options);
  buildSite(config);
  console.log(`Built site to ${config.outputDir}`);
}
