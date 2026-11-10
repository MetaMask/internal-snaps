import { defineConfig, mergeConfig } from 'vitest/config';

// This file is copied into `packages/<name>/`. The import is relative to that directory.
import packageVitestConfig from '../../vitest.config.packages';

export default mergeConfig(packageVitestConfig, defineConfig({}));
