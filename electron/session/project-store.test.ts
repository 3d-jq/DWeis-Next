import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "vitest"
import { SessionProjectStore } from "./project-store.ts"

test("SessionProjectStore persists local projects", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dweis-session-projects-"))
  const store = new SessionProjectStore(dir)
  const projects = new Map<string, SessionProject>([
    [
      "project-a",
      {
        id: "project-a",
        name: "dweis",
        path: "/Users/example/code/dweis",
        createdAt: 1_000,
        updatedAt: 2_000,
        scope: { kind: "team", teamId: "team-id", teamName: "team-name" },
        persona: "work",
        pinnedAt: 3_000,
      },
    ],
  ])

  await store.write(projects)

  assert.deepEqual(await store.read(), projects)
})

test("SessionProjectStore supports concurrent writes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dweis-session-projects-"))
  const store = new SessionProjectStore(dir)

  await Promise.all([
    store.write(
      new Map([
        [
          "project-a",
          {
            id: "project-a",
            name: "A",
            path: "/tmp/a",
            createdAt: 1_000,
            updatedAt: 1_000,
          },
        ],
      ]),
    ),
    store.write(
      new Map([
        [
          "project-b",
          {
            id: "project-b",
            name: "B",
            path: "/tmp/b",
            createdAt: 2_000,
            updatedAt: 2_000,
          },
        ],
      ]),
    ),
  ])

  assert.equal((await store.read()).size, 1)
})

test("SessionProjectStore migrates legacy organization scope fields", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dweis-session-projects-"))
  await writeFile(
    path.join(dir, "session-projects.json"),
    JSON.stringify({
      version: 1,
      projects: {
        legacy: {
          name: "Legacy",
          path: "/tmp/legacy",
          createdAt: 1_000,
          updatedAt: 2_000,
          scope: { organizationId: "team-id", organizationName: "team-name" },
        },
      },
    }),
    "utf-8",
  )

  const project = (await new SessionProjectStore(dir).read()).get("legacy")
  assert.deepEqual(project?.scope, { kind: "team", teamId: "team-id", teamName: "team-name" })
})

test("SessionProjectStore defaults legacy projects to the work persona and round-trips explicit personas", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dweis-session-projects-"))
  await writeFile(
    path.join(dir, "session-projects.json"),
    JSON.stringify({
      version: 2,
      projects: {
        legacy: {
          name: "Legacy",
          path: "/tmp/legacy",
          createdAt: 1_000,
          updatedAt: 2_000,
        },
        codeProject: {
          name: "Code",
          path: "/tmp/code",
          createdAt: 1_000,
          updatedAt: 2_000,
          persona: "code",
        },
      },
    }),
    "utf-8",
  )

  const store = new SessionProjectStore(dir)
  const projects = await store.read()
  assert.equal(projects.get("legacy")?.persona, "work")
  assert.equal(projects.get("codeProject")?.persona, "code")
})

test("SessionProjectStore persists an explicit local workspace scope", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dweis-session-projects-"))
  const store = new SessionProjectStore(dir)
  const project: SessionProject = {
    id: "local-project",
    name: "Local project",
    path: "/tmp/local-project",
    createdAt: 1_000,
    updatedAt: 1_000,
    scope: { kind: "local", workspaceId: "local", workspaceName: "Local" },
    persona: "code",
  }

  await store.write(new Map([[project.id, project]]))

  assert.deepEqual(await store.read(), new Map([[project.id, project]]))
})
import type { SessionProject } from "./common.ts"
