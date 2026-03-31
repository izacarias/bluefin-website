#!/usr/bin/env node

/**
 * Script to update stream-versions.yml with latest package information
 * from ublue-os/bluefin and ublue-os/bluefin-lts releases
 *
 * Current approach: fetches GitHub Releases API and parses the release body
 * markdown to extract kernel/gnome/mesa/nvidia versions from "### Major packages"
 * tables. This is fragile — any release note format change breaks it.
 *
 * TODO (proper fix): Query the OCI SBOM attestation for exact installed package
 * versions:
 *   cosign download attestation ghcr.io/ublue-os/bluefin:<tag> \
 *     | jq -r '.payload' | base64 -d | jq '.predicate.components[] | select(.name == "kernel")'
 * This would use the syft JSON schema embedded in the image attestation and is
 * immune to changelog format changes.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump as dumpYaml } from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// GitHub API configuration
const GITHUB_API = 'https://api.github.com'
const REPOS = {
  lts: 'ublue-os/bluefin-lts',
  main: 'ublue-os/bluefin'
}

// Base OS mapping for each stream
const BASE_OS_MAP = {
  lts: 'CentOS Stream 10',
  stable: 'Fedora 43'
}

/**
 * Fetch the latest release for a repository
 */
async function fetchLatestReleasesByStream(repo, stream) {
  const url = `${GITHUB_API}/repos/${repo}/releases`
  const response = await fetch(url, {
    headers: {
      'Authorization': process.env.GITHUB_TOKEN
        ? `token ${process.env.GITHUB_TOKEN}`
        : undefined,
      'User-Agent': 'bluefin-website-updater',
      'Accept': 'application/vnd.github.v3+json'
    }
  })

  if (!response.ok) {
    console.error(`GitHub API response status: ${response.status}`)
    console.error(
      `Response headers:`,
      Object.fromEntries(response.headers.entries())
    )
    const text = await response.text()
    console.error(`Response body:`, text.substring(0, 500))
    throw new Error(
      `Failed to fetch releases for ${repo}: ${response.status} ${response.statusText}`
    )
  }

  const releases = await response.json()

  // Find the latest release for the specified stream
  const streamRelease = releases.find((release) => {
    return (
      release.tag_name.startsWith(`${stream}-`)
      || release.tag_name.startsWith(`${stream}.`)
    )
  })

  return streamRelease
}

/**
 * Parse the changelog body to extract package versions.
 *
 * This parses release note markdown tables of the form:
 *   ### Major packages
 *   | **Kernel** | 6.14.11-300 |
 *
 * If parsing fails for any field, 'unknown' is returned rather than crashing.
 *
 * NOTE: This approach is fragile. See TODO at the top of this file for the
 * proper fix using OCI SBOM attestation.
 */
function parseChangelogVersions(body) {
  if (!body) {
    console.warn('Release body is empty — all versions will be unknown')
    return { kernel: 'unknown', gnome: 'unknown', mesa: 'unknown', nvidia: 'unknown', hwe: 'unknown' }
  }

  const versions = {
    kernel: 'unknown',
    gnome: 'unknown',
    mesa: 'unknown',
    nvidia: 'unknown',
    hwe: 'unknown'
  }

  try {
    // Split by lines and find the Major packages and Major GDX packages sections
    const lines = body.split('\n')
    let inMajorPackages = false
    let inMajorGdxPackages = false

    for (const line of lines) {
      const trimmed = line.trim()

      // Start of major packages section
      if (trimmed === '### Major packages') {
        inMajorPackages = true
        inMajorGdxPackages = false
        continue
      }

      // Start of major GDX packages section (for LTS nvidia drivers)
      if (trimmed === '### Major GDX packages') {
        inMajorGdxPackages = true
        inMajorPackages = false
        continue
      }

      // End of current packages section
      if (
        (inMajorPackages || inMajorGdxPackages)
        && trimmed.startsWith('###')
        && !trimmed.includes('Major packages')
        && !trimmed.includes('Major GDX packages')
      ) {
        inMajorPackages = false
        inMajorGdxPackages = false
        continue
      }

      if ((inMajorPackages || inMajorGdxPackages) && trimmed.startsWith('| **')) {
        // Parse package version lines like: | **Kernel** | 6.14.11-300 |
        // or with transitions like: | **Mesa** | 25.1.4-1 ➡️ 25.1.7-1 |
        const match = trimmed.match(/\| \*\*([^*]+)\*\* \| (.+) \|/)
        if (match) {
          const packageName = match[1].toLowerCase()
          let version = match[2].trim()

          // Handle version transitions (take the newer version after ➡️)
          if (version.includes('➡️')) {
            version = version.split('➡️')[1].trim()
          }

          // Map package names to our keys
          if (packageName === 'kernel') {
            versions.kernel = version
          }
          else if (packageName === 'gnome') {
            versions.gnome = version
          }
          else if (packageName === 'mesa') {
            versions.mesa = version
          }
          else if (packageName === 'nvidia') {
            versions.nvidia = version
          }
          else if (packageName === 'hwe kernel') {
            versions.hwe = version
          }
        }
      }
    }
  }
  catch (parseError) {
    console.warn('Error parsing changelog body:', parseError)
    // Return whatever was parsed so far — unknown fields stay as 'unknown'
  }

  return versions
}

/**
 * Update the stream-versions.yml file
 */
async function updateStreamVersions() {
  console.info('Fetching latest releases...')

  const updates = {}

  try {
    // Fetch LTS versions from bluefin-lts repo
    const ltsRelease = await fetchLatestReleasesByStream(REPOS.lts, 'lts')
    if (ltsRelease) {
      console.info(`Found LTS release: ${ltsRelease.tag_name}`)
      const ltsVersions = parseChangelogVersions(ltsRelease.body)
      updates.lts = {
        base: BASE_OS_MAP.lts,
        gnome: ltsVersions.gnome,
        kernel: ltsVersions.kernel,
        mesa: ltsVersions.mesa,
        nvidia: ltsVersions.nvidia,
        hwe: ltsVersions.hwe
      }
    }

    const stableRelease = await fetchLatestReleasesByStream(
      REPOS.main,
      'stable'
    )
    if (stableRelease) {
      console.info(`Found Stable release: ${stableRelease.tag_name}`)
      const stableVersions = parseChangelogVersions(stableRelease.body)
      updates.stable = {
        base: BASE_OS_MAP.stable,
        gnome: stableVersions.gnome,
        kernel: stableVersions.kernel,
        mesa: stableVersions.mesa,
        nvidia: stableVersions.nvidia
      }
    }

    // Ensure we have at least some data
    if (Object.keys(updates).length === 0) {
      throw new Error('No release data found for any stream')
    }

    // Generate the updated YAML content using js-yaml
    const today = new Date().toISOString().split('T')[0]
    const header = `# Stream version information for Bluefin releases\n# This file contains the latest version information for each stream\n# Data is sourced from the most recent changelogs in ublue-os/bluefin and ublue-os/bluefin-lts repositories\n# Last updated: ${today}\n\n`
    const yamlContent = header + dumpYaml(updates, { lineWidth: -1, quotingType: '"', forceQuotes: true })

    // Write the updated file
    const yamlPath = path.join(__dirname, '..', 'public', 'stream-versions.yml')
    fs.writeFileSync(yamlPath, yamlContent)

    console.info('Stream versions updated successfully!')
    console.info('Updated streams:', Object.keys(updates))

    // Log the parsed versions for verification
    console.info('\nParsed versions:')
    for (const [stream, versions] of Object.entries(updates)) {
      console.info(`${stream}:`, versions)
    }
  }
  catch (error) {
    console.error('Error updating stream versions:', error)
    process.exit(1)
  }
}

// Run the update
updateStreamVersions()
