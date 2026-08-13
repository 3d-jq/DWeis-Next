import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export type GitRepositoryError = "git_unavailable" | "not_repository" | "path_unavailable" | "timeout" | "unknown"

export interface GitBranchInfo {
  name: string
  current: boolean
  remote: boolean
  upstream?: string
}

export interface GitRepositoryState {
  projectId: string
  projectPath: string
  available: boolean
  branches: GitBranchInfo[]
  dirty: boolean
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  repositoryRoot?: string
  currentBranch?: string
  detachedHead?: string
  error?: GitRepositoryError
  message?: string
}

export interface GitRepositoryRequest {
  projectId: string
  path: string
}

export interface GitCheckoutBranchRequest extends GitRepositoryRequest {
  branch: string
}

export interface GitCreateBranchRequest extends GitRepositoryRequest {
  branch: string
}

/** `git log --graph` 图谱响应：每行是含 ASCII 连线与装饰的文本（等宽字体渲染）。 */
export interface GitGraphResponse {
  projectId: string
  lines: string[]
  available: boolean
  error?: GitRepositoryError
  message?: string
}

export type GitService = typeof GitService
export const GitService = serviceName("git-service") as ServiceName<{
  ServerEvents: Record<string, never>
  ClientInvokes: {
    getRepositoryState(req: GitRepositoryRequest): Promise<GitRepositoryState>
    checkoutBranch(req: GitCheckoutBranchRequest): Promise<GitRepositoryState>
    createAndCheckoutBranch(req: GitCreateBranchRequest): Promise<GitRepositoryState>
    getGraph(req: GitRepositoryRequest): Promise<GitGraphResponse>
  }
}>
