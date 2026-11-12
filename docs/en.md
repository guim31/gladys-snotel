# SNOTEL

Brings the **snowpack measured by the SNOTEL stations** into Gladys: about 900 automated
mountain stations of the USDA Natural Resources Conservation Service (NRCS) in the western
United States and Alaska. Snow depth, snow water equivalent, the snow of the last 24 hours and
the air temperature, every hour, from the public AWDB API of NRCS. No account, no key.

> **Provisional hourly values, not an avalanche or flood warning.** SNOTEL data are raw sensor
> readings that NRCS reviews later; they can be late, missing or wrong, and the integration
> depends on your Gladys, your Internet access and a public service. Before going into the
> backcountry, read the forecast of your avalanche center. This integration is not affiliated
> with the USDA or NRCS.

## What you get

- **One device per station** you follow, with what the station measures: the **snow depth**,
  the **snow water equivalent** (the water the snowpack would give if it melted), this water
  as a **percentage of the median** for the date (1991-2020) when NRCS has one, the **new snow
  of the last 24 hours**, the **air temperature**, and the date of the last reading.
- Units of your choice: cm, mm and °C, or inches and °F as NRCS publishes them.
- A station that stops sending is shown as such ("No new reading since…"): an old value is never
  sent again as if it were fresh.
- A **dashboard widget**: your stations with their snow depth and new snow, or the details of
  one station.
- A **"Find stations"** button that lists the stations of a state, by name or number, or around
  your house, with their triplet, elevation and distance.
- Scenes use the features directly: "new snow above 20 cm" is a powder day.

## Requirements

- Gladys Assistant **5.3.0** or later.
- Internet access from Gladys: the integration reads `wcc.sc.egov.usda.gov`.
- For "around my house": the location of your house in Gladys (Settings, Houses). The
  integration asks for it at installation (the "location" permission). It is only used inside
  the container to find the nearest stations: never sent to NRCS, never stored nor logged.
- SNOTEL covers the mountains of the western United States and Alaska. A station of another
  NRCS network (SCAN, SNOLITE…) can be followed by its triplet: you get what it measures.

## Configuration

### Settings

| Setting                       | What it does                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Stations                      | Triplets (`1050:CA:SNTL`), numbers (`766`), NRCS page addresses or names, separated by commas. |
| Around my house               | Also follows the 3 nearest SNOTEL stations within 50, 100 or 200 km of your house.             |
| Units                         | Metric (cm, mm, °C) or imperial (inches, °F) for new devices.                                  |
| Language of the feature names | Names given to the features of new devices, and language of their texts.                       |

At most 20 stations are followed from the settings. Save, then open the **Discover** tab and
create the devices you want: a station whose device exists stays followed even if you remove
it from the settings. Deleting the device stops following it.

A device keeps the units and names it was created with. After changing the units, the Discover
tab offers to **update** the device; until then, its values stay in its old units.

### Finding your stations

The **"Find stations"** button of the configuration lists up to 15 stations with their triplet,
state, elevation in feet and metres and, when your house has a location, their distance:

- choose a **state** to list its stations (nearest first, else alphabetically);
- type a **name** (Snowbird), a county, a station **number** (1050) or a **triplet**;
- leave everything empty to list the stations around your house.

Copy the triplets into "Stations", then save.

## Devices

| Feature                 | Type in Gladys         | Unit     | Notes                                                   |
| ----------------------- | ---------------------- | -------- | ------------------------------------------------------- |
| Snow depth              | Level sensor (depth)   | cm or in | Ultrasonic sensor, hourly.                              |
| New snow (24 h)         | Level sensor (depth)   | cm or in | Depth gained over 24 hours, see below.                  |
| Snow water equivalent   | Level sensor (depth)   | mm or in | Snow pillow, hourly.                                    |
| Snow water, % of median | Level sensor (percent) | %        | Yesterday's daily value against the median of the date. |
| Air temperature         | Temperature sensor     | °C or °F | Observed temperature, hourly.                           |
| Last reading            | Text                   |          | Date of the last reading, or "No new reading since…".   |

A feature only exists when the station measures it. **New snow** is the snow depth now minus
the lowest depth of the 24 hours before (each hour smoothed with its neighbours, so one odd
reading of the sensor does not count): new snow settles, so it is a lower bound of what fell, and the smoothing delays a snowfall of the last hour or two.
The percentage of the median is only given when NRCS publishes a median for the station: young
stations, in Alaska especially, have none. Early in the season, a small median makes large
percentages.

Values are refreshed every hour in the container (the stations transmit hourly, sometimes in
batches every few hours). After 12 hours without a new reading, the values stop and "Last
reading" says since when.

## Dashboard widget

Add the **SNOTEL snowpack** widget to a dashboard:

- without setting, it lists your stations (10 at most): snow depth and the new snow of 24
  hours; a line turns blue with a snow icon when snow fell;
- with a station chosen, it shows its snow depth, new snow and snow water equivalent tiles,
  then the percentage of the median, the air temperature and the last reading.

The names are those you gave the devices in Gladys.

## Scene examples

- **Powder alarm**: trigger "a device value changes", feature "New snow (24 h)" of your
  favourite station, above 20 (cm): send yourself a message at 6 am.
- **Snowpack below normal**: feature "Snow water, % of median" below 70: a message to plan the
  water use of the summer.
- **Freezing at the trailhead**: feature "Air temperature" below -15 °C.

## Data sources, licence and quotas

- Data: the SNOTEL network of the **USDA Natural Resources Conservation Service**, read from
  the public **AWDB REST API** (`wcc.sc.egov.usda.gov/awdbRestApi`). US government data, in the
  public domain. Hourly values are provisional; NRCS reviews them later.
- Requests: at most three an hour for all your stations together (hourly values; every 6 hours
  the daily values and medians; once a day the station metadata), plus the station list, once a
  week, when you follow stations by name or around your house. The API has no published quota,
  but its firewall refuses bursts of requests (HTTP 403): the integration then simply tries
  again at the next hour.
- Tested against the real API on 12 November 2026 (stations of California, Colorado, Utah,
  Washington and Alaska, a station without snow sensor and an unknown triplet).

## Troubleshooting

- **"Unknown station"**: check the triplet with "Find stations"; an inactive station is not in
  the SNOTEL list.
- **"The NRCS service (AWDB) does not answer"**: the API is down or refuses requests for a
  while; the readings come back on their own.
- **No snow depth on a device**: the station's sensor sends nothing (in summer, or broken);
  the other values keep coming.
- **No percentage of the median**: NRCS has no median for this station or this date.
- **Logs**: set `LOG_LEVEL=debug` to see every refresh. At the default level, only the start,
  stations going silent or coming back, and errors are logged.

## Limits

- Raw, provisional data: not an avalanche, flood or weather warning.
- New snow is computed from the snow depth, not measured: settling, wind and sensor noise make
  it approximate.
- This integration is not affiliated with the USDA or NRCS. SNOTEL is a program of the USDA NRCS.
