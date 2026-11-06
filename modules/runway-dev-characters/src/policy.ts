/**
 * Policy gate in front of every paid action.
 *
 * The disposition vocabulary deliberately matches `PreflightDisposition` of
 * `Johannesalchemist/nyxa-kernel-runtime` (`src/core/multiAgentGovernance.ts`, ADR-0002),
 * so the canonical runtime gate can replace `StaticPolicyGate` without changing callers.
 * This file does NOT re-implement the ADR-0002 conflict rules (no second policy source);
 * it only enforces: capability granted? context needs escalation?
 *
 * Only `ALLOW` lets a session be created. Every other disposition blocks before any
 * Runway call or budget reservation (Goal != Authority).
 */
import { CAPABILITY_CREATE } from './config.ts';

export type PreflightDisposition = 'ALLOW' | 'NEGOTIATE' | 'SERIALIZE' | 'ESCALATE' | 'DENY';

export interface PolicyRequest {
  capability: string;
  context: string;
  avatar: string;
}

export interface PolicyDecision {
  disposition: PreflightDisposition;
  reasons: string[];
}

export interface PolicyGate {
  evaluate(request: PolicyRequest): PolicyDecision | Promise<PolicyDecision>;
}

export class StaticPolicyGate implements PolicyGate {
  constructor(
    private readonly granted: readonly string[],
    private readonly escalationContexts: readonly string[],
  ) {}

  evaluate(request: PolicyRequest): PolicyDecision {
    if (!this.granted.includes(request.capability)) {
      return { disposition: 'DENY', reasons: [`capability_not_granted:${request.capability}`] };
    }
    if (request.context && this.escalationContexts.includes(request.context)) {
      return { disposition: 'ESCALATE', reasons: [`context_requires_human_decision:${request.context}`] };
    }
    return { disposition: 'ALLOW', reasons: ['capability_granted'] };
  }
}

export { CAPABILITY_CREATE };
