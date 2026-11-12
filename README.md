# SNOTEL for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the
**snowpack measured by the SNOTEL stations** of the USDA Natural Resources Conservation Service
(NRCS) into Gladys: about 900 automated mountain stations in the western United States and
Alaska, read every hour from the public AWDB API. No account, no key.

> Provisional hourly values, not an avalanche or flood warning. Not affiliated with the USDA or
> NRCS.

## Features

- One device per followed station, with what it measures: **snow depth**, **snow water
  equivalent**, its **percentage of the median** for the date (when NRCS has one), **new snow of
  the last 24 hours** (computed from the depth), **air temperature** and last reading.
- Stations by triplet (`1050:CA:SNTL`), number, NRCS page address or name, or the 3 nearest to
  your house.
- Metric (cm, mm, °C) or imperial (inches, °F) units; a device keeps the units it was created
  with.
- A **"Find stations"** action: the stations of a state, by name or number, or around your house.
- A **dashboard widget**: every station with its snow depth and new snow, or the details of one.
- Silent stations are shown as such, never with an old value sent as fresh.
- Scenes use the features directly ("new snow above 20 cm").

## Requirements

- Gladys Assistant 5.3.0 or later, with Internet access (`wcc.sc.egov.usda.gov`).
- For "around my house": the location of your house in Gladys.

## Installation

In Gladys: **Integrations → Install from GitHub**, then paste the address of this repository:

```
https://github.com/guim31/gladys-snotel
```

Then open the configuration of the integration, add your stations (or use "Find stations"), save,
and create the devices in the **Discover** tab. The full guide is in [docs/en.md](docs/en.md)
(also in [French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

- Every hour, one request to the AWDB API (`/data`, `HOURLY`) gives the snow depth (SNWD), snow
  water equivalent (WTEQ) and air temperature (TOBS) of the last 30 hours of every followed
  station. Every 6 hours, a second request gives the daily snow water equivalent with the median
  of the date. Once a day, a third one gives the station metadata (name, time zone, measured
  elements). The list of every SNOTEL station is downloaded once a week, only to resolve names
  and numbers or to find the stations around the house.
- AWDB dates are in the standard time of the station (UTC-8 for most SNOTEL stations, UTC-9 in
  Alaska); they are converted before anything is published.
- **New snow** is the depth now minus the lowest depth of the 24 hours before, each hour smoothed
  with its neighbours (median of three) so one odd sensor reading does not count.
- Devices are published with `should_poll: false`: the container refreshes them on its own timer
  and publishes only the values that changed, plus a heartbeat every 12 hours.
- Nothing is written to disk; the house coordinates never leave the container.

## Limitations

- Provisional data, reviewed later by NRCS; not an avalanche, flood or weather warning.
- New snow is approximate: settling, wind and sensor noise.
- The percentage of the median only exists for stations with a median (not the young ones,
  frequent in Alaska).
- AWDB's firewall refuses bursts of requests (HTTP 403): the integration then waits for the next
  hour.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests never touch the network: `test/helpers/world.js` serves answers recorded from the real
AWDB API on 12 November 2026 (`test/fixtures/awdb/`) to the SDK's fake Gladys.

## Credits

- Data: the **SNOTEL** network of the USDA Natural Resources Conservation Service, AWDB REST API,
  US government work in the public domain.
- Built with the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js)
  and the official JavaScript template.
- The cover is a home-made pictogram (mountain, snowflake, depth gauge): the USDA and NRCS logos
  are reserved to the agencies.

Not affiliated with the USDA or NRCS. SNOTEL is a program of the USDA NRCS.

## License

Apache-2.0, see [LICENSE](LICENSE).
