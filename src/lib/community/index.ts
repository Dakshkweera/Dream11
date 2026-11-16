import { apiAdapter } from "./api-adapter";
import type { CommunityAdapter } from "./contract";
import { mockAdapter } from "./mock";

/**
 * The community backend the UI should use. The mock is the default until the backend implements the contract
 * in ./contract.ts and NEXT_PUBLIC_COMMUNITY_API=on is set.
 */
export function communityAdapter(): CommunityAdapter {
  return process.env.NEXT_PUBLIC_COMMUNITY_API === "on" ? apiAdapter : mockAdapter;
}

export * from "./contract";
