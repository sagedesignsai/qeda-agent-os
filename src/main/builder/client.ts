/**
 * main/builder/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns Qeda's attach-only connection to the user's registered OpenCode service.
 * It never starts or stops a service in this first milestone; that ownership
 * boundary prevents Qeda from taking over or shutting down the user's runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { OpenCode, type OpenCodeClient } from '@opencode/client';
import { Service } from '@opencode/client/service';
import {
  createOpencode,
  type OpencodeProvider,
} from 'ai-sdk-provider-opencode-sdk';
import {
  isSupportedOpenCodeVersion,
  type BuilderConnectionStatus,
} from '../../lib/builder-types';

export interface BuilderRuntime {
  client: OpenCodeClient;
  provider: OpencodeProvider;
  version: string;
}

export type BuilderRuntimeResult =
  | { status: BuilderConnectionStatus; runtime?: BuilderRuntime }
  | { status: BuilderConnectionStatus; runtime: null };

/**
 * Discover the registered local service and verify the v2 API preflight.
 * This is intentionally attach-only: a separate owned-service lifecycle will
 * be added only after the app can manage the CLI binary safely.
 */
export async function connectBuilderRuntime(): Promise<BuilderRuntimeResult> {
  let endpoint;
  try {
    endpoint = await Service.discover();
  } catch (error) {
    return {
      status: {
        state: 'error',
        message: `Could not inspect the OpenCode service: ${messageOf(error)}`,
      },
      runtime: null,
    };
  }

  if (!endpoint) {
    return {
      status: {
        state: 'not-running',
        message:
          'No registered OpenCode service was found. Start OpenCode v2 with `opencode serve --service`, then refresh.',
      },
      runtime: null,
    };
  }

  const client = OpenCode.make({
    baseUrl: endpoint.url,
    headers: Service.headers(endpoint),
  });

  try {
    const serverInfo = await client.server.info();
    const version = serverInfo.version;

    if (!isSupportedOpenCodeVersion(version)) {
      return {
        status: {
          state: 'unsupported',
          version,
          message: `OpenCode ${version} is not supported. Builder currently requires an OpenCode 2.x server.`,
        },
        runtime: null,
      };
    }

    return {
      status: {
        state: 'connected',
        version,
        message:
          'OpenCode v2 is reachable. Full coding-turn compatibility is still being validated.',
      },
      runtime: {
        client,
        provider: createOpencode({ client }),
        version,
      },
    };
  } catch (error) {
    return {
      status: {
        state: 'error',
        message: `OpenCode responded to discovery but its v2 API check failed: ${messageOf(error)}`,
      },
      runtime: null,
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
