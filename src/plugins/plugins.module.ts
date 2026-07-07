import { Global, Module } from '@nestjs/common';
import { PluginRegistry } from './plugin.registry';

@Global()
@Module({
  providers: [PluginRegistry],
  exports: [PluginRegistry],
})
export class PluginsModule {}
