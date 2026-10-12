/**
 * Cutover Gateway and Single Active Writer Contract (M10-T03)
 *
 * Implements the Platform Plan v3 §6 M10 requirement:
 * "One route at a time; one active writer contract per entity/document version.
 *  Do not duplicate authoritative business logic or silently downgrade old clients."
 */

export type ActiveWriterTarget = 'FLUTTER_NATIVE' | 'NEXTJS_LEGACY' | 'READ_ONLY_ARCHIVED';

export type ClientPlatform = 'flutter_web' | 'flutter_native' | 'nextjs_web' | 'api_cli';

export interface RouteCutoverConfig {
  readonly routePath: string;
  readonly activeTarget: ActiveWriterTarget;
  readonly minProtocolVersion: number;
  readonly supportedEntities: readonly string[];
  readonly lastCutoverTimestamp: string;
  readonly rollbackTarget?: ActiveWriterTarget;
}

export interface CutoverWriteContext {
  readonly routePath: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly clientPlatform: ClientPlatform;
  readonly clientVersion: string;
  readonly clientProtocolVersion: number;
  readonly expectedRevisionId?: string;
  readonly lastServerSeq: number;
  readonly payload: unknown;
}

export interface DomainWriteResult {
  readonly success: boolean;
  readonly entityId: string;
  readonly newRevisionId: string;
  readonly newServerSeq: number;
  readonly handledBy: ActiveWriterTarget;
  readonly data?: unknown;
}

export interface DomainWriteHandler {
  (ctx: CutoverWriteContext): Promise<DomainWriteResult> | DomainWriteResult;
}

/**
 * Thrown when an old/superseded client attempts to write to a route
 * that has been cut over to the new native client.
 */
export class SupersededClientError extends Error {
  public readonly code = 'SUPERSEDED_CLIENT_WRITE';
  public readonly routePath: string;
  public readonly targetPlatform: ActiveWriterTarget;
  public readonly upgradePrompt: {
    readonly title: string;
    readonly message: string;
    readonly targetRoute: string;
    readonly requiredAction: string;
  };

  constructor(routePath: string, targetPlatform: ActiveWriterTarget) {
    super(`Write rejected: Route "${routePath}" has been cut over to ${targetPlatform}. Superseded client writes are prohibited.`);
    this.name = 'SupersededClientError';
    this.routePath = routePath;
    this.targetPlatform = targetPlatform;
    this.upgradePrompt = {
      title: 'Application Update Required',
      message: `The feature at "${routePath}" has been modernized. Your current client session is superseded.`,
      targetRoute: routePath,
      requiredAction: 'REFRESH_OR_UPGRADE_CLIENT',
    };
  }
}

/**
 * Thrown when a client provides an outdated protocol version.
 */
export class ClientUpgradeRequiredError extends Error {
  public readonly code = 'CLIENT_UPGRADE_REQUIRED';
  public readonly currentProtocol: number;
  public readonly requiredProtocol: number;

  constructor(currentProtocol: number, requiredProtocol: number) {
    super(`Client protocol version ${currentProtocol} is obsolete. Minimum required protocol is ${requiredProtocol}.`);
    this.name = 'ClientUpgradeRequiredError';
    this.currentProtocol = currentProtocol;
    this.requiredProtocol = requiredProtocol;
  }
}

/**
 * Thrown when an optimistic concurrency check fails.
 */
export class ConcurrentMutationConflictError extends Error {
  public readonly code = 'CONCURRENT_MUTATION_CONFLICT';
  public readonly entityId: string;
  public readonly currentSeq: number;
  public readonly providedSeq: number;

  constructor(entityId: string, currentSeq: number, providedSeq: number) {
    super(`Conflict on entity "${entityId}": client sequence ${providedSeq} is stale against server sequence ${currentSeq}.`);
    this.name = 'ConcurrentMutationConflictError';
    this.entityId = entityId;
    this.currentSeq = currentSeq;
    this.providedSeq = providedSeq;
  }
}

/**
 * CutoverGateway: routes mutations exclusively to the single active writer
 * and enforces concurrency, protocol negotiation, and fail-closed security.
 */
export class CutoverGateway {
  private readonly routes = new Map<string, RouteCutoverConfig>();
  private readonly handlers = new Map<ActiveWriterTarget, DomainWriteHandler>();
  private readonly entitySequences = new Map<string, number>();

  /**
   * Registers a route with its initial active writer target.
   */
  public registerRoute(config: RouteCutoverConfig): void {
    this.routes.set(config.routePath, { ...config });
  }

  /**
   * Registers an authoritative write handler for a writer target.
   */
  public registerHandler(target: ActiveWriterTarget, handler: DomainWriteHandler): void {
    this.handlers.set(target, handler);
  }

  /**
   * Records or initialises the current server sequence of an entity.
   */
  public setEntitySequence(entityId: string, seq: number): void {
    this.entitySequences.set(entityId, seq);
  }

  /**
   * Returns current server sequence for an entity (defaults to 0).
   */
  public getEntitySequence(entityId: string): number {
    return this.entitySequences.get(entityId) ?? 0;
  }

  /**
   * Performs an instant route cutover to a new target.
   */
  public cutoverRoute(routePath: string, newTarget: ActiveWriterTarget): void {
    const existing = this.routes.get(routePath);
    if (!existing) {
      throw new Error(`Cannot cut over unmapped route: "${routePath}"`);
    }
    this.routes.set(routePath, {
      ...existing,
      rollbackTarget: existing.activeTarget,
      activeTarget: newTarget,
      lastCutoverTimestamp: new Date().toISOString(),
    });
  }

  /**
   * Performs an instantaneous emergency rollback to the previous target.
   */
  public rollbackRoute(routePath: string): ActiveWriterTarget {
    const existing = this.routes.get(routePath);
    if (!existing || !existing.rollbackTarget) {
      throw new Error(`No rollback target available for route: "${routePath}"`);
    }
    const restoredTarget = existing.rollbackTarget;
    this.routes.set(routePath, {
      ...existing,
      activeTarget: restoredTarget,
      rollbackTarget: undefined,
      lastCutoverTimestamp: new Date().toISOString(),
    });
    return restoredTarget;
  }

  /**
   * Gets route configuration.
   */
  public getRouteConfig(routePath: string): RouteCutoverConfig | undefined {
    return this.routes.get(routePath);
  }

  /**
   * Dispatches a write mutation through the single active writer gateway.
   */
  public async dispatchWrite(ctx: CutoverWriteContext): Promise<DomainWriteResult> {
    const config = this.routes.get(ctx.routePath);
    if (!config) {
      throw new Error(`Unregistered route in cutover gateway: "${ctx.routePath}"`);
    }

    // 1. Strict Protocol Version Negotiation (never silent downgrade)
    if (ctx.clientProtocolVersion < config.minProtocolVersion) {
      throw new ClientUpgradeRequiredError(ctx.clientProtocolVersion, config.minProtocolVersion);
    }

    // 2. Read-Only / Archived Route Protection
    if (config.activeTarget === 'READ_ONLY_ARCHIVED') {
      throw new Error(`Route "${ctx.routePath}" is archived and strictly read-only.`);
    }

    // 3. Single Active Writer Routing & Superseded Client Rejection
    // If route is cut over to FLUTTER_NATIVE, legacy nextjs_web writes are rejected
    if (config.activeTarget === 'FLUTTER_NATIVE' && ctx.clientPlatform === 'nextjs_web') {
      throw new SupersededClientError(ctx.routePath, 'FLUTTER_NATIVE');
    }

    // If route is still in NEXTJS_LEGACY, premature native writes that expect new APIs throw
    if (config.activeTarget === 'NEXTJS_LEGACY' && ctx.clientPlatform === 'flutter_native' && !this.handlers.has('NEXTJS_LEGACY')) {
      throw new Error(`Route "${ctx.routePath}" is still served by legacy Next.js writer.`);
    }

    // 4. Optimistic Concurrency Invariant Check
    const currentSeq = this.getEntitySequence(ctx.entityId);
    if (ctx.lastServerSeq !== currentSeq) {
      throw new ConcurrentMutationConflictError(ctx.entityId, currentSeq, ctx.lastServerSeq);
    }

    // 5. Authoritative Handler Invocation (Zero Logic Duplication)
    const handler = this.handlers.get(config.activeTarget);
    if (!handler) {
      throw new Error(`No handler registered for active writer target: "${config.activeTarget}"`);
    }

    const result = await handler(ctx);

    // 6. Advance Server Sequence Atomically
    const nextSeq = currentSeq + 1;
    this.setEntitySequence(ctx.entityId, nextSeq);

    return {
      ...result,
      newServerSeq: nextSeq,
      handledBy: config.activeTarget,
    };
  }
}
