# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-12

### Added

- One device per SNOTEL station of the USDA NRCS (western United States and
  Alaska), refreshed every hour from the public AWDB API: snow depth, snow
  water equivalent, its percentage of the median for the date, new snow of the
  last 24 hours, air temperature and last reading.
- Stations followed by triplet, number, NRCS page address or name, or the 3
  nearest to the house; metric (cm, mm, °C) or imperial (inches, °F) units.
- "Find stations" action: the stations of a state, by name or number, or
  around the house, with their triplet, elevation and distance.
- "SNOTEL snowpack" dashboard widget: every station, or the details of one.
- Documentation in English, French, German and Spanish.
- Requires Gladys 5.3.0 or later (the store lists it for the United States).

[Unreleased]: https://github.com/guim31/gladys-snotel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-snotel/releases/tag/v1.0.0
